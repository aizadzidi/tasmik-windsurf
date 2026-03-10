import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumnError, isMissingRelationError } from "@/lib/online/db";
import {
  DEFAULT_ONLINE_SLOT_DURATION,
  ONLINE_RECURRING_SETUP_WARNING,
  currentMonthKey,
  monthStartFromKey,
  nextMonthKey,
  normalizeDateKey,
  type OnlinePlannerPackage,
  type OnlineSlotTemplateRow,
  type OnlineStudentLite,
  type OnlineTeacherAvailabilityRow,
} from "@/lib/online/recurring";
import type {
  OnlineCourse,
  OnlinePackageChangeRequest,
  OnlineRecurringOccurrence,
  OnlineRecurringPackage,
  OnlineRecurringPackageSlot,
} from "@/types/online";

type SupabaseLike = Pick<SupabaseClient, "from">;

type SnapshotResult = {
  warning?: string;
  courses: OnlineCourse[];
  templates: OnlineSlotTemplateRow[];
  teacherAvailability: OnlineTeacherAvailabilityRow[];
  packages: OnlineRecurringPackage[];
  packageSlots: OnlineRecurringPackageSlot[];
  students: OnlineStudentLite[];
  packageChangeRequests: OnlinePackageChangeRequest[];
};

const isSafeRecurringFallbackError = (error: { message?: string } | null | undefined, table: string) =>
  isMissingRelationError(error, table) ||
  isMissingColumnError(error, "tenant_id", table) ||
  isMissingColumnError(error, "effective_month", table) ||
  isMissingColumnError(error, "teacher_id", table) ||
  isMissingColumnError(error, "student_id", table) ||
  isMissingColumnError(error, "slot_template_id", table) ||
  isMissingColumnError(error, "status", table) ||
  isMissingColumnError(error, "hold_expires_at", table) ||
  isMissingColumnError(error, "monthly_fee_cents_snapshot", table) ||
  isMissingColumnError(error, "default_slot_duration_minutes", "online_courses");

const toCourseRows = async (client: SupabaseLike, tenantId: string) => {
  const response = await client
    .from("online_courses")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  if (response.error) {
    if (isSafeRecurringFallbackError(response.error, "online_courses")) {
      return [] as OnlineCourse[];
    }
    throw response.error;
  }

  return ((response.data ?? []) as OnlineCourse[]).map((row) => ({
    ...row,
    default_slot_duration_minutes: DEFAULT_ONLINE_SLOT_DURATION,
    ...((row.default_slot_duration_minutes ?? 0) > 0
      ? { default_slot_duration_minutes: row.default_slot_duration_minutes }
      : {}),
  }));
};

const toTemplateRows = async (client: SupabaseLike, tenantId: string) => {
  const response = await client
    .from("online_slot_templates")
    .select("id, course_id, day_of_week, start_time, duration_minutes, timezone, is_active")
    .eq("tenant_id", tenantId)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  if (response.error) {
    if (isSafeRecurringFallbackError(response.error, "online_slot_templates")) {
      return [] as OnlineSlotTemplateRow[];
    }
    throw response.error;
  }

  return (response.data ?? []) as OnlineSlotTemplateRow[];
};

const toTeacherAvailabilityRows = async (client: SupabaseLike, tenantId: string) => {
  const withAssigned = await client
    .from("online_teacher_slot_preferences")
    .select("slot_template_id, teacher_id, is_available, last_assigned_at")
    .eq("tenant_id", tenantId);

  if (!withAssigned.error) {
    return (withAssigned.data ?? []) as OnlineTeacherAvailabilityRow[];
  }

  if (!isSafeRecurringFallbackError(withAssigned.error, "online_teacher_slot_preferences")) {
    throw withAssigned.error;
  }

  const fallback = await client
    .from("online_teacher_slot_preferences")
    .select("slot_template_id, teacher_id, is_available")
    .eq("tenant_id", tenantId);
  if (fallback.error) {
    if (isSafeRecurringFallbackError(fallback.error, "online_teacher_slot_preferences")) {
      return [] as OnlineTeacherAvailabilityRow[];
    }
    throw fallback.error;
  }

  return ((fallback.data ?? []) as Array<{
    slot_template_id: string;
    teacher_id: string;
    is_available: boolean;
  }>).map((row) => ({ ...row, last_assigned_at: null }));
};

