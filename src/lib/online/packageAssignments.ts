import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumnError, isMissingRelationError } from "@/lib/online/db";
import type {
  OnlineRecurringPackage,
  OnlineStudentPackageAssignment,
  OnlineStudentPackageAssignmentStatus,
} from "@/types/online";

type ClientLike = Pick<SupabaseClient, "from">;

export type OnlineStudentPackageScheduleState = "scheduled" | "partially_scheduled" | "waiting_for_slot" | "cancelled";

export type OnlineStudentPackageAssignmentSummary = OnlineStudentPackageAssignment & {
  student_name: string;
  parent_name: string | null;
  parent_contact_number: string | null;
  course_name: string;
  teacher_name: string;
  schedule_state: OnlineStudentPackageScheduleState;
  scheduled_slot_count: number;
  linked_recurring_package_id: string | null;
  linked_recurring_package_status: OnlineRecurringPackage["status"] | null;
};

const ACTIVE_PACKAGE_STATUSES = new Set<OnlineRecurringPackage["status"]>([
  "draft",
  "pending_payment",
  "active",
  "paused",
  "legacy_review_required",
]);

const buildAssignmentMatchKey = (row: {
  student_id: string;
  teacher_id: string;
  course_id: string;
}) => `${row.student_id}:${row.teacher_id}:${row.course_id}`;

export const SCHEDULABLE_ASSIGNMENT_STATUSES: OnlineStudentPackageAssignmentStatus[] = [
  "active",
  "pending_payment",
];

export const MANAGEABLE_ASSIGNMENT_STATUSES: OnlineStudentPackageAssignmentStatus[] = [
  "draft",
  "pending_payment",
  "active",
  "paused",
];

export const isMissingPackageAssignmentsSetupError = (error: { message?: string } | null | undefined) =>
  isMissingRelationError(error, "online_student_package_assignments") ||
  isMissingColumnError(error, "student_package_assignment_id", "online_recurring_packages");

