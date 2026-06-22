import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchOnlineStudentPackageAssignments,
  isMissingPackageAssignmentsSetupError,
  SCHEDULABLE_ASSIGNMENT_STATUSES,
} from "@/lib/online/packageAssignments";
import { isMissingColumnError } from "@/lib/online/db";
import type { OnlineTeacherSchedulerOptions } from "@/types/online";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const ACTIVE_PACKAGE_STATUSES = ["active", "pending_payment", "draft"] as const;
const OPEN_ENDED_DATE = "9999-12-31";

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
  package_id: string;
  slot_template_id: string;
  day_of_week_snapshot: number;
  start_time_snapshot: string;
  duration_minutes_snapshot: number;
  status: string;
  effective_from: string | null;
  effective_to: string | null;
};

type OccurrenceStatusRow = {
  attendance_status: "present" | "absent" | null;
};

type CurrentWeekOccurrenceRow = {
  package_slot_id: string;
  session_date: string;
  attendance_status: "present" | "absent" | null;
};

type AvailabilitySource = "manual" | "auto_schedule";

const isMissingAvailabilitySourceColumn = (error: { message?: string } | null | undefined) =>
  isMissingColumnError(error, "availability_source", "online_teacher_slot_preferences");

const upsertTeacherAvailability = async (params: {
  client: ClientLike;
  tenantId: string;
  teacherId: string;
  slotTemplateIds: string[];
  timestamp: string;
  source: AvailabilitySource;
}) => {
  const slotTemplateIds = Array.from(new Set(params.slotTemplateIds.filter(Boolean)));
  if (slotTemplateIds.length === 0) return;

  const existingRes = await params.client
    .from("online_teacher_slot_preferences")
    .select("slot_template_id, is_available, availability_source")
    .eq("tenant_id", params.tenantId)
    .eq("teacher_id", params.teacherId)
    .in("slot_template_id", slotTemplateIds);

  if (existingRes.error) {
    if (!isMissingAvailabilitySourceColumn(existingRes.error)) throw existingRes.error;

    const fallbackRows = slotTemplateIds.map((slotTemplateId) => ({
      tenant_id: params.tenantId,
      teacher_id: params.teacherId,
      slot_template_id: slotTemplateId,
      is_available: true,
      last_assigned_at: params.timestamp,
    }));
    const fallbackRes = await params.client
      .from("online_teacher_slot_preferences")
      .upsert(fallbackRows, { onConflict: "tenant_id,slot_template_id,teacher_id" });
    if (fallbackRes.error) throw fallbackRes.error;
    return;
  }

  const existingRows = (existingRes.data ?? []) as Array<{
    slot_template_id: string | null;
    is_available: boolean | null;
    availability_source: AvailabilitySource | null;
  }>;
  const existingIds = new Set(
    existingRows
      .map((row) => String(row.slot_template_id ?? ""))
      .filter(Boolean),
  );
  const missingIds = slotTemplateIds.filter((slotTemplateId) => !existingIds.has(slotTemplateId));
  const updateableExistingIds = existingRows
    .filter((row) => row.availability_source !== "manual" || row.is_available === true)
    .map((row) => String(row.slot_template_id ?? ""))
    .filter(Boolean);

  if (updateableExistingIds.length > 0) {
    const updateRes = await params.client
      .from("online_teacher_slot_preferences")
      .update({
        is_available: true,
        last_assigned_at: params.timestamp,
      })
      .eq("tenant_id", params.tenantId)
      .eq("teacher_id", params.teacherId)
      .in("slot_template_id", updateableExistingIds);
    if (updateRes.error) throw updateRes.error;
  }

  if (missingIds.length > 0) {
    const insertRes = await params.client
      .from("online_teacher_slot_preferences")
      .insert(
        missingIds.map((slotTemplateId) => ({
          tenant_id: params.tenantId,
          teacher_id: params.teacherId,
          slot_template_id: slotTemplateId,
          is_available: true,
          last_assigned_at: params.timestamp,
          availability_source: params.source,
        })),
      );
    if (insertRes.error) throw insertRes.error;
  }
};