const toRecurringPackages = async (client: SupabaseLike, tenantId: string) => {
  const response = await client
    .from("online_recurring_packages")
    .select(
      "id, tenant_id, student_id, course_id, teacher_id, status, source, effective_month, effective_from, effective_to, sessions_per_week, monthly_fee_cents_snapshot, notes, hold_expires_at, created_by, updated_by, created_at, updated_at"
    )
    .eq("tenant_id", tenantId)
    .order("effective_month", { ascending: false })
    .order("created_at", { ascending: false });

  if (response.error) {
    if (isSafeRecurringFallbackError(response.error, "online_recurring_packages")) {
      return { rows: [] as OnlineRecurringPackage[], warning: ONLINE_RECURRING_SETUP_WARNING };
    }
    throw response.error;
  }

  return { rows: (response.data ?? []) as OnlineRecurringPackage[] };
};

const toRecurringPackageSlots = async (client: SupabaseLike, tenantId: string, packageIds: string[]) => {
  if (packageIds.length === 0) return [] as OnlineRecurringPackageSlot[];
  const response = await client
    .from("online_recurring_package_slots")
    .select(
      "id, tenant_id, package_id, slot_template_id, day_of_week_snapshot, start_time_snapshot, duration_minutes_snapshot, status, created_at, updated_at"
    )
    .eq("tenant_id", tenantId)
    .in("package_id", packageIds)
    .order("day_of_week_snapshot", { ascending: true })
    .order("start_time_snapshot", { ascending: true });

  if (response.error) {
    if (isSafeRecurringFallbackError(response.error, "online_recurring_package_slots")) {
      return [] as OnlineRecurringPackageSlot[];
    }
    throw response.error;
  }
  return (response.data ?? []) as OnlineRecurringPackageSlot[];
};

const toStudentsByIds = async (client: SupabaseLike, tenantId: string, studentIds: string[]) => {
  if (studentIds.length === 0) return [] as OnlineStudentLite[];
  const response = await client
    .from("students")
    .select("id, name, parent_name, parent_contact_number")
    .eq("tenant_id", tenantId)
    .in("id", studentIds)
    .order("name", { ascending: true });
  if (response.error) throw response.error;
  return (response.data ?? []) as OnlineStudentLite[];
};

