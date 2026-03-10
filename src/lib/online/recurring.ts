import { compareTeacherCandidates } from "@/lib/online/assignment";
import { dayOfWeekLabel, startTimeToMinutes } from "@/lib/online/slots";
import type {
  OnlineCourse,
  OnlinePlannerDay,
  OnlinePlannerEmptySlot,
  OnlinePlannerOccupiedPill,
  OnlinePlannerTeacherOption,
  OnlineRecurringPackage,
  OnlineRecurringPackageSlot,
  TeacherLoadCandidate,
} from "@/types/online";

export type OnlineTeacherAvailabilityRow = {
  slot_template_id: string;
  teacher_id: string;
  is_available: boolean;
  last_assigned_at: string | null;
};

export type OnlineSlotTemplateRow = {
  id: string;
  course_id: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  timezone: string | null;
  is_active: boolean;
};

export type OnlineStudentLite = {
  id: string;
  name: string | null;
  parent_name?: string | null;
  parent_contact_number?: string | null;
};

export type OnlinePlannerPackage = OnlineRecurringPackage & {
  student_name: string;
  parent_name: string | null;
  parent_contact_number: string | null;
  course_name: string;
  slots: OnlineRecurringPackageSlot[];
};

export const PLANNER_WEEKDAY_SEQUENCE = [1, 2, 3, 4, 5, 6, 0];
export const DEFAULT_ONLINE_SLOT_DURATION = 30;
export const DEFAULT_TIMEZONE = "Asia/Kuala_Lumpur";
export const ONLINE_RECURRING_SETUP_WARNING =
  "Recurring package planner is not configured yet. Please run the online attendance v2 migration.";

export const currentMonthKey = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const monthStartFromKey = (monthKey: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month - 1, 1));
};

