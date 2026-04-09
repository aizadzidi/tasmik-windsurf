import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchOnlineStudentPackageAssignments,
  isMissingPackageAssignmentsSetupError,
  SCHEDULABLE_ASSIGNMENT_STATUSES,
} from "@/lib/online/packageAssignments";
import type { OnlineTeacherSchedulerOptions } from "@/types/online";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const ACTIVE_PACKAGE_STATUSES = ["active", "pending_payment", "draft"] as const;

type ClientLike = Pick<SupabaseClient, "from">;

type AssignmentRow = {
  id: string;
  student_id: string;
  course_id: string;
  teacher_id: string;
  status: "draft" | "pending_payment" | "active" | "paused" | "cancelled";
  effective_from: string;
  effective_to: string | null;
  sessions_per_week_snapshot: number;
  duration_minutes_snapshot: number;
  monthly_fee_cents_snapshot: number;
};

type SlotTemplateRow = {
  id: string;
  course_id: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
};

type PackageSlotRow = {
  id: string;
  slot_template_id: string;
  status: string;
};

const cancelUpcomingOccurrencesForPackageSlot = async (params: {
  client: ClientLike;
  tenantId: string;
  packageSlotId: string;
  timestamp: string;
}) => {
  const todayKey = params.timestamp.slice(0, 10);

  const cancelFutureOccurrenceRes = await params.client
    .from("online_recurring_occurrences")
    .update({
      cancelled_at: params.timestamp,
      updated_at: params.timestamp,
    })
    .eq("tenant_id", params.tenantId)
    .eq("package_slot_id", params.packageSlotId)
    .is("cancelled_at", null)
    .gt("session_date", todayKey);
  if (cancelFutureOccurrenceRes.error) throw cancelFutureOccurrenceRes.error;

  const cancelTodayUnmarkedOccurrenceRes = await params.client
    .from("online_recurring_occurrences")
    .update({
      cancelled_at: params.timestamp,
      updated_at: params.timestamp,
    })
    .eq("tenant_id", params.tenantId)
    .eq("package_slot_id", params.packageSlotId)
    .is("cancelled_at", null)
    .eq("session_date", todayKey)
    .is("attendance_status", null);
  if (cancelTodayUnmarkedOccurrenceRes.error) throw cancelTodayUnmarkedOccurrenceRes.error;
};

export type TeacherScheduleSlotInput = {
  day_of_week: number;
  start_time: string;
};

export type TeacherScheduleRequest = {
  tenantId: string;
  teacherId: string;
  assignmentId: string;
  month: string;
  slots: TeacherScheduleSlotInput[];
};

const normalizeStartTime = (value: string) => {
  const match = TIME_PATTERN.exec(value.trim());
  if (!match) return "";
  return `${match[1]}:${match[2]}:00`;
};

const toMonthStart = (monthKey: string) => {
  const match = MONTH_PATTERN.exec(monthKey.trim());
  if (!match) return "";
  const month = Number(match[2]);
  if (!Number.isInteger(month) || month < 1 || month > 12) return "";
  return `${match[1]}-${match[2]}-01`;
};

const uniqueSlotInputs = (slots: TeacherScheduleSlotInput[]) => {
  const normalized: Array<{ day_of_week: number; start_time: string }> = [];
  const keys = new Set<string>();

  for (const slot of slots) {
    const dayOfWeek = Number(slot.day_of_week);
    const startTime = normalizeStartTime(slot.start_time ?? "");
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || !startTime) {
      throw new Error("Each slot must include day_of_week (0-6) and start_time (HH:MM).");
    }
    const key = `${dayOfWeek}:${startTime}`;
    if (keys.has(key)) {
      throw new Error("Duplicate day/time slots are not allowed in the same schedule.");
    }
    keys.add(key);
    normalized.push({ day_of_week: dayOfWeek, start_time: startTime });
  }

  return normalized;
};

const assertUniqueTemplateIds = (templateIds: string[]) => {
  if (new Set(templateIds).size !== templateIds.length) {
    throw new Error("Duplicate day/time slots are not allowed in the same schedule.");
  }
};

