import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
import { isMissingColumnError } from "@/lib/online/db";
import {
  fetchOnlineStudentPackageAssignments,
  MANAGEABLE_ASSIGNMENT_STATUSES,
} from "@/lib/online/packageAssignments";
import { normalizeDateKey } from "@/lib/online/recurring";
import type { OnlineStudentPackageAssignmentStatus, OnlineRecurringPackageStatus } from "@/types/online";

type UpdateAssignmentBody = {
  course_id?: string;
  teacher_id?: string;
  status?: OnlineStudentPackageAssignmentStatus;
  effective_from?: string;
  effective_to?: string | null;
  notes?: string | null;
};

type CourseSnapshot = {
  id: string;
  sessions_per_week: number;
  monthly_fee_cents: number;
  default_slot_duration_minutes: number;
};

type RecurringPackageLinkRow = {
  id: string;
  status: OnlineRecurringPackageStatus;
  student_id: string;
  course_id: string;
  teacher_id: string;
  student_package_assignment_id: string | null;
};

const LINKABLE_RECURRING_STATUSES: OnlineRecurringPackageStatus[] = [
  "draft",
  "pending_payment",
  "active",
  "paused",
  "legacy_review_required",
];

const resolveTenantIdOrThrow = async (request: NextRequest) =>
  adminOperationSimple(async (client) => {
    const tenantId = await resolveTenantIdFromRequest(request, client);
    if (tenantId) return tenantId;
    const { data, error } = await client.from("tenants").select("id").limit(2);
    if (error) throw error;
    if (!data || data.length !== 1) throw new Error("Tenant context missing");
    return data[0].id;
  });

const adminErrorDetails = (error: unknown, fallback: string) => {
  let message = fallback;
  if (error instanceof Error) {
    message = error.message;
  } else if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    message = (error as { message: string }).message;
  }
  const status = message.includes("Admin access required") ? 403 : 500;
  return { message, status };
};

const normalizeEffectiveDate = (value?: string | null) => {
  const normalized = normalizeDateKey(value ?? null);
  return normalized ? normalized.slice(0, 10) : null;
};

const isAllowedStatus = (value: string): value is OnlineStudentPackageAssignmentStatus =>
  value === "draft" || value === "pending_payment" || value === "active" || value === "paused" || value === "cancelled";

const recurringStatusFromAssignment = (status: OnlineStudentPackageAssignmentStatus): OnlineRecurringPackageStatus => {
  if (status === "pending_payment") return "pending_payment";
  if (status === "paused") return "paused";
  if (status === "draft") return "draft";
  if (status === "cancelled") return "cancelled";
  return "active";
};

const loadCourseSnapshot = async (
  client: Pick<SupabaseClient, "from">,
  tenantId: string,
  courseId: string,
): Promise<CourseSnapshot> => {
  const courseRes = await client
    .from("online_courses")
    .select("id, sessions_per_week, monthly_fee_cents, default_slot_duration_minutes")
    .eq("tenant_id", tenantId)
    .eq("id", courseId)
    .maybeSingle();

  if (!courseRes.error && courseRes.data?.id) {
    return {
      id: String(courseRes.data.id),
      sessions_per_week: Math.max(Number(courseRes.data.sessions_per_week) || 1, 1),
      monthly_fee_cents: Number(courseRes.data.monthly_fee_cents) || 0,
      default_slot_duration_minutes:
        Number(courseRes.data.default_slot_duration_minutes) > 0
          ? Number(courseRes.data.default_slot_duration_minutes)
          : 30,
    };
  }

  if (courseRes.error && !isMissingColumnError(courseRes.error, "default_slot_duration_minutes", "online_courses")) {
    throw courseRes.error;
  }

  const fallbackRes = await client
    .from("online_courses")
    .select("id, sessions_per_week, monthly_fee_cents")
    .eq("tenant_id", tenantId)
    .eq("id", courseId)
    .maybeSingle();
  if (fallbackRes.error) throw fallbackRes.error;
  if (!fallbackRes.data?.id) throw new Error("Course not found.");

  return {
    id: String(fallbackRes.data.id),
    sessions_per_week: Math.max(Number(fallbackRes.data.sessions_per_week) || 1, 1),
    monthly_fee_cents: Number(fallbackRes.data.monthly_fee_cents) || 0,
    default_slot_duration_minutes: 30,
  };
};

