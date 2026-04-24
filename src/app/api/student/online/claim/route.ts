import { NextRequest, NextResponse } from "next/server";
import {
  getSharedTeacherCandidates,
  currentMonthKey,
  normalizeDateKey,
} from "@/lib/online/recurring";
import { fetchRecurringSnapshot } from "@/lib/online/recurringStore";
import { isMissingRelationError } from "@/lib/online/db";
import { requireAuthenticatedStudentTenantUser } from "@/lib/requestAuth";
import { supabaseService } from "@/lib/supabaseServiceClient";

type ClaimBody = {
  course_id?: string;
  slot_template_ids?: string[];
  effective_month?: string;
};

type ReleaseBody = {
  package_id?: string;
};

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
  const auth = await requireAuthenticatedStudentTenantUser(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as ClaimBody;
    const courseId = (body.course_id ?? "").trim();
    const slotTemplateIds = Array.from(
      new Set((Array.isArray(body.slot_template_ids) ? body.slot_template_ids : []).map(String).map((value) => value.trim()).filter(Boolean)),
    );
    const effectiveMonthStart = toEffectiveMonthStart(
      (body.effective_month ?? currentMonthKey()).trim(),
    );

    if (!courseId || slotTemplateIds.length === 0) {
      return NextResponse.json(
        { error: "course_id and slot_template_ids are required" },
        { status: 400 },
      );
    }
    if (!effectiveMonthStart) {
      return NextResponse.json(
        { error: "effective_month must be in YYYY-MM or YYYY-MM-DD format" },
        { status: 400 },
      );
    }

    const studentRes = await supabaseService
      .from("students")
      .select("id")
      .eq("tenant_id", auth.tenantId)
      .eq("id", auth.studentId)
      .eq("account_owner_user_id", auth.userId)
      .neq("record_type", "prospect")
      .maybeSingle();
    if (studentRes.error) throw studentRes.error;
    if (!studentRes.data?.id) {
      return NextResponse.json({ error: "Student profile not found." }, { status: 403 });
    }

    const snapshot = await fetchRecurringSnapshot(supabaseService, auth.tenantId);
    if (snapshot.warning) {
      return NextResponse.json(
        { error: "Recurring package storage is not ready yet. Run the online attendance v2 migration first." },
        { status: 503 },
      );
    }

    const course = snapshot.courses.find((row) => row.id === courseId && row.is_active);
    if (!course) {
      return NextResponse.json({ error: "Course not found." }, { status: 404 });
    }

    const templates = snapshot.templates.filter((template) => slotTemplateIds.includes(template.id));
    if (templates.length !== slotTemplateIds.length) {
      return NextResponse.json({ error: "One or more selected weekly slots were not found." }, { status: 404 });
    }
    if (templates.some((template) => template.course_id !== courseId || !template.is_active)) {
      return NextResponse.json(
        { error: "All selected weekly slots must belong to the same active course." },
        { status: 409 },
      );
    }

    const requiredCount = Math.max(course.sessions_per_week ?? templates.length, 1);
    if (slotTemplateIds.length !== requiredCount) {
      return NextResponse.json(
        { error: `This course requires exactly ${requiredCount} weekly slot(s).` },
        { status: 409 },
      );
    }

    const activePackagesForMonth = snapshot.packages.filter((pkg) =>
      isPackageActiveForMonth(pkg, effectiveMonthStart),
    );
    const existingPackage = activePackagesForMonth.find(
      (pkg) => pkg.student_id === auth.studentId,
    );
    if (existingPackage) {
      return NextResponse.json({ error: "You already have a package draft or active package for that month." }, { status: 409 });
    }

    const activePackageById = new Map(
      activePackagesForMonth.map((pkg) => [pkg.id, pkg] as const),
    );
    const occupiedTeacherSlotKeys = new Set(
      snapshot.packageSlots
        .filter(
          (slot) =>
            slot.status === "active" &&
            activePackageById.has(slot.package_id),
        )
        .map((slot) => {
          const pkg = activePackageById.get(slot.package_id)!;
          return `${pkg.teacher_id}:${slot.slot_template_id}`;
        }),
    );

    const sharedTeachers = getSharedTeacherCandidates({
      slotTemplateIds,
      teacherAvailability: snapshot.teacherAvailability,
      activePackages: snapshot.packages,
    });
    const assignedTeacher =
      sharedTeachers.find((teacher) =>
        slotTemplateIds.every(
          (slotTemplateId) =>
            !occupiedTeacherSlotKeys.has(`${teacher.teacherId}:${slotTemplateId}`),
        ),
      ) ?? null;
    if (!assignedTeacher) {
      return NextResponse.json({ error: "No teacher is available for the selected package slots." }, { status: 409 });
    }

    const holdExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const insertPackageRes = await supabaseService
      .from("online_recurring_packages")
      .insert({
        tenant_id: auth.tenantId,
        student_id: auth.studentId,
        course_id: courseId,
        teacher_id: assignedTeacher.teacherId,
        status: "pending_payment",
        source: "student_self_pick",
        effective_month: effectiveMonthStart,
        effective_from: effectiveMonthStart,
        sessions_per_week: requiredCount,
        monthly_fee_cents_snapshot: course.monthly_fee_cents ?? 0,
        hold_expires_at: holdExpiresAt,
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("*")
      .single();
    if (insertPackageRes.error) throw insertPackageRes.error;

    const insertSlotRows = await supabaseService
      .from("online_recurring_package_slots")
      .insert(
        templates.map((template) => ({
          tenant_id: auth.tenantId,
          package_id: insertPackageRes.data.id,
          slot_template_id: template.id,
          day_of_week_snapshot: template.day_of_week,
          start_time_snapshot: template.start_time,
          duration_minutes_snapshot: template.duration_minutes,
          status: "active",
        })),
      )
      .select("*");
    if (insertSlotRows.error) throw insertSlotRows.error;

    return NextResponse.json({
      ok: true,
      code: "claimed",
      package_id: insertPackageRes.data.id,
      assigned_teacher_id: assignedTeacher.teacherId,
      seat_hold_expires_at: holdExpiresAt,
      package_slots: insertSlotRows.data ?? [],
    });
  } catch (error: unknown) {
    console.error("Student online package claim error:", error);
    if (
      isMissingRelationError(error as { message?: string }, "online_recurring_packages") ||
      isMissingRelationError(error as { message?: string }, "online_recurring_package_slots")
    ) {
      return NextResponse.json(
        { error: "Online package enrollment is not configured yet. Please contact support." },
        { status: 503 },
      );
    }
    const message = error instanceof Error ? error.message : "Failed to claim package";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuthenticatedStudentTenantUser(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as ReleaseBody;
    const packageId = (body.package_id ?? "").trim();
    if (!packageId) {
      return NextResponse.json({ error: "package_id is required" }, { status: 400 });
    }

    const packageRes = await supabaseService
      .from("online_recurring_packages")
      .select("id, student_id, status")
      .eq("tenant_id", auth.tenantId)
      .eq("id", packageId)
      .maybeSingle();
    if (packageRes.error) throw packageRes.error;
    if (!packageRes.data?.id) {
      return NextResponse.json({ error: "Package draft not found." }, { status: 404 });
    }

    if (packageRes.data.student_id !== auth.studentId) {
      return NextResponse.json({ error: "Package draft not found." }, { status: 404 });
    }
    if (packageRes.data.status === "active") {
      return NextResponse.json({ error: "Active packages cannot be released directly." }, { status: 409 });
    }

    const deleteSlotRes = await supabaseService
      .from("online_recurring_package_slots")
      .delete()
      .eq("tenant_id", auth.tenantId)
      .eq("package_id", packageId);
    if (deleteSlotRes.error) throw deleteSlotRes.error;

    const deletePackageRes = await supabaseService
      .from("online_recurring_packages")
      .delete()
      .eq("tenant_id", auth.tenantId)
      .eq("id", packageId)
      .neq("status", "active");
    if (deletePackageRes.error) throw deletePackageRes.error;

    return NextResponse.json({ ok: true, code: "released" });
  } catch (error: unknown) {
    console.error("Student online package release error:", error);
    const message = error instanceof Error ? error.message : "Failed to release package";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