const resolveTemplate = async (params: {
  client: ClientLike;
  tenantId: string;
  courseId: string;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
}) => {
  const { client, tenantId, courseId, dayOfWeek, startTime, durationMinutes } = params;
  const existingRes = await client
    .from("online_slot_templates")
    .select("id, course_id, day_of_week, start_time, duration_minutes")
    .eq("tenant_id", tenantId)
    .eq("course_id", courseId)
    .eq("day_of_week", dayOfWeek)
    .eq("start_time", startTime)
    .limit(1);
  if (existingRes.error) throw existingRes.error;

  const existing = (existingRes.data ?? [])[0] as SlotTemplateRow | undefined;
  if (existing?.id) return existing;

  const createRes = await client
    .from("online_slot_templates")
    .insert({
      tenant_id: tenantId,
      course_id: courseId,
      day_of_week: dayOfWeek,
      start_time: startTime,
      duration_minutes: durationMinutes,
      timezone: "Asia/Kuala_Lumpur",
      is_active: true,
    })
    .select("id, course_id, day_of_week, start_time, duration_minutes")
    .single();
  if (createRes.error) throw createRes.error;
  return createRes.data as SlotTemplateRow;
};

const isPackageActiveForMonth = (
  row: { effective_month: string; effective_to: string | null },
  monthStart: string,
) => row.effective_month <= monthStart && (row.effective_to === null || row.effective_to >= monthStart);

const isMonthWithinAssignment = (assignment: Pick<AssignmentRow, "effective_from" | "effective_to">, monthStart: string) => {
  const effectiveFrom = assignment.effective_from.slice(0, 10);
  if (effectiveFrom > monthStart) return false;
  if (assignment.effective_to && assignment.effective_to.slice(0, 10) < monthStart) return false;
  return true;
};

export const buildTeacherSchedulerOptions = async (params: {
  client: ClientLike;
  tenantId: string;
  teacherId: string;
}): Promise<OnlineTeacherSchedulerOptions> => {
  const { rows } = await fetchOnlineStudentPackageAssignments({
    client: params.client,
    tenantId: params.tenantId,
    teacherId: params.teacherId,
    statuses: SCHEDULABLE_ASSIGNMENT_STATUSES,
  });

  const todayKey = new Date().toISOString().slice(0, 10);
  return {
    pending_assignments: rows
      .filter((row) => row.schedule_state === "waiting_for_slot" || row.schedule_state === "partially_scheduled")
      .filter((row) => !row.effective_to || row.effective_to >= todayKey)
      .sort((left, right) => {
        const byStudent = left.student_name.localeCompare(right.student_name);
        if (byStudent !== 0) return byStudent;
        return left.course_name.localeCompare(right.course_name);
      })
      .map((row) => ({
        id: row.id,
        student_id: row.student_id,
        student_name: row.student_name,
        parent_name: row.parent_name,
        parent_contact_number: row.parent_contact_number,
        course_id: row.course_id,
        course_name: row.course_name,
        status: row.status,
        sessions_per_week: row.sessions_per_week_snapshot,
        monthly_fee_cents: row.monthly_fee_cents_snapshot,
        duration_minutes: row.duration_minutes_snapshot,
        effective_from: row.effective_from,
        effective_to: row.effective_to,
      })),
    slot_capacity: "single_student",
  };
};