const loadRecurringPackagesForAssignment = async (params: {
  client: Pick<SupabaseClient, "from">;
  tenantId: string;
  assignmentId: string;
  studentId: string;
  courseId: string;
  teacherId: string;
}) => {
  const [linkedRes, legacyRes] = await Promise.all([
    params.client
      .from("online_recurring_packages")
      .select("id, status, student_id, course_id, teacher_id, student_package_assignment_id")
      .eq("tenant_id", params.tenantId)
      .eq("student_package_assignment_id", params.assignmentId),
    params.client
      .from("online_recurring_packages")
      .select("id, status, student_id, course_id, teacher_id, student_package_assignment_id")
      .eq("tenant_id", params.tenantId)
      .eq("student_id", params.studentId)
      .eq("teacher_id", params.teacherId)
      .eq("course_id", params.courseId)
      .is("student_package_assignment_id", null)
      .in("status", LINKABLE_RECURRING_STATUSES),
  ]);
  if (linkedRes.error) throw linkedRes.error;
  if (legacyRes.error) throw legacyRes.error;

  const packageById = new Map<string, RecurringPackageLinkRow>();
  [...(linkedRes.data ?? []), ...(legacyRes.data ?? [])].forEach((row) => {
    packageById.set(String(row.id), row as RecurringPackageLinkRow);
  });

  return Array.from(packageById.values());
};