const cleanupUnusedAutoScheduleAvailability = async (params: {
  client: ClientLike;
  tenantId: string;
  teacherId: string;
  slotTemplateIds: string[];
  timestamp: string;
}) => {
  const slotTemplateIds = Array.from(new Set(params.slotTemplateIds.filter(Boolean)));
  if (slotTemplateIds.length === 0) return;

  const autoAvailabilityRes = await params.client
    .from("online_teacher_slot_preferences")
    .select("slot_template_id, availability_source")
    .eq("tenant_id", params.tenantId)
    .eq("teacher_id", params.teacherId)
    .eq("is_available", true)
    .eq("availability_source", "auto_schedule")
    .in("slot_template_id", slotTemplateIds);

  if (autoAvailabilityRes.error) {
    if (isMissingAvailabilitySourceColumn(autoAvailabilityRes.error)) return;
    throw autoAvailabilityRes.error;
  }

  const autoTemplateIds = (autoAvailabilityRes.data ?? [])
    .map((row) => String(row.slot_template_id ?? ""))
    .filter(Boolean);
  if (autoTemplateIds.length === 0) return;

  const activePackagesRes = await params.client
    .from("online_recurring_packages")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("teacher_id", params.teacherId)
    .in("status", [...ACTIVE_PACKAGE_STATUSES]);
  if (activePackagesRes.error) throw activePackagesRes.error;

  const activePackageIds = (activePackagesRes.data ?? [])
    .map((row) => String(row.id ?? ""))
    .filter(Boolean);

  let stillUsedTemplateIds = new Set<string>();
  if (activePackageIds.length > 0) {
    const todayKey = params.timestamp.slice(0, 10);
    const usedSlotsRes = await params.client
      .from("online_recurring_package_slots")
      .select("slot_template_id, effective_to")
      .eq("tenant_id", params.tenantId)
      .eq("status", "active")
      .in("package_id", activePackageIds)
      .in("slot_template_id", autoTemplateIds);
    if (usedSlotsRes.error) throw usedSlotsRes.error;
    stillUsedTemplateIds = new Set(
      (usedSlotsRes.data ?? [])
        .filter((row) => !row.effective_to || String(row.effective_to).slice(0, 10) >= todayKey)
        .map((row) => String(row.slot_template_id ?? ""))
        .filter(Boolean),
    );
  }

  const unusedTemplateIds = autoTemplateIds.filter((slotTemplateId) => !stillUsedTemplateIds.has(slotTemplateId));
  if (unusedTemplateIds.length === 0) return;

  const cleanupRes = await params.client
    .from("online_teacher_slot_preferences")
    .update({
      is_available: false,
      last_assigned_at: null,
    })
    .eq("tenant_id", params.tenantId)
    .eq("teacher_id", params.teacherId)
    .eq("availability_source", "auto_schedule")
    .in("slot_template_id", unusedTemplateIds);
  if (cleanupRes.error) throw cleanupRes.error;
};