const toPackageChangeRequests = async (client: SupabaseLike, tenantId: string) => {
  const response = await client
    .from("online_package_change_requests")
    .select(
      "id, tenant_id, student_id, current_package_id, next_package_id_draft, requested_by, effective_month, pricing_delta_cents, billing_status, status, created_at, updated_at"
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (response.error) {
    if (isSafeRecurringFallbackError(response.error, "online_package_change_requests")) {
      return [] as OnlinePackageChangeRequest[];
    }
    throw response.error;
  }
  return (response.data ?? []) as OnlinePackageChangeRequest[];
};

export const fetchRecurringSnapshot = async (
  client: SupabaseLike,
  tenantId: string,
): Promise<SnapshotResult> => {
  const [courses, templates, teacherAvailability, packagesResult, packageChangeRequests] =
    await Promise.all([
      toCourseRows(client, tenantId),
      toTemplateRows(client, tenantId),
      toTeacherAvailabilityRows(client, tenantId),
      toRecurringPackages(client, tenantId),
      toPackageChangeRequests(client, tenantId),
    ]);

  const packages = packagesResult.rows;
  const packageIds = packages.map((row) => row.id);
  const studentIds = Array.from(new Set(packages.map((row) => row.student_id).filter(Boolean)));
  const [packageSlots, students] = await Promise.all([
    toRecurringPackageSlots(client, tenantId, packageIds),
    toStudentsByIds(client, tenantId, studentIds),
  ]);

  return {
    warning: packagesResult.warning,
    courses,
    templates,
    teacherAvailability,
    packages,
    packageSlots,
    students,
    packageChangeRequests,
  };
};

export const hydratePlannerPackages = (params: {
  packages: OnlineRecurringPackage[];
  packageSlots: OnlineRecurringPackageSlot[];
  students: OnlineStudentLite[];
  courses: OnlineCourse[];
}) => {
  const slotsByPackageId = new Map<string, OnlineRecurringPackageSlot[]>();
  params.packageSlots.forEach((slot) => {
    const list = slotsByPackageId.get(slot.package_id) ?? [];
    list.push(slot);
    slotsByPackageId.set(slot.package_id, list);
  });

  const studentById = new Map(params.students.map((student) => [student.id, student]));
  const courseById = new Map(params.courses.map((course) => [course.id, course]));

  return params.packages.map<OnlinePlannerPackage>((pkg) => ({
    ...pkg,
    student_name: studentById.get(pkg.student_id)?.name ?? "Student",
    parent_name: studentById.get(pkg.student_id)?.parent_name ?? null,
    parent_contact_number: studentById.get(pkg.student_id)?.parent_contact_number ?? null,
    course_name: courseById.get(pkg.course_id)?.name ?? "Online Course",
    slots: (slotsByPackageId.get(pkg.id) ?? []).filter((slot) => slot.status === "active"),
  }));
};

export const filterPackagesForMonth = (packages: OnlineRecurringPackage[], monthKey: string) =>
  packages.filter((pkg) => {
    if (pkg.status !== "active" && pkg.status !== "pending_payment" && pkg.status !== "draft") return false;

    const monthStart = normalizeDateKey(`${monthKey}-01`);
    const effectiveMonth = normalizeDateKey(pkg.effective_month);
    const effectiveTo = normalizeDateKey(pkg.effective_to);
    if (!monthStart || !effectiveMonth) return false;

    if (effectiveMonth > monthStart) return false;
    if (effectiveTo && effectiveTo < monthStart) return false;
    return true;
  });

export const buildOccurrencesForMonth = (params: {
  packages: OnlinePlannerPackage[];
  monthKey: string;
  templateById: Map<string, OnlineSlotTemplateRow>;
}) => {
  const monthStart = monthStartFromKey(params.monthKey) ?? monthStartFromKey(currentMonthKey());
  if (!monthStart) return [] as Omit<OnlineRecurringOccurrence, "id" | "created_at" | "updated_at">[];

  const nextMonth = monthStartFromKey(nextMonthKey(params.monthKey));
  if (!nextMonth) return [] as Omit<OnlineRecurringOccurrence, "id" | "created_at" | "updated_at">[];

  const rows: Omit<OnlineRecurringOccurrence, "id" | "created_at" | "updated_at">[] = [];
  for (let date = new Date(monthStart); date < nextMonth; date = new Date(date.getTime() + 86400000)) {
    const dayOfWeek = date.getUTCDay();
    const sessionDate = date.toISOString().slice(0, 10);

    params.packages.forEach((pkg) => {
      pkg.slots.forEach((slot) => {
        if (slot.day_of_week_snapshot !== dayOfWeek) return;
        const template = params.templateById.get(slot.slot_template_id);
        rows.push({
          tenant_id: pkg.tenant_id,
          package_id: pkg.id,
          package_slot_id: slot.id,
          student_id: pkg.student_id,
          course_id: pkg.course_id,
          teacher_id: pkg.teacher_id,
          slot_template_id: slot.slot_template_id,
          session_date: sessionDate,
          start_time: slot.start_time_snapshot || template?.start_time || "00:00:00",
          duration_minutes: slot.duration_minutes_snapshot || template?.duration_minutes || DEFAULT_ONLINE_SLOT_DURATION,
          attendance_status: null,
          attendance_notes: null,
          recorded_at: null,
          cancelled_at: null,
        });
      });
    });
  }

  return rows;
};