const cancelLinkedRecurringPackages = async (params: {
  client: Pick<SupabaseClient, "from">;
  tenantId: string;
  packageIds: string[];
  effectiveTo: string;
  updatedBy: string;
}) => {
  if (params.packageIds.length === 0) return;
  const timestamp = new Date().toISOString();
  const todayKey = timestamp.slice(0, 10);

  const slotRes = await params.client
    .from("online_recurring_package_slots")
    .update({ status: "cancelled", updated_at: timestamp })
    .eq("tenant_id", params.tenantId)
    .in("package_id", params.packageIds);
  if (slotRes.error) throw slotRes.error;

  const occurrenceRes = await params.client
    .from("online_recurring_occurrences")
    .update({ cancelled_at: timestamp, updated_at: timestamp })
    .eq("tenant_id", params.tenantId)
    .in("package_id", params.packageIds)
    .is("cancelled_at", null)
    .gte("session_date", todayKey);
  if (occurrenceRes.error) throw occurrenceRes.error;

  const packageRes = await params.client
    .from("online_recurring_packages")
    .update({
      status: "cancelled",
      effective_to: params.effectiveTo,
      updated_at: timestamp,
      updated_by: params.updatedBy,
    })
    .eq("tenant_id", params.tenantId)
    .in("id", params.packageIds);
  if (packageRes.error) throw packageRes.error;
};

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireAdminPermission(request, ["admin:online"]);
    if (!guard.ok) return guard.response;

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const body = (await request.json()) as UpdateAssignmentBody;
    const nextStatusRaw = body.status?.trim();
    if (nextStatusRaw && !isAllowedStatus(nextStatusRaw)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const tenantId = await resolveTenantIdOrThrow(request);
    const payload = await adminOperationSimple(async (client) => {
      const assignmentRes = await client
        .from("online_student_package_assignments")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .maybeSingle();
      if (assignmentRes.error) throw assignmentRes.error;
      if (!assignmentRes.data?.id) throw new Error("Package assignment not found.");

      const assignment = assignmentRes.data;
      const requestedCourseId = (body.course_id ?? "").trim() || assignment.course_id;
      const requestedTeacherId = (body.teacher_id ?? "").trim() || assignment.teacher_id;
      const requestedStatus = (nextStatusRaw ?? assignment.status) as OnlineStudentPackageAssignmentStatus;
      const requestedEffectiveFrom = normalizeEffectiveDate(body.effective_from) ?? assignment.effective_from;
      const requestedEffectiveTo =
        body.effective_to === undefined
          ? assignment.effective_to
          : normalizeEffectiveDate(body.effective_to);
      const requestedNotes = body.notes === undefined ? assignment.notes : body.notes?.trim() || null;

      if (requestedEffectiveTo && requestedEffectiveTo < requestedEffectiveFrom) {
        throw new Error("effective_to must be on or after effective_from");
      }

      const linkedPackages = await loadRecurringPackagesForAssignment({
        client,
        tenantId,
        assignmentId: id,
        studentId: assignment.student_id,
        courseId: assignment.course_id,
        teacherId: assignment.teacher_id,
      });
      const linkedPackageIds = linkedPackages.map((row) => String(row.id));

      let hasActiveSlots = false;
      if (linkedPackageIds.length > 0) {
        const linkedSlotRes = await client
          .from("online_recurring_package_slots")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("status", "active")
          .in("package_id", linkedPackageIds)
          .limit(1);
        if (linkedSlotRes.error) throw linkedSlotRes.error;
        hasActiveSlots = (linkedSlotRes.data ?? []).length > 0;
      }

      if (
        hasActiveSlots &&
        (requestedCourseId !== assignment.course_id || requestedTeacherId !== assignment.teacher_id)
      ) {
        throw new Error("Remove or move existing slots before changing course or teacher for this package.");
      }

      const [teacherRes, courseSnapshot] = await Promise.all([
        client
          .from("users")
          .select("id, role")
          .eq("id", requestedTeacherId)
          .maybeSingle(),
        requestedCourseId !== assignment.course_id
          ? loadCourseSnapshot(client, tenantId, requestedCourseId)
          : Promise.resolve({
              id: assignment.course_id,
              sessions_per_week: Number(assignment.sessions_per_week_snapshot) || 1,
              monthly_fee_cents: Number(assignment.monthly_fee_cents_snapshot) || 0,
              default_slot_duration_minutes: Number(assignment.duration_minutes_snapshot) || 30,
            }),
      ]);
      if (teacherRes.error) throw teacherRes.error;
      if (!teacherRes.data?.id || teacherRes.data.role !== "teacher") {
        throw new Error("Teacher not found.");
      }

      if (MANAGEABLE_ASSIGNMENT_STATUSES.includes(requestedStatus)) {
        const duplicateRes = await client
          .from("online_student_package_assignments")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("student_id", assignment.student_id)
          .eq("course_id", requestedCourseId)
          .in("status", MANAGEABLE_ASSIGNMENT_STATUSES)
          .neq("id", id)
          .limit(1);
        if (duplicateRes.error) throw duplicateRes.error;
        if ((duplicateRes.data ?? []).length > 0) {
          throw new Error("This student already has an active package assignment for this course.");
        }
      }

      const updateRes = await client
        .from("online_student_package_assignments")
        .update({
          course_id: requestedCourseId,
          teacher_id: requestedTeacherId,
          status: requestedStatus,
          effective_from: requestedEffectiveFrom,
          effective_to: requestedEffectiveTo,
          sessions_per_week_snapshot: courseSnapshot.sessions_per_week,
          duration_minutes_snapshot: courseSnapshot.default_slot_duration_minutes,
          monthly_fee_cents_snapshot: courseSnapshot.monthly_fee_cents,
          notes: requestedNotes,
          updated_by: guard.userId,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .select("id, student_id")
        .single();
      if (updateRes.error) throw updateRes.error;

      if (requestedStatus === "cancelled") {
        await cancelLinkedRecurringPackages({
          client,
          tenantId,
          packageIds: linkedPackageIds,
          effectiveTo: requestedEffectiveTo ?? new Date().toISOString().slice(0, 10),
          updatedBy: guard.userId,
        });
      } else if (linkedPackageIds.length > 0) {
        const packageStatus = recurringStatusFromAssignment(requestedStatus);
        const recurringUpdateRes = await client
          .from("online_recurring_packages")
          .update({
            student_package_assignment_id: id,
            course_id: requestedCourseId,
            teacher_id: requestedTeacherId,
            status: packageStatus,
            effective_from: requestedEffectiveFrom,
            effective_to: requestedEffectiveTo,
            sessions_per_week: courseSnapshot.sessions_per_week,
            monthly_fee_cents_snapshot: courseSnapshot.monthly_fee_cents,
            notes: requestedNotes,
            updated_at: new Date().toISOString(),
            updated_by: guard.userId,
          })
          .eq("tenant_id", tenantId)
          .in("id", linkedPackageIds);
        if (recurringUpdateRes.error) throw recurringUpdateRes.error;
      }

      const summaryRes = await fetchOnlineStudentPackageAssignments({
        client,
        tenantId,
        studentIds: [updateRes.data.student_id],
      });
      return {
        assignment: summaryRes.rows.find((row) => row.id === id) ?? null,
      };
    });

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("Admin online package assignment update error:", error);
    const { message, status } = adminErrorDetails(error, "Failed to update online package assignment");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireAdminPermission(request, ["admin:online"]);
    if (!guard.ok) return guard.response;

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const tenantId = await resolveTenantIdOrThrow(request);
    const payload = await adminOperationSimple(async (client) => {
      const assignmentRes = await client
        .from("online_student_package_assignments")
        .select("id, student_id, course_id, teacher_id")
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .maybeSingle();
      if (assignmentRes.error) throw assignmentRes.error;
      if (!assignmentRes.data?.id) throw new Error("Package assignment not found.");

      // Find both linked and legacy recurring packages
      const allPackages = await loadRecurringPackagesForAssignment({
        client,
        tenantId,
        assignmentId: id,
        studentId: assignmentRes.data.student_id,
        courseId: assignmentRes.data.course_id,
        teacherId: assignmentRes.data.teacher_id,
      });
      const linkedPackageIds = allPackages.map((p) => String(p.id));

      const effectiveTo = new Date().toISOString().slice(0, 10);
      const updateRes = await client
        .from("online_student_package_assignments")
        .update({
          status: "cancelled",
          effective_to: effectiveTo,
          updated_by: guard.userId,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .select("id, student_id")
        .single();
      if (updateRes.error) throw updateRes.error;

      await cancelLinkedRecurringPackages({
        client,
        tenantId,
        packageIds: linkedPackageIds,
        effectiveTo,
        updatedBy: guard.userId,
      });

      const summaryRes = await fetchOnlineStudentPackageAssignments({
        client,
        tenantId,
        studentIds: [assignmentRes.data.student_id],
      });
      return {
        assignment: summaryRes.rows.find((row) => row.id === id) ?? null,
      };
    });

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("Admin online package assignment delete error:", error);
    const { message, status } = adminErrorDetails(error, "Failed to delete online package assignment");
    return NextResponse.json({ error: message }, { status });
  }
}
