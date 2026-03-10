import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { nextMonthKey } from "@/lib/online/recurring";
import { fetchRecurringSnapshot } from "@/lib/online/recurringStore";
import { isMissingRelationError } from "@/lib/online/db";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";

type PackageChangeBody = {
  student_id?: string;
  current_package_id?: string;
  next_month_slot_template_ids?: string[];
  next_month_course_id?: string;
  effective_month?: string;
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

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:online"]);
    if (!guard.ok) return guard.response;

    const body = (await request.json()) as PackageChangeBody;
    const studentId = (body.student_id ?? "").trim();
    const currentPackageId = (body.current_package_id ?? "").trim();
    const nextCourseId = (body.next_month_course_id ?? "").trim();
    const slotTemplateIds = Array.from(
      new Set((Array.isArray(body.next_month_slot_template_ids) ? body.next_month_slot_template_ids : []).map(String).map((value) => value.trim()).filter(Boolean))
    );

    if (!studentId || !currentPackageId || !nextCourseId || slotTemplateIds.length === 0) {
      return NextResponse.json(
        { error: "student_id, current_package_id, next_month_course_id, and next_month_slot_template_ids are required" },
        { status: 400 },
      );
    }

    const tenantId = await resolveTenantIdOrThrow(request);
    const payload = await adminOperationSimple(async (client) => {
      const snapshot = await fetchRecurringSnapshot(client, tenantId);
      const currentPackage = snapshot.packages.find((pkg) => pkg.id === currentPackageId && pkg.student_id === studentId);
      if (!currentPackage) throw new Error("Current package not found.");

      const course = snapshot.courses.find((row) => row.id === nextCourseId);
      if (!course) throw new Error("Next course not found.");
      const templates = snapshot.templates.filter((row) => slotTemplateIds.includes(row.id));
      if (templates.length !== slotTemplateIds.length) {
        throw new Error("One or more next-month slot templates were not found.");
      }
      if (templates.some((row) => row.course_id !== nextCourseId)) {
        throw new Error("All next-month slots must belong to the same course.");
      }

      const requiredCount = Math.max(course.sessions_per_week ?? templates.length, 1);
      if (slotTemplateIds.length !== requiredCount) {
        throw new Error(`This course requires exactly ${requiredCount} weekly slot(s).`);
      }

      const teacherId = currentPackage.teacher_id;
      const availabilityByTemplate = new Map(
        snapshot.teacherAvailability
          .filter((row) => row.teacher_id === teacherId)
          .map((row) => [row.slot_template_id, row.is_available]),
      );
      if (templates.some((template) => availabilityByTemplate.get(template.id) !== true)) {
        throw new Error("Selected teacher is not available for all next-month slots.");
      }

      const effectiveMonth =
        (body.effective_month ?? `${nextMonthKey(String(currentPackage.effective_month).slice(0, 7))}-01`).trim();
      const pricingDelta = (course.monthly_fee_cents ?? 0) - (currentPackage.monthly_fee_cents_snapshot ?? 0);
      const billingStatus = pricingDelta > 0 ? "pending_payment" : pricingDelta < 0 ? "credit_due" : "not_required";
      const requestStatus = pricingDelta > 0 ? "pending_payment" : "scheduled";

      const draftPackageRes = await client
        .from("online_recurring_packages")
        .insert({
          tenant_id: tenantId,
          student_id: currentPackage.student_id,
          course_id: nextCourseId,
          teacher_id: teacherId,
          status: "draft",
          source: "admin_next_month_change",
          effective_month: effectiveMonth,
          effective_from: effectiveMonth,
          sessions_per_week: requiredCount,
          monthly_fee_cents_snapshot: course.monthly_fee_cents ?? 0,
          notes: currentPackage.notes ?? null,
          created_by: guard.userId,
          updated_by: guard.userId,
        })
        .select("*")
        .single();
      if (draftPackageRes.error) throw draftPackageRes.error;

      const draftSlotsRes = await client
        .from("online_recurring_package_slots")
        .insert(
          templates.map((template) => ({
            tenant_id: tenantId,
            package_id: draftPackageRes.data.id,
            slot_template_id: template.id,
            day_of_week_snapshot: template.day_of_week,
            start_time_snapshot: template.start_time,
            duration_minutes_snapshot: template.duration_minutes,
            status: "active",
          })),
        )
        .select("*");
      if (draftSlotsRes.error) throw draftSlotsRes.error;

      const changeRequestRes = await client
        .from("online_package_change_requests")
        .insert({
          tenant_id: tenantId,
          student_id: studentId,
          current_package_id: currentPackageId,
          next_package_id_draft: draftPackageRes.data.id,
          requested_by: guard.userId,
          effective_month: effectiveMonth,
          pricing_delta_cents: pricingDelta,
          billing_status: billingStatus,
          status: requestStatus,
        })
        .select("*")
        .single();
      if (changeRequestRes.error) throw changeRequestRes.error;

      return {
        package_change_request: changeRequestRes.data,
        draft_package: draftPackageRes.data,
        draft_package_slots: draftSlotsRes.data ?? [],
      };
    });

    return NextResponse.json(payload, { status: 201 });
  } catch (error: unknown) {
    console.error("Admin online package change error:", error);
    const message = error instanceof Error ? error.message : "Failed to schedule package change";
    if (
      isMissingRelationError(error as { message?: string }, "online_package_change_requests") ||
      isMissingRelationError(error as { message?: string }, "online_recurring_packages")
    ) {
      return NextResponse.json(
        { error: "Recurring package change storage is not ready yet. Run the online attendance v2 migration first." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
