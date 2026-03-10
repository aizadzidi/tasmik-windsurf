import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { currentMonthKey, normalizeDateKey } from "@/lib/online/recurring";
import { fetchRecurringSnapshot } from "@/lib/online/recurringStore";
import { isMissingRelationError } from "@/lib/online/db";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";

type CreatePackageBody = {
  student_id?: string;
  course_id?: string;
  teacher_id?: string;
  slot_template_ids?: string[];
  effective_month?: string;
  source?: string;
  notes?: string | null;
};

const resolveTenantIdOrThrow = async (request: NextRequest) =>
  adminOperationSimple(async (client) => {
    const tenantId = await resolveTenantIdFromRequest(request, client);
    if (tenantId) return tenantId;
    const { data, error } = await client.from("tenants").select("id").limit(2);
    if (error) throw error;
    if (!data || data.length !== 1) throw new Error("Tenant context missing");
    return data[0].id;
  });

const ACTIVE_PACKAGE_STATUSES = new Set(["active", "pending_payment", "draft"]);

const toEffectiveMonthStart = (value: string) => {
  const normalized = normalizeDateKey(value);
  if (!normalized) return null;
  return `${normalized.slice(0, 7)}-01`;
};

const isPackageActiveForMonth = (
  row: { status: string; effective_month: string; effective_to: string | null },
  monthStart: string,
) => {
  if (!ACTIVE_PACKAGE_STATUSES.has(row.status)) return false;
  const effectiveMonth = normalizeDateKey(row.effective_month);
  const effectiveTo = normalizeDateKey(row.effective_to);
  if (!effectiveMonth) return false;
  if (effectiveMonth > monthStart) return false;
  if (effectiveTo && effectiveTo < monthStart) return false;
  return true;
};

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:online"]);
    if (!guard.ok) return guard.response;

    const body = (await request.json()) as CreatePackageBody;
    const studentId = (body.student_id ?? "").trim();
    const courseId = (body.course_id ?? "").trim();
    const teacherId = (body.teacher_id ?? "").trim();
    const slotTemplateIds = Array.from(
      new Set((Array.isArray(body.slot_template_ids) ? body.slot_template_ids : []).map((value) => String(value).trim()).filter(Boolean))
    );
    const effectiveMonthStart = toEffectiveMonthStart((body.effective_month ?? currentMonthKey()).trim());

    if (!studentId || !courseId || !teacherId || slotTemplateIds.length === 0) {
      return NextResponse.json(
        { error: "student_id, course_id, teacher_id, and slot_template_ids are required" },
        { status: 400 },
      );
    }
    if (!effectiveMonthStart) {
      return NextResponse.json(
        { error: "effective_month must be in YYYY-MM or YYYY-MM-DD format" },
        { status: 400 },
      );
    }

    const tenantId = await resolveTenantIdOrThrow(request);

    const payload = await adminOperationSimple(async (client) => {
      const snapshot = await fetchRecurringSnapshot(client, tenantId);
      const course = snapshot.courses.find((row) => row.id === courseId);
      if (!course) {
        throw new Error("Course not found.");
      }

      const templates = snapshot.templates.filter((template) => slotTemplateIds.includes(template.id));
      if (templates.length !== slotTemplateIds.length) {
        throw new Error("One or more slot templates were not found.");
      }
      if (templates.some((template) => template.course_id !== courseId)) {
        throw new Error("All selected slots must belong to the same course.");
      }

      const requiredCount = Math.max(course.sessions_per_week ?? templates.length, 1);
      if (slotTemplateIds.length !== requiredCount) {
        throw new Error(`This course requires exactly ${requiredCount} weekly slot(s).`);
      }

      const availabilityByTemplate = new Map(
        snapshot.teacherAvailability
          .filter((row) => row.teacher_id === teacherId)
          .map((row) => [row.slot_template_id, row.is_available])
      );
      if (templates.some((template) => availabilityByTemplate.get(template.id) !== true)) {
        throw new Error("Selected teacher is not available for all chosen slots.");
      }

      const activePackagesForMonth = snapshot.packages.filter((pkg) =>
        isPackageActiveForMonth(pkg, effectiveMonthStart),
      );

      const existing = activePackagesForMonth.find(
        (pkg) => pkg.student_id === studentId,
      );
      if (existing) {
        throw new Error("This student already has a package for the selected month.");
      }

      const teacherActivePackageIds = new Set(
        activePackagesForMonth
          .filter((pkg) => pkg.teacher_id === teacherId)
          .map((pkg) => pkg.id),
      );
      const occupiedTemplateIds = new Set(
        snapshot.packageSlots
          .filter(
            (slot) =>
              slot.status === "active" &&
              teacherActivePackageIds.has(slot.package_id),
          )
          .map((slot) => slot.slot_template_id),
      );
      if (templates.some((template) => occupiedTemplateIds.has(template.id))) {
        throw new Error("One or more selected slot times are already scheduled for this teacher.");
      }

      const packageStatus = body.source?.startsWith("parent") ? "pending_payment" : "active";
      const holdExpiresAt =
        packageStatus === "pending_payment" ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null;

      const insertPackage = await client
        .from("online_recurring_packages")
        .insert({
          tenant_id: tenantId,
          student_id: studentId,
          course_id: courseId,
          teacher_id: teacherId,
          status: packageStatus,
          source: body.source?.trim() || "admin_direct",
          effective_month: effectiveMonthStart,
          effective_from: effectiveMonthStart,
          sessions_per_week: requiredCount,
          monthly_fee_cents_snapshot: course.monthly_fee_cents ?? 0,
          notes: body.notes?.trim() || null,
          hold_expires_at: holdExpiresAt,
          created_by: guard.userId,
          updated_by: guard.userId,
        })
        .select("*")
        .single();

      if (insertPackage.error) throw insertPackage.error;

      const slotRows = templates.map((template) => ({
        tenant_id: tenantId,
        package_id: insertPackage.data.id,
        slot_template_id: template.id,
        day_of_week_snapshot: template.day_of_week,
        start_time_snapshot: template.start_time,
        duration_minutes_snapshot: template.duration_minutes,
        status: "active",
      }));

      const insertSlots = await client
        .from("online_recurring_package_slots")
        .insert(slotRows)
        .select("*");
      if (insertSlots.error) throw insertSlots.error;

      return {
        package: insertPackage.data,
        package_slots: insertSlots.data ?? [],
      };
    });

    return NextResponse.json(payload, { status: 201 });
  } catch (error: unknown) {
    console.error("Admin online package create error:", error);
    const message = error instanceof Error ? error.message : "Failed to create recurring package";
    if (
      isMissingRelationError(error as { message?: string }, "online_recurring_packages") ||
      isMissingRelationError(error as { message?: string }, "online_recurring_package_slots")
    ) {
      return NextResponse.json(
        { error: "Recurring package storage is not ready yet. Run the online attendance v2 migration first." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