export const fetchOnlineStudentPackageAssignments = async (params: {
  client: ClientLike;
  tenantId: string;
  studentIds?: string[];
  teacherId?: string | null;
  statuses?: OnlineStudentPackageAssignmentStatus[];
}) => {
  const { client, tenantId } = params;
  let query = client
    .from("online_student_package_assignments")
    .select(
      "id, tenant_id, student_id, course_id, teacher_id, status, effective_from, effective_to, sessions_per_week_snapshot, duration_minutes_snapshot, monthly_fee_cents_snapshot, notes, created_by, updated_by, created_at, updated_at"
    )
    .eq("tenant_id", tenantId)
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false });

  if (params.studentIds && params.studentIds.length > 0) {
    query = query.in("student_id", params.studentIds);
  }
  if (params.teacherId) {
    query = query.eq("teacher_id", params.teacherId);
  }
  if (params.statuses && params.statuses.length > 0) {
    query = query.in("status", params.statuses);
  }

  const assignmentRes = await query;
  if (assignmentRes.error) {
    if (isMissingPackageAssignmentsSetupError(assignmentRes.error)) {
      return { rows: [] as OnlineStudentPackageAssignmentSummary[], warning: "Online package assignments are not configured yet. Run the latest online package assignment migration first." };
    }
    throw assignmentRes.error;
  }

  const assignments = (assignmentRes.data ?? []) as OnlineStudentPackageAssignment[];
  if (assignments.length === 0) {
    return { rows: [] as OnlineStudentPackageAssignmentSummary[] };
  }

  const studentIds = Array.from(new Set(assignments.map((row) => row.student_id)));
  const teacherIds = Array.from(new Set(assignments.map((row) => row.teacher_id)));
  const courseIds = Array.from(new Set(assignments.map((row) => row.course_id)));
  const [studentRes, teacherRes, courseRes, recurringPackageRes] = await Promise.all([
    client
      .from("students")
      .select("id, name, parent_name, parent_contact_number")
      .eq("tenant_id", tenantId)
      .in("id", studentIds),
    client
      .from("users")
      .select("id, name")
      .in("id", teacherIds),
    client
      .from("online_courses")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .in("id", courseIds),
    client
      .from("online_recurring_packages")
      .select(
        "id, tenant_id, student_id, course_id, teacher_id, student_package_assignment_id, status, source, effective_month, effective_from, effective_to, sessions_per_week, monthly_fee_cents_snapshot, notes, hold_expires_at, created_by, updated_by, created_at, updated_at"
      )
      .eq("tenant_id", tenantId)
      .in("student_id", studentIds),
  ]);

  if (studentRes.error) throw studentRes.error;
  if (teacherRes.error) throw teacherRes.error;
  if (courseRes.error) throw courseRes.error;
  if (recurringPackageRes.error) {
    if (!isMissingPackageAssignmentsSetupError(recurringPackageRes.error)) {
      throw recurringPackageRes.error;
    }
  }

  const recurringPackages = (recurringPackageRes.data ?? []) as OnlineRecurringPackage[];
  const recurringPackageIds = recurringPackages.map((row) => row.id);
  const activeSlotCountByPackageId = new Map<string, number>();

  if (recurringPackageIds.length > 0) {
    const slotRes = await client
      .from("online_recurring_package_slots")
      .select("package_id")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .in("package_id", recurringPackageIds);
    if (slotRes.error) throw slotRes.error;
    (slotRes.data ?? []).forEach((row) => {
      const packageId = String(row.package_id ?? "");
      if (!packageId) return;
      activeSlotCountByPackageId.set(packageId, (activeSlotCountByPackageId.get(packageId) ?? 0) + 1);
    });
  }

  const studentById = new Map(
    (studentRes.data ?? []).map((row) => [String(row.id), {
      name: row.name ?? "Student",
      parent_name: row.parent_name ?? null,
      parent_contact_number: row.parent_contact_number ?? null,
    }]),
  );
  const teacherById = new Map((teacherRes.data ?? []).map((row) => [String(row.id), row.name ?? "Unnamed Teacher"]));
  const courseById = new Map((courseRes.data ?? []).map((row) => [String(row.id), row.name ?? "Online Course"]));
  const assignmentIdsByMatchKey = new Map<string, string[]>();
  assignments.forEach((assignment) => {
    const matchKey = buildAssignmentMatchKey(assignment);
    const current = assignmentIdsByMatchKey.get(matchKey) ?? [];
    current.push(assignment.id);
    assignmentIdsByMatchKey.set(matchKey, current);
  });

  const packageMetaByAssignmentId = new Map<
    string,
    { linked_recurring_package_id: string | null; linked_recurring_package_status: OnlineRecurringPackage["status"] | null; scheduled_slot_count: number }
  >();

  recurringPackages
    .filter((row) => ACTIVE_PACKAGE_STATUSES.has(row.status))
    .forEach((row) => {
      const assignmentId =
        String(row.student_package_assignment_id ?? "") ||
        assignmentIdsByMatchKey.get(buildAssignmentMatchKey(row))?.[0] ||
        "";
      if (!assignmentId) return;
      const current = packageMetaByAssignmentId.get(assignmentId) ?? {
        linked_recurring_package_id: null,
        linked_recurring_package_status: null,
        scheduled_slot_count: 0,
      };

      const activeSlotCount = activeSlotCountByPackageId.get(row.id) ?? 0;
      const nextCount = current.scheduled_slot_count + activeSlotCount;
      const shouldReplace =
        current.linked_recurring_package_id === null ||
        (activeSlotCount > 0 && current.scheduled_slot_count === 0) ||
        row.created_at > (recurringPackages.find((pkg) => pkg.id === current.linked_recurring_package_id)?.created_at ?? "");

      packageMetaByAssignmentId.set(assignmentId, {
        linked_recurring_package_id: shouldReplace ? row.id : current.linked_recurring_package_id,
        linked_recurring_package_status: shouldReplace ? row.status : current.linked_recurring_package_status,
        scheduled_slot_count: nextCount,
      });
    });

  const rows = assignments.map<OnlineStudentPackageAssignmentSummary>((assignment) => {
    const student = studentById.get(assignment.student_id);
    const packageMeta = packageMetaByAssignmentId.get(assignment.id);
    const scheduledSlotCount = packageMeta?.scheduled_slot_count ?? 0;
    return {
      ...assignment,
      student_name: student?.name ?? "Student",
      parent_name: student?.parent_name ?? null,
      parent_contact_number: student?.parent_contact_number ?? null,
      course_name: courseById.get(assignment.course_id) ?? "Online Course",
      teacher_name: teacherById.get(assignment.teacher_id) ?? "Unnamed Teacher",
      schedule_state:
        assignment.status === "cancelled"
          ? "cancelled"
          : scheduledSlotCount >= assignment.sessions_per_week_snapshot
            ? "scheduled"
            : scheduledSlotCount > 0
              ? "partially_scheduled"
              : "waiting_for_slot",
      scheduled_slot_count: scheduledSlotCount,
      linked_recurring_package_id: packageMeta?.linked_recurring_package_id ?? null,
      linked_recurring_package_status: packageMeta?.linked_recurring_package_status ?? null,
    };
  });

  return { rows };
};