export const createTeacherRecurringSchedule = async (
  client: ClientLike,
  payload: TeacherScheduleRequest,
) => {
  const monthStart = toMonthStart(payload.month);
  if (!monthStart) {
    throw new Error("month must be in YYYY-MM format.");
  }

  const slots = uniqueSlotInputs(payload.slots ?? []);
  if (slots.length === 0) {
    throw new Error("At least one slot is required.");
  }

  const assignmentRes = await client
    .from("online_student_package_assignments")
    .select(
      "id, student_id, course_id, teacher_id, status, effective_from, effective_to, sessions_per_week_snapshot, duration_minutes_snapshot, monthly_fee_cents_snapshot"
    )
    .eq("tenant_id", payload.tenantId)
    .eq("id", payload.assignmentId)
    .maybeSingle();
  if (assignmentRes.error) {
    if (isMissingPackageAssignmentsSetupError(assignmentRes.error)) {
      throw new Error("Online package assignments are not configured yet. Run the latest migration first.");
    }
    throw assignmentRes.error;
  }

  const assignment = assignmentRes.data as AssignmentRow | null;
  if (!assignment?.id || assignment.teacher_id !== payload.teacherId) {
    throw new Error("Package assignment not found for this teacher.");
  }
  if (!SCHEDULABLE_ASSIGNMENT_STATUSES.includes(assignment.status)) {
    throw new Error("Only active or pending payment package assignments can be scheduled.");
  }
  if (!isMonthWithinAssignment(assignment, monthStart)) {
    throw new Error("Package assignment is not active for the selected month.");
  }
  if (slots.length !== assignment.sessions_per_week_snapshot) {
    throw new Error(`This package requires exactly ${assignment.sessions_per_week_snapshot} weekly slot(s).`);
  }

  const templateRows = await Promise.all(
    slots.map((slot) =>
      resolveTemplate({
        client,
        tenantId: payload.tenantId,
        courseId: assignment.course_id,
        dayOfWeek: slot.day_of_week,
        startTime: slot.start_time,
        durationMinutes: assignment.duration_minutes_snapshot,
      }),
    ),
  );
  const templateIds = templateRows.map((row) => row.id);
  assertUniqueTemplateIds(templateIds);

  const activePackagesRes = await client
    .from("online_recurring_packages")
    .select(
      "id, student_id, course_id, teacher_id, student_package_assignment_id, effective_month, effective_to, status"
    )
    .eq("tenant_id", payload.tenantId)
    .eq("teacher_id", payload.teacherId)
    .in("status", [...ACTIVE_PACKAGE_STATUSES]);
  if (activePackagesRes.error) throw activePackagesRes.error;

  const activePackages = (activePackagesRes.data ?? []) as Array<{
    id: string;
    student_id: string;
    course_id: string;
    teacher_id: string;
    student_package_assignment_id: string | null;
    effective_month: string;
    effective_to: string | null;
    status: string;
  }>;
  const monthActivePackages = activePackages.filter((row) => isPackageActiveForMonth(row, monthStart));

  const monthActivePackageIds = monthActivePackages.map((row) => row.id);
  const activeSlotCountByPackageId = new Map<string, number>();
  if (monthActivePackageIds.length > 0) {
    const activePackageSlotsRes = await client
      .from("online_recurring_package_slots")
      .select("package_id")
      .eq("tenant_id", payload.tenantId)
      .eq("status", "active")
      .in("package_id", monthActivePackageIds);
    if (activePackageSlotsRes.error) throw activePackageSlotsRes.error;

    (activePackageSlotsRes.data ?? []).forEach((row) => {
      const packageId = String(row.package_id ?? "");
      if (!packageId) return;
      activeSlotCountByPackageId.set(packageId, (activeSlotCountByPackageId.get(packageId) ?? 0) + 1);
    });
  }

  const existingPackage =
    monthActivePackages.find((row) => row.student_package_assignment_id === assignment.id) ??
    monthActivePackages.find(
      (row) =>
        !row.student_package_assignment_id &&
        row.student_id === assignment.student_id &&
        row.course_id === assignment.course_id &&
        row.teacher_id === assignment.teacher_id,
    ) ??
    null;

  const activePackageIds = monthActivePackages
    .filter((row) => row.id !== existingPackage?.id)
    .filter((row) => (activeSlotCountByPackageId.get(row.id) ?? 0) > 0)
    .map((row) => row.id);
  if (activePackageIds.length > 0) {
    const slotConflictRes = await client
      .from("online_recurring_package_slots")
      .select("id")
      .eq("tenant_id", payload.tenantId)
      .in("package_id", activePackageIds)
      .eq("status", "active")
      .in("slot_template_id", templateIds)
      .limit(1);
    if (slotConflictRes.error) throw slotConflictRes.error;
    if ((slotConflictRes.data ?? []).length > 0) {
      throw new Error("One or more selected slot times are already scheduled for this teacher.");
    }
  }

  const timestamp = new Date().toISOString();
  const recurringStatus = assignment.status === "pending_payment" ? "pending_payment" : "active";
  let packageData: Record<string, unknown> | null = null;
  let packageSlotsData: Array<Record<string, unknown>> = [];
  const slotUpdateForTemplate = (template: SlotTemplateRow) => ({
    slot_template_id: template.id,
    day_of_week_snapshot: template.day_of_week,
    start_time_snapshot: template.start_time,
    duration_minutes_snapshot: template.duration_minutes,
    status: "active" as const,
    updated_at: timestamp,
  });

  if (existingPackage) {
    const packageUpdateRes = await client
      .from("online_recurring_packages")
      .update({
        student_id: assignment.student_id,
        course_id: assignment.course_id,
        teacher_id: assignment.teacher_id,
        student_package_assignment_id: assignment.id,
        status: recurringStatus,
        source: "admin_assignment_teacher_schedule",
        sessions_per_week: assignment.sessions_per_week_snapshot,
        monthly_fee_cents_snapshot: assignment.monthly_fee_cents_snapshot,
        updated_at: timestamp,
        updated_by: payload.teacherId,
      })
      .eq("tenant_id", payload.tenantId)
      .eq("id", existingPackage.id)
      .select("*")
      .single();
    if (packageUpdateRes.error) throw packageUpdateRes.error;
    packageData = packageUpdateRes.data as Record<string, unknown>;

    const existingSlotsRes = await client
      .from("online_recurring_package_slots")
      .select("id, slot_template_id, status")
      .eq("tenant_id", payload.tenantId)
      .eq("package_id", existingPackage.id)
      .order("created_at", { ascending: true });
    if (existingSlotsRes.error) throw existingSlotsRes.error;

    const existingSlots = (existingSlotsRes.data ?? []) as PackageSlotRow[];
    const existingSlotByTemplateId = new Map<string, PackageSlotRow>();
    existingSlots.forEach((slot) => {
      const current = existingSlotByTemplateId.get(slot.slot_template_id);
      if (!current || (current.status !== "active" && slot.status === "active")) {
        existingSlotByTemplateId.set(slot.slot_template_id, slot);
      }
    });

    const matchedSlotIds = new Set<string>();
    for (const template of templateRows) {
      const matchingSlot = existingSlotByTemplateId.get(template.id);
      if (!matchingSlot) continue;
      matchedSlotIds.add(matchingSlot.id);
      const updateSlotRes = await client
        .from("online_recurring_package_slots")
        .update(slotUpdateForTemplate(template))
        .eq("tenant_id", payload.tenantId)
        .eq("id", matchingSlot.id);
      if (updateSlotRes.error) throw updateSlotRes.error;
    }

    const templatesToAssign = templateRows.filter((template) => !existingSlotByTemplateId.has(template.id));
    const reusableSlots = existingSlots.filter((slot) => !matchedSlotIds.has(slot.id));
    const reusableSlotsToUpdate = reusableSlots.slice(0, templatesToAssign.length);

    for (let index = 0; index < reusableSlotsToUpdate.length; index += 1) {
      await cancelUpcomingOccurrencesForPackageSlot({
        client,
        tenantId: payload.tenantId,
        packageSlotId: reusableSlotsToUpdate[index].id,
        timestamp,
      });
      const updateSlotRes = await client
        .from("online_recurring_package_slots")
        .update(slotUpdateForTemplate(templatesToAssign[index]))
        .eq("tenant_id", payload.tenantId)
        .eq("id", reusableSlotsToUpdate[index].id);
      if (updateSlotRes.error) throw updateSlotRes.error;
    }

    const templatesToInsert = templatesToAssign.slice(reusableSlotsToUpdate.length);
    if (templatesToInsert.length > 0) {
      const insertRows = templatesToInsert.map((template) => ({
        tenant_id: payload.tenantId,
        package_id: existingPackage.id,
        slot_template_id: template.id,
        day_of_week_snapshot: template.day_of_week,
        start_time_snapshot: template.start_time,
        duration_minutes_snapshot: template.duration_minutes,
        status: "active" as const,
      }));
      const insertRes = await client.from("online_recurring_package_slots").insert(insertRows);
      if (insertRes.error) throw insertRes.error;
    }

    const staleSlotIds = reusableSlots.slice(reusableSlotsToUpdate.length).map((slot) => slot.id);
    if (staleSlotIds.length > 0) {
      for (const staleSlotId of staleSlotIds) {
        await cancelUpcomingOccurrencesForPackageSlot({
          client,
          tenantId: payload.tenantId,
          packageSlotId: staleSlotId,
          timestamp,
        });
      }
      const cancelRes = await client
        .from("online_recurring_package_slots")
        .update({
          status: "cancelled",
          updated_at: timestamp,
        })
        .eq("tenant_id", payload.tenantId)
        .in("id", staleSlotIds);
      if (cancelRes.error) throw cancelRes.error;
    }

    const refreshedSlotsRes = await client
      .from("online_recurring_package_slots")
      .select("*")
      .eq("tenant_id", payload.tenantId)
      .eq("package_id", existingPackage.id)
      .eq("status", "active")
      .order("day_of_week_snapshot", { ascending: true })
      .order("start_time_snapshot", { ascending: true });
    if (refreshedSlotsRes.error) throw refreshedSlotsRes.error;
    packageSlotsData = (refreshedSlotsRes.data ?? []) as Array<Record<string, unknown>>;
  } else {
    const packageRes = await client
      .from("online_recurring_packages")
      .insert({
        tenant_id: payload.tenantId,
        student_id: assignment.student_id,
        course_id: assignment.course_id,
        teacher_id: assignment.teacher_id,
        student_package_assignment_id: assignment.id,
        status: recurringStatus,
        source: "admin_assignment_teacher_schedule",
        effective_month: monthStart,
        effective_from: assignment.effective_from > monthStart ? assignment.effective_from : monthStart,
        sessions_per_week: assignment.sessions_per_week_snapshot,
        monthly_fee_cents_snapshot: assignment.monthly_fee_cents_snapshot,
        notes: null,
        created_by: payload.teacherId,
        updated_by: payload.teacherId,
      })
      .select("*")
      .single();
    if (packageRes.error) throw packageRes.error;
    packageData = packageRes.data as Record<string, unknown>;

    const slotInsertRows = templateRows.map((template) => ({
      tenant_id: payload.tenantId,
      package_id: packageRes.data.id,
      slot_template_id: template.id,
      day_of_week_snapshot: template.day_of_week,
      start_time_snapshot: template.start_time,
      duration_minutes_snapshot: template.duration_minutes,
      status: "active" as const,
    }));
    const packageSlotRes = await client
      .from("online_recurring_package_slots")
      .insert(slotInsertRows)
      .select("*");
    if (packageSlotRes.error) {
      await client
        .from("online_recurring_packages")
        .update({
          status: "cancelled",
          effective_to: monthStart,
          updated_at: timestamp,
          updated_by: payload.teacherId,
        })
        .eq("tenant_id", payload.tenantId)
        .eq("id", packageRes.data.id);
      throw packageSlotRes.error;
    }

    packageSlotsData = (packageSlotRes.data ?? []) as Array<Record<string, unknown>>;
  }

  const availabilityRows = templateIds.map((slotTemplateId) => ({
    tenant_id: payload.tenantId,
    teacher_id: payload.teacherId,
    slot_template_id: slotTemplateId,
    is_available: true,
    last_assigned_at: timestamp,
  }));
  const availabilityRes = await client
    .from("online_teacher_slot_preferences")
    .upsert(availabilityRows, { onConflict: "tenant_id,slot_template_id,teacher_id" });
  if (availabilityRes.error) throw availabilityRes.error;

  return {
    package: packageData,
    package_slots: packageSlotsData,
  };
};