export const nextMonthKey = (monthKey: string) => {
  const monthStart = monthStartFromKey(monthKey);
  if (!monthStart) return currentMonthKey();
  const next = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const toDateKey = (date: Date) => date.toISOString().slice(0, 10);

export const normalizeDateKey = (value: string | null | undefined) => {
  const input = `${value ?? ""}`.trim();
  if (!input) return null;

  const monthMatch = /^(\d{4})-(\d{2})$/.exec(input);
  if (monthMatch) return `${monthMatch[1]}-${monthMatch[2]}-01`;

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
  if (!dateMatch) return null;
  return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
};

export const startOfUtcWeek = (value: Date) => {
  const date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
};

export const parseWeekStart = (weekKey?: string | null) => {
  if (!weekKey) return startOfUtcWeek(new Date());
  const parsed = new Date(`${weekKey}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return startOfUtcWeek(new Date());
  return startOfUtcWeek(parsed);
};

export const addDaysUtc = (date: Date, days: number) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));

export const formatClockRange = (startTime: string, durationMinutes: number) => {
  const startMinutes = startTimeToMinutes(startTime);
  const endMinutes = startMinutes + durationMinutes;
  const toClock = (minutes: number) =>
    `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return `${toClock(startMinutes)} - ${toClock(endMinutes)}`;
};

export const resolveCourseDuration = (course: Pick<OnlineCourse, "default_slot_duration_minutes"> | null | undefined) =>
  course?.default_slot_duration_minutes && course.default_slot_duration_minutes > 0
    ? course.default_slot_duration_minutes
    : DEFAULT_ONLINE_SLOT_DURATION;

export const buildTeacherLoadMap = (
  packages: Array<Pick<OnlineRecurringPackage, "teacher_id" | "status">>
) => {
  const map = new Map<string, number>();
  packages
    .filter((row) => row.status === "active" || row.status === "pending_payment" || row.status === "draft")
    .forEach((row) => {
      map.set(row.teacher_id, (map.get(row.teacher_id) ?? 0) + 1);
    });
  return map;
};

export const getSharedTeacherCandidates = (params: {
  slotTemplateIds: string[];
  teacherAvailability: OnlineTeacherAvailabilityRow[];
  activePackages: Array<Pick<OnlineRecurringPackage, "teacher_id" | "status">>;
}) => {
  const { slotTemplateIds, teacherAvailability, activePackages } = params;
  const availableByTemplate = new Map<string, Set<string>>();
  const lastAssignedAtByTeacher = new Map<string, string | null>();

  teacherAvailability
    .filter((row) => row.is_available)
    .forEach((row) => {
      const current = availableByTemplate.get(row.slot_template_id) ?? new Set<string>();
      current.add(row.teacher_id);
      availableByTemplate.set(row.slot_template_id, current);
      if (!lastAssignedAtByTeacher.has(row.teacher_id)) {
        lastAssignedAtByTeacher.set(row.teacher_id, row.last_assigned_at);
      }
    });

  const teacherIntersection = slotTemplateIds.reduce<Set<string> | null>((acc, slotTemplateId) => {
    const current = availableByTemplate.get(slotTemplateId) ?? new Set<string>();
    if (acc === null) return new Set(current);
    return new Set(Array.from(acc).filter((teacherId) => current.has(teacherId)));
  }, null);

  const loadMap = buildTeacherLoadMap(activePackages);
  const candidates: TeacherLoadCandidate[] = Array.from(teacherIntersection ?? []).map((teacherId) => ({
    teacherId,
    activeLoad: loadMap.get(teacherId) ?? 0,
    lastAssignedAt: lastAssignedAtByTeacher.get(teacherId) ?? null,
  }));

  return candidates.sort(compareTeacherCandidates);
};

export const isPackageCurrentForMonth = (
  row: Pick<OnlineRecurringPackage, "effective_month" | "effective_to" | "status">,
  monthKey: string,
) => {
  if (row.status !== "active" && row.status !== "pending_payment" && row.status !== "draft") return false;

  const monthStart = normalizeDateKey(`${monthKey}-01`);
  const effectiveMonth = normalizeDateKey(row.effective_month);
  const effectiveTo = normalizeDateKey(row.effective_to);
  if (!monthStart || !effectiveMonth) return false;

  if (effectiveMonth > monthStart) return false;
  if (effectiveTo && effectiveTo < monthStart) return false;
  return true;
};

export const buildPlannerDays = (params: {
  selectedTeacherId: string;
  monthKey: string;
  weekStart: Date;
  templates: OnlineSlotTemplateRow[];
  teacherAvailability: OnlineTeacherAvailabilityRow[];
  packages: OnlinePlannerPackage[];
  coursesById: Map<string, OnlineCourse>;
}) => {
  const { selectedTeacherId, weekStart, templates, teacherAvailability, packages, coursesById } = params;
  const packageBySlotTemplateId = new Map<string, OnlinePlannerPackage>();
  const packageSlotBySlotTemplateId = new Map<string, OnlineRecurringPackageSlot>();

  packages.forEach((pkg) => {
    pkg.slots.forEach((slot) => {
      packageBySlotTemplateId.set(slot.slot_template_id, pkg);
      packageSlotBySlotTemplateId.set(slot.slot_template_id, slot);
    });
  });

  const teacherAvailableIds = new Set(
    teacherAvailability
      .filter((row) => row.teacher_id === selectedTeacherId && row.is_available)
      .map((row) => row.slot_template_id)
  );

  const relevantTemplates = [...templates].sort((left, right) => {
      if (left.day_of_week !== right.day_of_week) return left.day_of_week - right.day_of_week;
      return left.start_time.localeCompare(right.start_time);
    });

  const nextOccurrenceDateByDay = new Map<number, string>();
  PLANNER_WEEKDAY_SEQUENCE.forEach((day, index) => {
    nextOccurrenceDateByDay.set(day, toDateKey(addDaysUtc(weekStart, index)));
  });

  return PLANNER_WEEKDAY_SEQUENCE.map<OnlinePlannerDay>((day) => {
    const occupiedPills: OnlinePlannerOccupiedPill[] = [];
    const emptySlots: OnlinePlannerEmptySlot[] = [];

    relevantTemplates
      .filter((template) => template.day_of_week === day)
      .forEach((template) => {
        const owningPackage = packageBySlotTemplateId.get(template.id);
        const packageSlot = packageSlotBySlotTemplateId.get(template.id);

        if (owningPackage && packageSlot) {
          occupiedPills.push({
            slot_template_id: template.id,
            package_id: owningPackage.id,
            package_slot_id: packageSlot.id,
            student_id: owningPackage.student_id,
            student_name: owningPackage.student_name,
            parent_name: owningPackage.parent_name,
            parent_contact_number: owningPackage.parent_contact_number,
            course_id: owningPackage.course_id,
            course_name: owningPackage.course_name,
            day_of_week: day,
            start_time: template.start_time,
            duration_minutes: template.duration_minutes,
            effective_month: owningPackage.effective_month,
            next_occurrence_date: nextOccurrenceDateByDay.get(day) ?? null,
            next_month_change_pending: false,
          });
          return;
        }

        emptySlots.push({
          slot_template_id: template.id,
          course_id: template.course_id,
          course_name: coursesById.get(template.course_id)?.name ?? "Unknown Course",
          day_of_week: day,
          start_time: template.start_time,
          duration_minutes: template.duration_minutes,
          is_active: template.is_active,
          is_available: teacherAvailableIds.has(template.id),
        });
      });

    occupiedPills.sort((left, right) => left.start_time.localeCompare(right.start_time));
    emptySlots.sort((left, right) => left.start_time.localeCompare(right.start_time));

    return {
      day_of_week: day,
      label: dayOfWeekLabel(day),
      occupied_pills: occupiedPills,
      hidden_empty_count: emptySlots.length,
      empty_slots: emptySlots,
    };
  });
};

export const buildTeacherOptions = (params: {
  teachers: Array<{ id: string; name: string }>;
  packages: Array<Pick<OnlineRecurringPackage, "teacher_id" | "status">>;
  teacherAvailability: OnlineTeacherAvailabilityRow[];
}) => {
  const loadMap = buildTeacherLoadMap(params.packages);
  const availabilityMap = new Map<string, number>();

  params.teacherAvailability
    .filter((row) => row.is_available)
    .forEach((row) => {
      availabilityMap.set(row.teacher_id, (availabilityMap.get(row.teacher_id) ?? 0) + 1);
    });

  return params.teachers.map<OnlinePlannerTeacherOption>((teacher) => ({
    id: teacher.id,
    name: teacher.name,
    active_package_count: loadMap.get(teacher.id) ?? 0,
    available_slot_count: availabilityMap.get(teacher.id) ?? 0,
  }));
};