const addDaysToDateKey = (dateKey: string, days: number) => {
  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

const weekStartDateKey = (date: string) => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return date;

  const day = parsed.getUTCDay();
  parsed.setUTCDate(parsed.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return parsed.toISOString().slice(0, 10);
};

const dateForDayOfWeekInWeek = (weekStart: string, dayOfWeek: number) =>
  addDaysToDateKey(weekStart, dayOfWeek === 0 ? 6 : dayOfWeek - 1);

const maxDateKey = (left: string, right: string) => (left >= right ? left : right);

const dateKey = (value: string | null | undefined) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(`${value ?? ""}`.trim());
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

const monthEndDateKey = (monthStart: string) => {
  const parsed = new Date(`${monthStart}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return monthStart;
  parsed.setUTCMonth(parsed.getUTCMonth() + 1, 0);
  return parsed.toISOString().slice(0, 10);
};

const slotIsCurrentOrFuture = (
  slot: Pick<PackageSlotRow, "status" | "effective_to">,
  date: string,
) => {
  if (slot.status !== "active") return false;
  const effectiveTo = dateKey(slot.effective_to);
  return !effectiveTo || effectiveTo >= date;
};

const slotOverlapsDateRange = (
  slot: Pick<PackageSlotRow, "status" | "effective_from" | "effective_to">,
  rangeStart: string,
  rangeEnd: string,
) => {
  if (slot.status !== "active") return false;
  const effectiveFrom = dateKey(slot.effective_from);
  const effectiveTo = dateKey(slot.effective_to);
  if (effectiveFrom && effectiveFrom > rangeEnd) return false;
  if (effectiveTo && effectiveTo < rangeStart) return false;
  return true;
};

const slotDayTimeKey = (slot: Pick<PackageSlotRow, "day_of_week_snapshot" | "start_time_snapshot">) =>
  `${slot.day_of_week_snapshot}:${slot.start_time_snapshot.slice(0, 8)}`;

const templateDayTimeKey = (template: Pick<SlotTemplateRow, "day_of_week" | "start_time">) =>
  `${template.day_of_week}:${template.start_time.slice(0, 8)}`;

export const resolveSlotReplacementEffectiveFrom = (params: {
  todayKey: string;
  todayOccurrences: OccurrenceStatusRow[];
}) => {
  const hasPresentToday = params.todayOccurrences.some((row) => row.attendance_status === "present");
  return hasPresentToday ? addDaysToDateKey(params.todayKey, 1) : params.todayKey;
};

export const resolveCurrentWeekReplacementCutover = (params: {
  tentativeEffectiveFrom: string;
  sessionsPerWeek: number;
  oldSlots: Array<{ id: string; day_of_week: number }>;
  targetDaysOfWeek: number[];
  weekOccurrences: CurrentWeekOccurrenceRow[];
}) => {
  const weekStart = weekStartDateKey(params.tentativeEffectiveFrom);
  const nextWeekStart = addDaysToDateKey(weekStart, 7);
  const oldSlotIds = new Set(params.oldSlots.map((slot) => slot.id).filter(Boolean));
  const targetDatesThisWeek = Array.from(
    new Set(
      params.targetDaysOfWeek
        .map((day) => dateForDayOfWeekInWeek(weekStart, day))
        .filter((date) => date >= params.tentativeEffectiveFrom && date < nextWeekStart),
    ),
  );

  if (
    params.sessionsPerWeek <= 0 ||
    oldSlotIds.size === 0 ||
    targetDatesThisWeek.length === 0
  ) {
    return {
      effectiveFrom: params.tentativeEffectiveFrom,
      currentWeekCutoverSlotIds: [] as string[],
    };
  }

  const remainingCurrentWeekDates = new Set(
    params.weekOccurrences
      .filter(
        (row) =>
          !(
            oldSlotIds.has(row.package_slot_id) &&
            row.session_date >= params.tentativeEffectiveFrom &&
            row.attendance_status !== "present"
          ),
      )
      .map((row) => row.session_date),
  );

  const oldCurrentWeekEntries = params.oldSlots
    .map((slot) => ({
      slotId: slot.id,
      date: dateForDayOfWeekInWeek(weekStart, slot.day_of_week),
    }))
    .filter((entry) => entry.date < params.tentativeEffectiveFrom);

  oldCurrentWeekEntries.forEach((entry) => {
    remainingCurrentWeekDates.add(entry.date);
  });

  targetDatesThisWeek.forEach((date) => {
    remainingCurrentWeekDates.add(date);
  });

  const overBy = remainingCurrentWeekDates.size - params.sessionsPerWeek;
  if (overBy <= 0) {
    return {
      effectiveFrom: params.tentativeEffectiveFrom,
      currentWeekCutoverSlotIds: [] as string[],
    };
  }

  const lockedOldCurrentWeekDates = new Set(
    params.weekOccurrences
      .filter(
        (row) =>
          oldSlotIds.has(row.package_slot_id) &&
          row.session_date < params.tentativeEffectiveFrom &&
          row.attendance_status === "present",
      )
      .map((row) => `${row.package_slot_id}:${row.session_date}`),
  );
  const movableOldEntries = oldCurrentWeekEntries
    .filter((entry) => !lockedOldCurrentWeekDates.has(`${entry.slotId}:${entry.date}`))
    .sort((left, right) => right.date.localeCompare(left.date));

  if (movableOldEntries.length < overBy) {
    return {
      effectiveFrom: nextWeekStart,
      currentWeekCutoverSlotIds: [] as string[],
    };
  }

  return {
    effectiveFrom: params.tentativeEffectiveFrom,
    currentWeekCutoverSlotIds: movableOldEntries.slice(0, overBy).map((entry) => entry.slotId),
  };
};

export const resolveReplacementEffectiveFrom = async (params: {
  client: ClientLike;
  tenantId: string;
  packageSlotIds: string[];
  timestamp: string;
  earliestEffectiveFrom?: string;
}) => {
  const todayKey = params.timestamp.slice(0, 10);
  const earliestEffectiveFrom = maxDateKey(
    dateKey(params.earliestEffectiveFrom) ?? todayKey,
    todayKey,
  );
  if (earliestEffectiveFrom > todayKey) return earliestEffectiveFrom;

  const packageSlotIds = Array.from(new Set(params.packageSlotIds.filter(Boolean)));
  if (packageSlotIds.length === 0) return earliestEffectiveFrom;

  const todayOccurrencesRes = await params.client
    .from("online_recurring_occurrences")
    .select("attendance_status")
    .eq("tenant_id", params.tenantId)
    .in("package_slot_id", packageSlotIds)
    .is("cancelled_at", null)
    .eq("session_date", todayKey);
  if (todayOccurrencesRes.error) throw todayOccurrencesRes.error;

  return resolveSlotReplacementEffectiveFrom({
    todayKey,
    todayOccurrences: (todayOccurrencesRes.data ?? []) as OccurrenceStatusRow[],
  });
};

const resolveReplacementWindow = async (params: {
  client: ClientLike;
  tenantId: string;
  packageId: string;
  packageSlots: Array<Pick<PackageSlotRow, "id" | "day_of_week_snapshot">>;
  targetDaysOfWeek: number[];
  sessionsPerWeek: number;
  timestamp: string;
  earliestEffectiveFrom?: string;
  skipCurrentWeekCutover?: boolean;
}) => {
  const tentativeEffectiveFrom = await resolveReplacementEffectiveFrom({
    client: params.client,
    tenantId: params.tenantId,
    packageSlotIds: params.packageSlots.map((slot) => slot.id),
    timestamp: params.timestamp,
    earliestEffectiveFrom: params.earliestEffectiveFrom,
  });
  const packageSlots = params.packageSlots.filter((slot) => Boolean(slot.id));
  if (
    packageSlots.length === 0 ||
    params.targetDaysOfWeek.length === 0 ||
    params.skipCurrentWeekCutover
  ) {
    return {
      effectiveFrom: tentativeEffectiveFrom,
      currentWeekCutoverSlotIds: [] as string[],
    };
  }

  const weekStart = weekStartDateKey(tentativeEffectiveFrom);
  const nextWeekStart = addDaysToDateKey(weekStart, 7);
  const weekOccurrencesRes = await params.client
    .from("online_recurring_occurrences")
    .select("package_slot_id, session_date, attendance_status")
    .eq("tenant_id", params.tenantId)
    .eq("package_id", params.packageId)
    .is("cancelled_at", null)
    .gte("session_date", weekStart)
    .lt("session_date", nextWeekStart);
  if (weekOccurrencesRes.error) throw weekOccurrencesRes.error;

  return resolveCurrentWeekReplacementCutover({
    tentativeEffectiveFrom,
    sessionsPerWeek: params.sessionsPerWeek,
    oldSlots: packageSlots.map((slot) => ({
      id: slot.id,
      day_of_week: Number(slot.day_of_week_snapshot),
    })),
    targetDaysOfWeek: params.targetDaysOfWeek,
    weekOccurrences: (weekOccurrencesRes.data ?? []) as CurrentWeekOccurrenceRow[],
  });
};

const cancelMovableOccurrencesForPackageSlotsFromDate = async (params: {
  client: ClientLike;
  tenantId: string;
  packageSlotIds: string[];
  fromDate: string;
  timestamp: string;
}) => {
  const packageSlotIds = Array.from(new Set(params.packageSlotIds.filter(Boolean)));
  if (packageSlotIds.length === 0) return;

  const cancelUnmarkedRes = await params.client
    .from("online_recurring_occurrences")
    .update({
      cancelled_at: params.timestamp,
      updated_at: params.timestamp,
    })
    .eq("tenant_id", params.tenantId)
    .in("package_slot_id", packageSlotIds)
    .is("cancelled_at", null)
    .gte("session_date", params.fromDate)
    .is("attendance_status", null);
  if (cancelUnmarkedRes.error) throw cancelUnmarkedRes.error;

  const cancelAbsentRes = await params.client
    .from("online_recurring_occurrences")
    .update({
      cancelled_at: params.timestamp,
      updated_at: params.timestamp,
    })
    .eq("tenant_id", params.tenantId)
    .in("package_slot_id", packageSlotIds)
    .is("cancelled_at", null)
    .gte("session_date", params.fromDate)
    .eq("attendance_status", "absent");
  if (cancelAbsentRes.error) throw cancelAbsentRes.error;
};

const closePackageSlotsBeforeDate = async (params: {
  client: ClientLike;
  tenantId: string;
  packageSlotIds: string[];
  replacementDate: string;
  timestamp: string;
}) => {
  const packageSlotIds = Array.from(new Set(params.packageSlotIds.filter(Boolean)));
  if (packageSlotIds.length === 0) return;

  const slotsRes = await params.client
    .from("online_recurring_package_slots")
    .select("id, effective_from")
    .eq("tenant_id", params.tenantId)
    .in("id", packageSlotIds);
  if (slotsRes.error) throw slotsRes.error;

  const closeDate = addDaysToDateKey(params.replacementDate, -1);
  const slots = (slotsRes.data ?? []) as Array<{ id: string; effective_from: string | null }>;
  const closeableIds = slots
    .filter((slot) => closeDate >= (dateKey(slot.effective_from) ?? closeDate))
    .map((slot) => slot.id);
  const sameDayIds = slots
    .filter((slot) => !closeableIds.includes(slot.id))
    .map((slot) => slot.id);

  if (closeableIds.length > 0) {
    const closeRes = await params.client
      .from("online_recurring_package_slots")
      .update({
        effective_to: closeDate,
        updated_at: params.timestamp,
      })
      .eq("tenant_id", params.tenantId)
      .in("id", closeableIds);
    if (closeRes.error) throw closeRes.error;
  }

  if (sameDayIds.length > 0) {
    const moveRes = await params.client
      .from("online_recurring_package_slots")
      .update({
        status: "moved",
        effective_to: null,
        updated_at: params.timestamp,
      })
      .eq("tenant_id", params.tenantId)
      .in("id", sameDayIds);
    if (moveRes.error) throw moveRes.error;
  }
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

const isThirtyMinuteStart = (value: string) => {
  const match = TIME_PATTERN.exec(value.trim());
  if (!match) return false;
  const minute = Number(match[2]);
  return Number.isInteger(minute) && minute % 30 === 0;
};

const toMonthStart = (monthKey: string) => {
  const match = MONTH_PATTERN.exec(monthKey.trim());
  if (!match) return "";
  const month = Number(match[2]);
  if (!Number.isInteger(month) || month < 1 || month > 12) return "";
  return `${match[1]}-${match[2]}-01`;
};

export const normalizeTeacherScheduleSlots = (slots: TeacherScheduleSlotInput[]) => {
  const normalized: Array<{ day_of_week: number; start_time: string }> = [];
  const keys = new Set<string>();
  const days = new Set<number>();

  for (const slot of slots) {
    const dayOfWeek = Number(slot.day_of_week);
    const startTime = normalizeStartTime(slot.start_time ?? "");
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || !startTime) {
      throw new Error("Each slot must include day_of_week (0-6) and start_time (HH:MM).");
    }
    if (!isThirtyMinuteStart(startTime)) {
      throw new Error("Slot times must use 30-minute blocks (:00 or :30).");
    }
    if (days.has(dayOfWeek)) {
      throw new Error("A package cannot have more than one slot on the same weekday.");
    }
    const key = `${dayOfWeek}:${startTime}`;
    if (keys.has(key)) {
      throw new Error("Duplicate day/time slots are not allowed in the same schedule.");
    }
    days.add(dayOfWeek);
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

export type MoveRecurringPackageSlotRequest = {
  tenantId: string;
  packageSlotId: string;
  targetSlotTemplateId: string;
  actorUserId: string;
  expectedTeacherId?: string;
  requireTeacherAvailability?: boolean;
};

type MoveRecurringPackageSlotResult = {
  package_slot: Record<string, unknown>;
  previous_package_slot_id: string;
  effective_from: string;
};

export const moveRecurringPackageSlotFromNextOccurrence = async (
  client: ClientLike,
  payload: MoveRecurringPackageSlotRequest,
): Promise<MoveRecurringPackageSlotResult> => {
  const timestamp = new Date().toISOString();
  const todayKey = timestamp.slice(0, 10);

  const slotRes = await client
    .from("online_recurring_package_slots")
    .select(
      "id, package_id, slot_template_id, day_of_week_snapshot, start_time_snapshot, duration_minutes_snapshot, status, effective_from, effective_to",
    )
    .eq("tenant_id", payload.tenantId)
    .eq("id", payload.packageSlotId)
    .maybeSingle();
  if (slotRes.error) throw slotRes.error;

  const currentSlot = slotRes.data as PackageSlotRow | null;
  if (!currentSlot?.id || !slotIsCurrentOrFuture(currentSlot, todayKey)) {
    throw new Error("Package slot not found.");
  }

  const packageRes = await client
    .from("online_recurring_packages")
    .select("id, teacher_id, course_id, status, effective_to, sessions_per_week")
    .eq("tenant_id", payload.tenantId)
    .eq("id", currentSlot.package_id)
    .maybeSingle();
  if (packageRes.error) throw packageRes.error;

  const pkg = packageRes.data as {
    id: string;
    teacher_id: string;
    course_id: string;
    status: string;
    effective_to: string | null;
    sessions_per_week: number;
  } | null;
  if (!pkg?.id || (payload.expectedTeacherId && pkg.teacher_id !== payload.expectedTeacherId)) {
    throw new Error("Package not found for this teacher.");
  }

  const targetTemplateRes = await client
    .from("online_slot_templates")
    .select("id, course_id, day_of_week, start_time, duration_minutes")
    .eq("tenant_id", payload.tenantId)
    .eq("id", payload.targetSlotTemplateId)
    .maybeSingle();
  if (targetTemplateRes.error) throw targetTemplateRes.error;

  const targetTemplate = targetTemplateRes.data as SlotTemplateRow | null;
  if (!targetTemplate?.id) throw new Error("Target slot template not found.");
  if (targetTemplate.course_id !== pkg.course_id) {
    throw new Error("Target slot must belong to the same course.");
  }

  if (currentSlot.slot_template_id === targetTemplate.id) {
    return {
      package_slot: currentSlot as unknown as Record<string, unknown>,
      previous_package_slot_id: currentSlot.id,
      effective_from: dateKey(currentSlot.effective_from) ?? todayKey,
    };
  }

  if (payload.requireTeacherAvailability !== false) {
    const availabilityRes = await client
      .from("online_teacher_slot_preferences")
      .select("id, is_available")
      .eq("tenant_id", payload.tenantId)
      .eq("teacher_id", pkg.teacher_id)
      .eq("slot_template_id", targetTemplate.id)
      .maybeSingle();
    if (availabilityRes.error) throw availabilityRes.error;
    if (!availabilityRes.data?.id || availabilityRes.data.is_available !== true) {
      throw new Error("Teacher is not available for the selected target slot.");
    }
  }

  const replacementWindow = await resolveReplacementWindow({
    client,
    tenantId: payload.tenantId,
    packageId: currentSlot.package_id,
    packageSlots: [currentSlot],
    targetDaysOfWeek: [targetTemplate.day_of_week],
    sessionsPerWeek: Number(pkg.sessions_per_week) || 0,
    timestamp,
  });
  const replacementEffectiveFrom = replacementWindow.effectiveFrom;
  const replacementEffectiveTo = dateKey(pkg.effective_to);
  const replacementRangeEnd = replacementEffectiveTo ?? OPEN_ENDED_DATE;

  const samePackageDayRes = await client
    .from("online_recurring_package_slots")
    .select("id, day_of_week_snapshot, effective_from, effective_to, status")
    .eq("tenant_id", payload.tenantId)
    .eq("package_id", currentSlot.package_id)
    .eq("status", "active")
    .neq("id", currentSlot.id);
  if (samePackageDayRes.error) throw samePackageDayRes.error;

  const samePackageDayConflict = ((samePackageDayRes.data ?? []) as PackageSlotRow[]).some(
    (slot) =>
      slot.day_of_week_snapshot === targetTemplate.day_of_week &&
      slotOverlapsDateRange(slot, replacementEffectiveFrom, replacementRangeEnd),
  );
  if (samePackageDayConflict) {
    throw new Error("A package cannot have more than one slot on the same weekday.");
  }

  const activeTeacherPackagesRes = await client
    .from("online_recurring_packages")
    .select("id")
    .eq("tenant_id", payload.tenantId)
    .eq("teacher_id", pkg.teacher_id)
    .in("status", [...ACTIVE_PACKAGE_STATUSES]);
  if (activeTeacherPackagesRes.error) throw activeTeacherPackagesRes.error;

  const activeTeacherPackageIds = (activeTeacherPackagesRes.data ?? [])
    .map((row) => String(row.id ?? ""))
    .filter(Boolean);
  if (activeTeacherPackageIds.length > 0) {
    const conflictingSlotRes = await client
      .from("online_recurring_package_slots")
      .select("id, package_id, day_of_week_snapshot, start_time_snapshot, effective_from, effective_to, status")
      .eq("tenant_id", payload.tenantId)
      .eq("status", "active")
      .in("package_id", activeTeacherPackageIds)
      .neq("id", currentSlot.id);
    if (conflictingSlotRes.error) throw conflictingSlotRes.error;

    const targetDayTimeKey = templateDayTimeKey(targetTemplate);
    const hasConflictingSlot = ((conflictingSlotRes.data ?? []) as PackageSlotRow[]).some(
      (slot) =>
        slotDayTimeKey(slot) === targetDayTimeKey &&
        slotOverlapsDateRange(slot, replacementEffectiveFrom, replacementRangeEnd),
    );
    if (hasConflictingSlot) {
      throw new Error("Target slot is already occupied for this teacher.");
    }
  }

  const currentWeekCutoverSlotIds = replacementWindow.currentWeekCutoverSlotIds;
  const regularCutoverSlotIds = [currentSlot.id].filter(
    (slotId) => !currentWeekCutoverSlotIds.includes(slotId),
  );
  if (currentWeekCutoverSlotIds.length > 0) {
    const currentWeekStart = weekStartDateKey(replacementEffectiveFrom);
    await closePackageSlotsBeforeDate({
      client,
      tenantId: payload.tenantId,
      packageSlotIds: currentWeekCutoverSlotIds,
      replacementDate: currentWeekStart,
      timestamp,
    });
    await cancelMovableOccurrencesForPackageSlotsFromDate({
      client,
      tenantId: payload.tenantId,
      packageSlotIds: currentWeekCutoverSlotIds,
      fromDate: currentWeekStart,
      timestamp,
    });
  }
  if (regularCutoverSlotIds.length > 0) {
    await closePackageSlotsBeforeDate({
      client,
      tenantId: payload.tenantId,
      packageSlotIds: regularCutoverSlotIds,
      replacementDate: replacementEffectiveFrom,
      timestamp,
    });
    await cancelMovableOccurrencesForPackageSlotsFromDate({
      client,
      tenantId: payload.tenantId,
      packageSlotIds: regularCutoverSlotIds,
      fromDate: replacementEffectiveFrom,
      timestamp,
    });
  }

  const insertRes = await client
    .from("online_recurring_package_slots")
    .insert({
      tenant_id: payload.tenantId,
      package_id: currentSlot.package_id,
      slot_template_id: targetTemplate.id,
      day_of_week_snapshot: targetTemplate.day_of_week,
      start_time_snapshot: targetTemplate.start_time,
      duration_minutes_snapshot: targetTemplate.duration_minutes,
      status: "active",
      effective_from: replacementEffectiveFrom,
      effective_to: replacementEffectiveTo,
    })
    .select("*")
    .single();
  if (insertRes.error) throw insertRes.error;

  await upsertTeacherAvailability({
    client,
    tenantId: payload.tenantId,
    teacherId: pkg.teacher_id,
    slotTemplateIds: [targetTemplate.id],
    timestamp,
    source: "auto_schedule",
  });
  await cleanupUnusedAutoScheduleAvailability({
    client,
    tenantId: payload.tenantId,
    teacherId: pkg.teacher_id,
    slotTemplateIds: [currentSlot.slot_template_id],
    timestamp,
  });

  return {
    package_slot: insertRes.data as Record<string, unknown>,
    previous_package_slot_id: currentSlot.id,
    effective_from: replacementEffectiveFrom,
  };
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

  const slots = normalizeTeacherScheduleSlots(payload.slots ?? []);
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
  const targetDayTimeKeys = new Set(templateRows.map(templateDayTimeKey));

  const activePackagesRes = await client
    .from("online_recurring_packages")
    .select(
      "id, student_id, course_id, teacher_id, student_package_assignment_id, effective_month, effective_from, effective_to, status"
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
    effective_from: string | null;
    effective_to: string | null;
    status: string;
  }>;
  const monthActivePackages = activePackages.filter((row) => isPackageActiveForMonth(row, monthStart));

  const monthActivePackageIds = monthActivePackages.map((row) => row.id);
  const timestamp = new Date().toISOString();
  const todayKey = timestamp.slice(0, 10);
  const monthEnd = monthEndDateKey(monthStart);
  const schedulingWindowStart = maxDateKey(monthStart, todayKey);
  const isFutureMonthSchedule = monthStart > todayKey;
  const activeSlotCountByPackageId = new Map<string, number>();
  if (monthActivePackageIds.length > 0) {
    const activePackageSlotsRes = await client
      .from("online_recurring_package_slots")
      .select("package_id, effective_from, effective_to, status")
      .eq("tenant_id", payload.tenantId)
      .eq("status", "active")
      .in("package_id", monthActivePackageIds);
    if (activePackageSlotsRes.error) throw activePackageSlotsRes.error;

    ((activePackageSlotsRes.data ?? []) as PackageSlotRow[])
      .filter((row) => slotOverlapsDateRange(row, schedulingWindowStart, monthEnd))
      .forEach((row) => {
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
      .select("id, day_of_week_snapshot, start_time_snapshot, effective_from, effective_to, status")
      .eq("tenant_id", payload.tenantId)
      .in("package_id", activePackageIds)
      .eq("status", "active");
    if (slotConflictRes.error) throw slotConflictRes.error;
    if (
      ((slotConflictRes.data ?? []) as PackageSlotRow[]).some(
        (slot) =>
          targetDayTimeKeys.has(slotDayTimeKey(slot)) &&
          slotOverlapsDateRange(slot, schedulingWindowStart, monthEnd),
      )
    ) {
      throw new Error("One or more selected slot times are already scheduled for this teacher.");
    }
  }

  const packageEffectiveFrom = maxDateKey(
    dateKey(assignment.effective_from) ?? monthStart,
    monthStart,
  );
  const packageEffectiveTo = dateKey(assignment.effective_to);
  const recurringStatus = assignment.status === "pending_payment" ? "pending_payment" : "active";
  let packageData: Record<string, unknown> | null = null;
  let packageSlotsData: Array<Record<string, unknown>> = [];

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
        effective_from: dateKey(existingPackage.effective_from) ?? packageEffectiveFrom,
        effective_to: packageEffectiveTo,
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
      .select("id, slot_template_id, day_of_week_snapshot, start_time_snapshot, duration_minutes_snapshot, status, effective_from, effective_to")
      .eq("tenant_id", payload.tenantId)
      .eq("package_id", existingPackage.id)
      .order("created_at", { ascending: true });
    if (existingSlotsRes.error) throw existingSlotsRes.error;

    const existingSlots = ((existingSlotsRes.data ?? []) as PackageSlotRow[]).filter((slot) =>
      slotOverlapsDateRange(slot, schedulingWindowStart, monthEnd),
    );
    const existingSlotByTemplateId = new Map<string, PackageSlotRow>();
    existingSlots.forEach((slot) => {
      const current = existingSlotByTemplateId.get(slot.slot_template_id);
      if (!current || (!current.effective_to && slot.effective_to)) {
        existingSlotByTemplateId.set(slot.slot_template_id, slot);
      }
    });

    const matchedSlotIds = new Set<string>();
    for (const template of templateRows) {
      const matchingSlot = existingSlotByTemplateId.get(template.id);
      if (!matchingSlot) continue;
      matchedSlotIds.add(matchingSlot.id);
    }

    const templatesToAssign = templateRows.filter((template) => !existingSlotByTemplateId.has(template.id));
    const reusableSlots = existingSlots.filter((slot) => !matchedSlotIds.has(slot.id));
    const cleanupTemplateIds: string[] = [];
    const replacementWindow = await resolveReplacementWindow({
      client,
      tenantId: payload.tenantId,
      packageId: existingPackage.id,
      packageSlots: reusableSlots,
      targetDaysOfWeek: templatesToAssign.map((template) => template.day_of_week),
      sessionsPerWeek: assignment.sessions_per_week_snapshot,
      timestamp,
      earliestEffectiveFrom: schedulingWindowStart,
      skipCurrentWeekCutover: isFutureMonthSchedule,
    });
    const replacementEffectiveFrom = replacementWindow.effectiveFrom;

    if (reusableSlots.length > 0) {
      cleanupTemplateIds.push(...reusableSlots.map((slot) => slot.slot_template_id));
      const currentWeekCutoverSlotIds = replacementWindow.currentWeekCutoverSlotIds;
      const regularCutoverSlotIds = reusableSlots
        .map((slot) => slot.id)
        .filter((slotId) => !currentWeekCutoverSlotIds.includes(slotId));
      if (currentWeekCutoverSlotIds.length > 0) {
        const currentWeekStart = weekStartDateKey(replacementEffectiveFrom);
        await closePackageSlotsBeforeDate({
          client,
          tenantId: payload.tenantId,
          packageSlotIds: currentWeekCutoverSlotIds,
          replacementDate: currentWeekStart,
          timestamp,
        });
        await cancelMovableOccurrencesForPackageSlotsFromDate({
          client,
          tenantId: payload.tenantId,
          packageSlotIds: currentWeekCutoverSlotIds,
          fromDate: currentWeekStart,
          timestamp,
        });
      }
      if (regularCutoverSlotIds.length > 0) {
        await closePackageSlotsBeforeDate({
          client,
          tenantId: payload.tenantId,
          packageSlotIds: regularCutoverSlotIds,
          replacementDate: replacementEffectiveFrom,
          timestamp,
        });
        await cancelMovableOccurrencesForPackageSlotsFromDate({
          client,
          tenantId: payload.tenantId,
          packageSlotIds: regularCutoverSlotIds,
          fromDate: replacementEffectiveFrom,
          timestamp,
        });
      }
    }

    if (templatesToAssign.length > 0) {
      const insertRows = templatesToAssign.map((template) => ({
        tenant_id: payload.tenantId,
        package_id: existingPackage.id,
        slot_template_id: template.id,
        day_of_week_snapshot: template.day_of_week,
        start_time_snapshot: template.start_time,
        duration_minutes_snapshot: template.duration_minutes,
        status: "active" as const,
        effective_from: replacementEffectiveFrom,
        effective_to: packageEffectiveTo,
      }));
      const insertRes = await client.from("online_recurring_package_slots").insert(insertRows);
      if (insertRes.error) throw insertRes.error;
    }

    await cleanupUnusedAutoScheduleAvailability({
      client,
      tenantId: payload.tenantId,
      teacherId: payload.teacherId,
      slotTemplateIds: cleanupTemplateIds,
      timestamp,
    });

    const refreshedSlotsRes = await client
      .from("online_recurring_package_slots")
      .select("*")
      .eq("tenant_id", payload.tenantId)
      .eq("package_id", existingPackage.id)
      .eq("status", "active")
      .order("day_of_week_snapshot", { ascending: true })
      .order("start_time_snapshot", { ascending: true });
    if (refreshedSlotsRes.error) throw refreshedSlotsRes.error;
    packageSlotsData = ((refreshedSlotsRes.data ?? []) as PackageSlotRow[])
      .filter((slot) => slotOverlapsDateRange(slot, schedulingWindowStart, monthEnd)) as unknown as Array<Record<string, unknown>>;
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
        effective_from: packageEffectiveFrom,
        effective_to: packageEffectiveTo,
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
      effective_from: packageEffectiveFrom,
      effective_to: dateKey(assignment.effective_to),
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

  await upsertTeacherAvailability({
    client,
    tenantId: payload.tenantId,
    teacherId: payload.teacherId,
    slotTemplateIds: templateIds,
    timestamp,
    source: "auto_schedule",
  });

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
  const slots = normalizeTeacherScheduleSlots(payload.slots ?? []);
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
    .select("id, slot_template_id, day_of_week_snapshot, effective_to, status")
    .eq("tenant_id", payload.tenantId)
    .eq("package_id", pkg.id)
    .eq("status", "active");
  if (activeSlotsRes.error) throw activeSlotsRes.error;

  const timestamp = new Date().toISOString();
  const todayKey = timestamp.slice(0, 10);
  const currentActiveSlots = ((activeSlotsRes.data ?? []) as PackageSlotRow[]).filter((slot) =>
    slotIsCurrentOrFuture(slot, todayKey),
  );
  const existingActiveCount = currentActiveSlots.length;
  if (existingActiveCount + slots.length > pkg.sessions_per_week) {
    throw new Error(
      `Package requires ${pkg.sessions_per_week} weekly slot(s). Already has ${existingActiveCount} active. Cannot add ${slots.length} more.`
    );
  }
  const existingDays = new Set(currentActiveSlots.map((slot) => Number(slot.day_of_week_snapshot)));
  if (slots.some((slot) => existingDays.has(slot.day_of_week))) {
    throw new Error("A package cannot have more than one slot on the same weekday.");
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
  const targetDayTimeKeys = new Set(templateRows.map(templateDayTimeKey));
  const slotEffectiveFrom = maxDateKey(dateKey(pkg.effective_from) ?? todayKey, todayKey);
  const slotEffectiveTo = dateKey(pkg.effective_to);
  const slotEffectiveRangeEnd = slotEffectiveTo ?? OPEN_ENDED_DATE;

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
      .select("id, day_of_week_snapshot, start_time_snapshot, effective_from, effective_to, status")
      .eq("tenant_id", payload.tenantId)
      .in("package_id", otherPackageIds)
      .eq("status", "active");
    if (conflictRes.error) throw conflictRes.error;
    if (
      ((conflictRes.data ?? []) as PackageSlotRow[]).some(
        (slot) =>
          targetDayTimeKeys.has(slotDayTimeKey(slot)) &&
          slotOverlapsDateRange(slot, slotEffectiveFrom, slotEffectiveRangeEnd),
      )
    ) {
      throw new Error("One or more selected slot times are already scheduled for this teacher.");
    }
  }

  // Also check for duplicates within the same package
  const existingTemplateIds = currentActiveSlots.map((row) => String(row.slot_template_id));
  const duplicateTemplates = templateIds.filter((id) => existingTemplateIds.includes(id));
  if (duplicateTemplates.length > 0) {
    throw new Error("One or more selected slots are already assigned to this package.");
  }

  // Insert new package slots
  const slotInsertRows = templateRows.map((template) => ({
    tenant_id: payload.tenantId,
    package_id: pkg.id,
    slot_template_id: template.id,
    day_of_week_snapshot: template.day_of_week,
    start_time_snapshot: template.start_time,
    duration_minutes_snapshot: template.duration_minutes,
    status: "active" as const,
    effective_from: slotEffectiveFrom,
    effective_to: slotEffectiveTo,
  }));
  const insertRes = await client
    .from("online_recurring_package_slots")
    .insert(slotInsertRows)
    .select("*");
  if (insertRes.error) throw insertRes.error;

  await upsertTeacherAvailability({
    client,
    tenantId: payload.tenantId,
    teacherId: payload.teacherId,
    slotTemplateIds: templateIds,
    timestamp,
    source: "auto_schedule",
  });

  return {
    package_id: pkg.id,
    new_slots: insertRes.data ?? [],
    total_active_slots: existingActiveCount + slots.length,
    sessions_per_week: pkg.sessions_per_week,
  };
};