export type FillPackageSlotsRequest = {
  tenantId: string;
  teacherId: string;
  packageId: string;
  slots: TeacherScheduleSlotInput[];
};

export const fillPackageSlots = async (
  client: ClientLike,
  payload: FillPackageSlotsRequest,
) => {
  const slots = uniqueSlotInputs(payload.slots ?? []);
  if (slots.length === 0) {
    throw new Error("At least one slot is required.");
  }

  const packageRes = await client
    .from("online_recurring_packages")
    .select(
      "id, student_id, course_id, teacher_id, student_package_assignment_id, status, effective_month, effective_from, effective_to, sessions_per_week, monthly_fee_cents_snapshot"
    )
    .eq("tenant_id", payload.tenantId)
    .eq("id", payload.packageId)
    .maybeSingle();
  if (packageRes.error) throw packageRes.error;

  const pkg = packageRes.data as {
    id: string;
    student_id: string;
    course_id: string;
    teacher_id: string;
    student_package_assignment_id: string | null;
    status: string;
    effective_month: string;
    effective_from: string;
    effective_to: string | null;
    sessions_per_week: number;
    monthly_fee_cents_snapshot: number;
  } | null;

  if (!pkg?.id || pkg.teacher_id !== payload.teacherId) {
    throw new Error("Package not found for this teacher.");
  }
  if (pkg.status !== "active" && pkg.status !== "pending_payment" && pkg.status !== "draft") {
    throw new Error("Only active packages can have slots filled.");
  }

  // Count existing active slots
  const activeSlotsRes = await client
    .from("online_recurring_package_slots")
    .select("id, slot_template_id")
    .eq("tenant_id", payload.tenantId)
    .eq("package_id", pkg.id)
    .eq("status", "active");
  if (activeSlotsRes.error) throw activeSlotsRes.error;

  const existingActiveCount = (activeSlotsRes.data ?? []).length;
  if (existingActiveCount + slots.length > pkg.sessions_per_week) {
    throw new Error(
      `Package requires ${pkg.sessions_per_week} weekly slot(s). Already has ${existingActiveCount} active. Cannot add ${slots.length} more.`
    );
  }

  // Look up assignment for duration info
  let durationMinutes = 30; // fallback
  if (pkg.student_package_assignment_id) {
    const assignmentRes = await client
      .from("online_student_package_assignments")
      .select("duration_minutes_snapshot")
      .eq("id", pkg.student_package_assignment_id)
      .maybeSingle();
    if (!assignmentRes.error && assignmentRes.data) {
      durationMinutes = (assignmentRes.data as { duration_minutes_snapshot: number }).duration_minutes_snapshot || 30;
    }
  }

  // Resolve templates for each new slot
  const templateRows = await Promise.all(
    slots.map((slot) =>
      resolveTemplate({
        client,
        tenantId: payload.tenantId,
        courseId: pkg.course_id,
        dayOfWeek: slot.day_of_week,
        startTime: slot.start_time,
        durationMinutes,
      }),
    ),
  );
  const templateIds = templateRows.map((row) => row.id);
  assertUniqueTemplateIds(templateIds);

  // Check for conflicts with other packages for this teacher (only overlapping date ranges)
  let otherPackagesQuery = client
    .from("online_recurring_packages")
    .select("id, effective_month, effective_to")
    .eq("tenant_id", payload.tenantId)
    .eq("teacher_id", payload.teacherId)
    .neq("id", pkg.id)
    .in("status", ["active", "pending_payment", "draft"]);

  // Only consider packages that start before this package ends
  if (pkg.effective_to) {
    otherPackagesQuery = otherPackagesQuery.lte("effective_month", pkg.effective_to);
  }

  const otherPackagesRes = await otherPackagesQuery;
  if (otherPackagesRes.error) throw otherPackagesRes.error;

  // Filter out packages that end before this package starts
  const otherPackageIds = (otherPackagesRes.data ?? [])
    .filter((row) => !row.effective_to || row.effective_to >= pkg.effective_month)
    .map((row) => String(row.id));
  if (otherPackageIds.length > 0) {
    const conflictRes = await client
      .from("online_recurring_package_slots")
      .select("id")
      .eq("tenant_id", payload.tenantId)
      .in("package_id", otherPackageIds)
      .eq("status", "active")
      .in("slot_template_id", templateIds)
      .limit(1);
    if (conflictRes.error) throw conflictRes.error;
    if ((conflictRes.data ?? []).length > 0) {
      throw new Error("One or more selected slot times are already scheduled for this teacher.");
    }
  }

  // Also check for duplicates within the same package
  const existingTemplateIds = (activeSlotsRes.data ?? []).map((row) => String(row.slot_template_id));
  const duplicateTemplates = templateIds.filter((id) => existingTemplateIds.includes(id));
  if (duplicateTemplates.length > 0) {
    throw new Error("One or more selected slots are already assigned to this package.");
  }

  // Insert new package slots
  const timestamp = new Date().toISOString();
  const slotInsertRows = templateRows.map((template) => ({
    tenant_id: payload.tenantId,
    package_id: pkg.id,
    slot_template_id: template.id,
    day_of_week_snapshot: template.day_of_week,
    start_time_snapshot: template.start_time,
    duration_minutes_snapshot: template.duration_minutes,
    status: "active" as const,
  }));
  const insertRes = await client
    .from("online_recurring_package_slots")
    .insert(slotInsertRows)
    .select("*");
  if (insertRes.error) throw insertRes.error;

  // Update teacher availability preferences
  const availabilityRows = templateIds.map((slotTemplateId) => ({
    tenant_id: payload.tenantId,
    teacher_id: payload.teacherId,
    slot_template_id: slotTemplateId,
    is_available: true,
    last_assigned_at: timestamp,
  }));
  const availabilityRes = await client
    .from("online_teacher_slot_preferences")
    .upsert(availabilityRows, { onConflict: "tenant_id,slot_template_id,teacher_id" });
  if (availabilityRes.error) throw availabilityRes.error;

  return {
    package_id: pkg.id,
    new_slots: insertRes.data ?? [],
    total_active_slots: existingActiveCount + slots.length,
    sessions_per_week: pkg.sessions_per_week,
  };
};
