"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import DateDropdown from "@/components/online/DateDropdown";
import MonthDropdown from "@/components/online/MonthDropdown";
import MonthlyAttendancePanel from "@/components/online/MonthlyAttendancePanel";
import { PlannerContextMenu, type PlannerContextAction } from "@/components/online/PlannerContextMenu";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { authFetch } from "@/lib/authFetch";
import { filterAttendanceRowsToDate } from "@/lib/online/attendanceRows";
import { supabase } from "@/lib/supabaseClient";
import { getUserWithRecovery } from "@/lib/supabase/clientAuth";
import { useTeachingModeContext } from "@/contexts/TeachingModeContext";
import { cn } from "@/lib/utils";
import type { OnlineTeacherScheduleSlotInput, OnlineTeacherSchedulerOptions } from "@/types/online";
import { ChevronDown } from "lucide-react";

type PlannerPill = {
  slot_template_id: string;
  package_id: string;
  package_slot_id: string;
  student_id: string;
  student_name: string;
  parent_name: string | null;
  parent_contact_number: string | null;
  course_id: string;
  course_name: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  effective_month: string;
  next_occurrence_date: string | null;
  next_month_change_pending: boolean;
};

type EmptySlot = {
  slot_template_id: string;
  course_id: string;
  course_name: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  is_active: boolean;
  is_available: boolean;
};

type PlannerDay = {
  day_of_week: number;
  label: string;
  occupied_pills: PlannerPill[];
  hidden_empty_count: number;
  empty_slots: EmptySlot[];
};

type OccurrenceRow = {
  id?: string;
  package_id: string;
  package_slot_id: string;
  student_id: string;
  student_name: string;
  course_name: string;
  session_date: string;
  start_time: string;
  duration_minutes: number;
  attendance_status: "present" | "absent" | null;
};

type TeacherPayload = {
  month: string;
  occurrence_view?: "daily" | "monthly";
  selected_date?: string;
  warning?: string;
  summary: {
    total_sessions: number;
    marked_sessions: number;
    present_count: number;
    absent_count: number;
    attendance_rate_pct: number;
  };
  weekly_packages: Array<{
    id: string;
    student_id: string;
    student_name: string;
    course_id: string;
    course_name: string;
    student_package_assignment_id?: string | null;
    sessions_per_week: number;
    slots: Array<{
      id: string;
      package_id: string;
      slot_template_id: string;
      day_of_week_snapshot: number;
      start_time_snapshot: string;
      duration_minutes_snapshot: number;
      status: string;
      effective_from?: string;
      effective_to?: string | null;
    }>;
  }>;
  weekly_slot_actions: PlannerDay[];
  today_queue: OccurrenceRow[];
  monthly_occurrences: OccurrenceRow[];
  scheduler: OnlineTeacherSchedulerOptions;
};

type SlotDraft = OnlineTeacherScheduleSlotInput;
type PendingAssignment = OnlineTeacherSchedulerOptions["pending_assignments"][number];
type WeeklyPackage = TeacherPayload["weekly_packages"][number];
type WeeklyPackageSlot = WeeklyPackage["slots"][number];

type ScheduleResponse = {
  package?: Partial<WeeklyPackage> & { id?: string };
  package_slots?: WeeklyPackageSlot[];
};

type FillSlotsResponse = {
  package_id?: string;
  new_slots?: WeeklyPackageSlot[];
};

const ATTENDANCE_CACHE_VERSION = "v5";

const DAY_OPTIONS = [
  { value: 1, label: "Monday", shortLabel: "Mon" },
  { value: 2, label: "Tuesday", shortLabel: "Tue" },
  { value: 3, label: "Wednesday", shortLabel: "Wed" },
  { value: 4, label: "Thursday", shortLabel: "Thu" },
  { value: 5, label: "Friday", shortLabel: "Fri" },
  { value: 6, label: "Saturday", shortLabel: "Sat" },
  { value: 0, label: "Sunday", shortLabel: "Sun" },
];

const currentMonthKey = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
};

const currentDateKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const attendanceCacheKey = (
  teacherId: string,
  monthKey: string,
  view: "daily" | "monthly",
  dateKey?: string,
) => `teacher-online-attendance:${ATTENDANCE_CACHE_VERSION}:${teacherId}:${monthKey}:${view}:${dateKey ?? "all"}`;

const timeLabel = (value: string) => value.slice(0, 5);

const formatTimeWithMeridiem = (value: string) => {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour24 = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour24) || !Number.isFinite(minute)) return value;
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
};

const timeRangeLabel = (startTime: string, durationMinutes: number) => {
  const [hourRaw, minuteRaw] = startTime.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return formatTimeWithMeridiem(timeLabel(startTime));

  const startTotal = hour * 60 + minute;
  const endTotal = startTotal + Math.max(durationMinutes, 0);
  const endHour = Math.floor((endTotal / 60) % 24);
  const endMinute = endTotal % 60;
  const endClock = `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;

  return `${formatTimeWithMeridiem(timeLabel(startTime))} - ${formatTimeWithMeridiem(endClock)}`;
};

const secondNameLabel = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return parts[1];
  return parts[0] ?? "Student";
};

const getCourseTone = (courseName: string) => {
  if (/hafazan|tahfiz/i.test(courseName)) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (/islamic|islam|muamalah/i.test(courseName)) return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
};

type SelectedCalendarDay = {
  studentId: string;
  dateStr: string;
};

const buildDefaultSlots = (count: number): SlotDraft[] =>
  Array.from({ length: count }, (_, index) => ({
    day_of_week: DAY_OPTIONS[index % DAY_OPTIONS.length].value,
    start_time: "08:00",
  }));

const getMostCommonStartTime = (slots: SlotDraft[], fallback = "08:00") => {
  const counts = new Map<string, number>();
  let bestTime = fallback;
  let bestCount = 0;

  slots.forEach((slot) => {
    const normalizedTime = normalizeThirtyMinuteTime(slot.start_time);
    const nextCount = (counts.get(normalizedTime) ?? 0) + 1;
    counts.set(normalizedTime, nextCount);
    if (nextCount > bestCount) {
      bestTime = normalizedTime;
      bestCount = nextCount;
    }
  });

  return bestTime;
};

const fillMissingDays = (slots: SlotDraft[], requiredCount: number, startTime: string) => {
  const selectedDays = new Set(slots.map((slot) => slot.day_of_week));
  const next = slots.slice(0, requiredCount);
  for (const day of DAY_OPTIONS) {
    if (next.length >= requiredCount) break;
    if (selectedDays.has(day.value)) continue;
    next.push({ day_of_week: day.value, start_time: startTime });
    selectedDays.add(day.value);
  }
  return next;
};

const parseSlotTime = (value: string) => {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return { hour: 8, minute: 0 };
  return { hour: Math.min(Math.max(hour, 0), 23), minute: Math.min(Math.max(minute, 0), 59) };
};

const normalizeThirtyMinuteTime = (value: string) => {
  const { hour, minute } = parseSlotTime(value);
  const roundedTotal = Math.round((hour * 60 + minute) / 30) * 30;
  const normalizedTotal = ((roundedTotal % (24 * 60)) + 24 * 60) % (24 * 60);
  const nextHour = Math.floor(normalizedTotal / 60);
  const nextMinute = normalizedTotal % 60;
  return `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`;
};

const isThirtyMinuteTime = (value: string) => {
  const { minute } = parseSlotTime(value);
  return minute === 0 || minute === 30;
};

type TimeBlockPickerProps = {
  value: string;
  onChange: (value: string) => void;
  dense?: boolean;
  grouped?: boolean;
};

type ScheduleSelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  compact?: boolean;
};

const scheduleSelectClassName =
  "h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-10 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 sm:h-11 sm:rounded-2xl sm:px-4 sm:pr-11 sm:shadow-sm";

const ScheduleSelect = ({ className, children, compact = false, ...props }: ScheduleSelectProps) => (
  <div className="relative min-w-0">
    <select
      {...props}
      className={cn(
        scheduleSelectClassName,
        compact && "px-3 pr-8 text-center sm:pr-9",
        className,
      )}
    >
      {children}
    </select>
    <ChevronDown
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500",
        compact ? "right-2.5 sm:right-3" : "right-3 sm:right-4",
      )}
    />
  </div>
);

const scheduleSlotRowClassName =
  "grid grid-cols-[minmax(6.5rem,0.9fr)_minmax(11rem,1.1fr)] items-center gap-1.5 rounded-2xl bg-slate-50 p-2 sm:grid-cols-[minmax(11rem,1.15fr)_minmax(17rem,1fr)] sm:bg-transparent sm:p-0";

const ScheduleDayOptions = () => (
  <>
    {DAY_OPTIONS.map((day) => (
      <option key={day.label} value={day.value}>
        {day.shortLabel}
      </option>
    ))}
  </>
);

const TimeBlockPicker = ({ value, onChange, dense = false, grouped = false }: TimeBlockPickerProps) => {
  const normalized = normalizeThirtyMinuteTime(value);
  const { hour, minute } = parseSlotTime(normalized);
  const meridiem = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;

  const commit = (nextHour12: number, nextMinute: number, nextMeridiem: "AM" | "PM") => {
    const nextHour24 =
      nextMeridiem === "AM"
        ? nextHour12 === 12
          ? 0
          : nextHour12
        : nextHour12 === 12
          ? 12
          : nextHour12 + 12;
    onChange(`${String(nextHour24).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`);
  };

  if (grouped) {
    const groupedSelectClassName =
      "h-9 !rounded-none !border-0 !bg-transparent px-2 pr-7 text-center text-sm !shadow-none !outline-none !ring-0 focus:!border-0 focus:!ring-0 sm:h-9 sm:px-2 sm:pr-7";

    return (
      <div className="inline-grid w-full max-w-[15.5rem] grid-cols-[1fr_auto_1fr_1fr] items-center rounded-2xl border border-slate-200 bg-white px-2 py-1 shadow-sm transition focus-within:border-slate-300 focus-within:ring-2 focus-within:ring-slate-100">
        <ScheduleSelect
          compact
          className={groupedSelectClassName}
          value={hour12}
          onChange={(event) => commit(Number(event.target.value), minute, meridiem)}
          aria-label="Hour"
        >
          {Array.from({ length: 12 }, (_, index) => index + 1).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </ScheduleSelect>
        <span className="px-0.5 text-center text-sm font-semibold text-slate-300">:</span>
        <ScheduleSelect
          compact
          className={groupedSelectClassName}
          value={String(minute).padStart(2, "0")}
          onChange={(event) => commit(hour12, Number(event.target.value), meridiem)}
          aria-label="Minute"
        >
          <option value="00">00</option>
          <option value="30">30</option>
        </ScheduleSelect>
        <ScheduleSelect
          compact
          className={groupedSelectClassName}
          value={meridiem}
          onChange={(event) => commit(hour12, minute, event.target.value as "AM" | "PM")}
          aria-label="AM or PM"
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </ScheduleSelect>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid items-center sm:gap-2",
        dense
          ? "grid-cols-[minmax(2.75rem,0.85fr)_auto_minmax(3.5rem,1fr)_minmax(3.75rem,1fr)] gap-1 sm:grid-cols-[minmax(4.5rem,1fr)_auto_minmax(4.875rem,1fr)_minmax(5.25rem,1fr)]"
          : "grid-cols-[minmax(3.875rem,1fr)_auto_minmax(4.25rem,1fr)_minmax(4.5rem,1fr)] gap-1.5 sm:grid-cols-[minmax(4.5rem,1fr)_auto_minmax(4.875rem,1fr)_minmax(5.25rem,1fr)]",
      )}
    >
      <ScheduleSelect
        compact
        className={dense ? "px-2 pr-7 sm:px-3 sm:pr-9" : undefined}
        value={hour12}
        onChange={(event) => commit(Number(event.target.value), minute, meridiem)}
        aria-label="Hour"
      >
        {Array.from({ length: 12 }, (_, index) => index + 1).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </ScheduleSelect>
      <span className="text-center text-sm font-semibold text-slate-400">:</span>
      <ScheduleSelect
        compact
        className={dense ? "px-2 pr-7 sm:px-3 sm:pr-9" : undefined}
        value={String(minute).padStart(2, "0")}
        onChange={(event) => commit(hour12, Number(event.target.value), meridiem)}
        aria-label="Minute"
      >
        <option value="00">00</option>
        <option value="30">30</option>
      </ScheduleSelect>
      <ScheduleSelect
        compact
        className={dense ? "px-2 pr-7 sm:px-3 sm:pr-9" : undefined}
        value={meridiem}
        onChange={(event) => commit(hour12, minute, event.target.value as "AM" | "PM")}
        aria-label="AM or PM"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </ScheduleSelect>
    </div>
  );
};

const getSlotDraftValidationError = (slots: SlotDraft[], expectedCount?: number) => {
  if (typeof expectedCount === "number" && slots.length !== expectedCount) {
    return `Enter exactly ${expectedCount} valid weekly slot(s).`;
  }

  const days = new Set<number>();
  for (const slot of slots) {
    if (!slot.start_time) {
      return "Complete all slot day/time fields.";
    }
    if (!isThirtyMinuteTime(slot.start_time)) {
      return "Slot times must use 30-minute blocks (:00 or :30).";
    }
    if (days.has(slot.day_of_week)) {
      return "A package cannot have more than one slot on the same weekday.";
    }
    days.add(slot.day_of_week);
  }

  return null;
};

const formatDateHeading = (dateStr: string) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

const buildAttendanceSummary = (
  occurrences: OccurrenceRow[],
  todayKey = currentDateKey(),
): TeacherPayload["summary"] => {
  const summaryOccurrences = filterAttendanceRowsToDate(occurrences, todayKey);
  const markedSessions = summaryOccurrences.filter((occurrence) => Boolean(occurrence.attendance_status));
  const presentCount = markedSessions.filter(
    (occurrence) => occurrence.attendance_status === "present",
  ).length;
  const absentCount = markedSessions.filter(
    (occurrence) => occurrence.attendance_status === "absent",
  ).length;

  return {
    total_sessions: summaryOccurrences.length,
    marked_sessions: markedSessions.length,
    present_count: presentCount,
    absent_count: absentCount,
    attendance_rate_pct: markedSessions.length > 0
      ? Math.round((presentCount / markedSessions.length) * 100)
      : 0,
  };
};

const updateAttendanceSummaryForChange = (
  summary: TeacherPayload["summary"],
  fromStatus: OccurrenceRow["attendance_status"],
  toStatus: OccurrenceRow["attendance_status"],
): TeacherPayload["summary"] => {
  if (fromStatus === toStatus) return summary;

  const markedDelta = (toStatus ? 1 : 0) - (fromStatus ? 1 : 0);
  const presentDelta = (toStatus === "present" ? 1 : 0) - (fromStatus === "present" ? 1 : 0);
  const absentDelta = (toStatus === "absent" ? 1 : 0) - (fromStatus === "absent" ? 1 : 0);
  const markedSessions = Math.max(summary.marked_sessions + markedDelta, 0);
  const presentCount = Math.max(summary.present_count + presentDelta, 0);

  return {
    ...summary,
    marked_sessions: markedSessions,
    present_count: presentCount,
    absent_count: Math.max(summary.absent_count + absentDelta, 0),
    attendance_rate_pct: markedSessions > 0 ? Math.round((presentCount / markedSessions) * 100) : 0,
  };
};

const getDayLabel = (dayOfWeek: number) =>
  DAY_OPTIONS.find((option) => option.value === dayOfWeek)?.label.slice(0, 3).toUpperCase() ??
  String(dayOfWeek);

const buildWeeklySlotActions = (packages: WeeklyPackage[], monthKey: string): PlannerDay[] =>
  DAY_OPTIONS.map<PlannerDay>((day) => ({
    day_of_week: day.value,
    label: getDayLabel(day.value),
    hidden_empty_count: 0,
    empty_slots: [],
    occupied_pills: packages.flatMap((pkg) =>
      pkg.slots
        .filter((slot) => slot.status === "active" && slot.day_of_week_snapshot === day.value)
        .map<PlannerPill>((slot) => ({
          slot_template_id: slot.slot_template_id,
          package_id: pkg.id,
          package_slot_id: slot.id,
          student_id: pkg.student_id,
          student_name: pkg.student_name,
          parent_name: null,
          parent_contact_number: null,
          course_id: pkg.course_id,
          course_name: pkg.course_name,
          day_of_week: slot.day_of_week_snapshot,
          start_time: slot.start_time_snapshot,
          duration_minutes: slot.duration_minutes_snapshot,
          effective_month: `${monthKey}-01`,
          next_occurrence_date: null,
          next_month_change_pending: false,
        })),
    ),
  }));

const refreshAttendanceInBackground = (loadAttendance: () => Promise<void>) => {
  window.setTimeout(() => {
    void loadAttendance();
  }, 250);
};

export default function TeacherOnlineAttendancePage() {
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const { programScope } = useTeachingModeContext();
  const [month, setMonth] = useState(currentMonthKey());
  const [selectedDate, setSelectedDate] = useState(currentDateKey());
  const [payload, setPayload] = useState<TeacherPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selectedPill, setSelectedPill] = useState<PlannerPill | null>(null);
  const [rescheduleExpanded, setRescheduleExpanded] = useState(false);
  const [rescheduleSlots, setRescheduleSlots] = useState<SlotDraft[]>([]);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [rescheduleSharedTime, setRescheduleSharedTime] = useState("08:00");
  const [rescheduleHadMixedTimes, setRescheduleHadMixedTimes] = useState(false);
  const [confirmUnassign, setConfirmUnassign] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    title?: string;
    actions: PlannerContextAction[];
  } | null>(null);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAssignmentId, setScheduleAssignmentId] = useState("");
  const [scheduleSlots, setScheduleSlots] = useState<SlotDraft[]>([]);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const [classView, setClassView] = useState<"daily" | "monthly">("daily");
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<SelectedCalendarDay | null>(null);
  const [fillOpen, setFillOpen] = useState(false);
  const [fillPackageId, setFillPackageId] = useState("");
  const [fillSlots, setFillSlots] = useState<SlotDraft[]>([]);
  const [fillError, setFillError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      const { data, error: userError } = await getUserWithRecovery(supabase);
      if (!mounted) return;
      if (userError || !data.user) {
        window.location.href = "/login";
        return;
      }
      setTeacherId(data.user.id);
    };
    void loadUser();
    return () => {
      mounted = false;
    };
  }, []);

  const loadAttendance = useCallback(async (options?: {
    preservePayloadOnError?: boolean;
    showLoading?: boolean;
    view?: "daily" | "monthly";
    date?: string;
  }) => {
    const preservePayloadOnError = options?.preservePayloadOnError ?? false;
    const showLoading = options?.showLoading ?? true;
    const view = options?.view ?? "daily";
    const date = options?.date ?? selectedDate;
    if (!teacherId) return;
    if (showLoading) {
      const cachedPayload = window.sessionStorage.getItem(
        attendanceCacheKey(teacherId, month, view, view === "daily" ? date : undefined),
      );
      if (cachedPayload) {
        try {
          setPayload(JSON.parse(cachedPayload) as TeacherPayload);
          setLoading(false);
        } catch {
          setLoading(true);
        }
      } else {
        setLoading(true);
      }
    }
    setError(null);
    try {
      const params = new URLSearchParams({ month, view });
      if (view === "daily") params.set("date", date);
      const response = await authFetch(`/api/teacher/online/attendance?${params.toString()}`);
      const data = (await response.json()) as TeacherPayload & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch online attendance");
      }
      setPayload(data);
      const cacheKey = attendanceCacheKey(teacherId, month, view, view === "daily" ? date : undefined);
      const serialized = JSON.stringify(data);
      try {
        window.sessionStorage.setItem(cacheKey, serialized);
      } catch {
        // Quota exceeded — evict this teacher's older cache entries, then retry once.
        try {
          const prefix = `teacher-online-attendance:${ATTENDANCE_CACHE_VERSION}:${teacherId}:`;
          for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
            const existingKey = window.sessionStorage.key(i);
            if (existingKey && existingKey !== cacheKey && existingKey.startsWith(prefix)) {
              window.sessionStorage.removeItem(existingKey);
            }
          }
          window.sessionStorage.setItem(cacheKey, serialized);
        } catch {
          // Still over quota — data is still displayed, cache is skipped.
        }
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load attendance");
      if (!preservePayloadOnError) {
        setPayload(null);
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [month, selectedDate, teacherId]);

  const silentlyRefreshAttendance = useCallback(async () => {
    await loadAttendance({
      preservePayloadOnError: true,
      showLoading: false,
      view: classView === "monthly" ? "monthly" : "daily",
      date: selectedDate,
    });
  }, [classView, loadAttendance, selectedDate]);

  useEffect(() => {
    if (!teacherId) return;
    void loadAttendance({
      view: classView === "monthly" ? "monthly" : "daily",
      date: selectedDate,
    });
  }, [classView, selectedDate, teacherId, loadAttendance]);

  const underScheduledPackageIds = useMemo(() => {
    if (!payload) return new Set<string>();
    return new Set(
      payload.weekly_packages
        .filter((pkg) => pkg.slots.length > 0 && pkg.slots.length < pkg.sessions_per_week)
        .map((pkg) => pkg.id),
    );
  }, [payload]);

  const pendingAssignments = useMemo(() => {
    const all = payload?.scheduler.pending_assignments ?? [];
    if (!payload || underScheduledPackageIds.size === 0) return all;
    // Exclude assignments that are already shown in the under-scheduled banner
    const underScheduledStudentCourseKeys = new Set(
      payload.weekly_packages
        .filter((pkg) => underScheduledPackageIds.has(pkg.id))
        .map((pkg) => `${pkg.student_id}:${pkg.course_id}`),
    );
    return all.filter((a) => !underScheduledStudentCourseKeys.has(`${a.student_id}:${a.course_id}`));
  }, [payload, underScheduledPackageIds]);

  const underScheduledPackages = useMemo(() => {
    if (!payload) return [];
    return payload.weekly_packages.filter((pkg) => underScheduledPackageIds.has(pkg.id));
  }, [payload, underScheduledPackageIds]);

  const fillPackage = useMemo(() => {
    if (!fillPackageId || !payload) return null;
    return payload.weekly_packages.find((pkg) => pkg.id === fillPackageId) ?? null;
  }, [payload, fillPackageId]);

  const fillMissingCount = fillPackage
    ? Math.max(fillPackage.sessions_per_week - fillPackage.slots.length, 0)
    : 0;

  const selectedAssignment = useMemo<PendingAssignment | null>(() => {
    if (!payload || !scheduleAssignmentId) return null;
    return payload.scheduler.pending_assignments.find((assignment) => assignment.id === scheduleAssignmentId) ?? null;
  }, [payload, scheduleAssignmentId]);

  useEffect(() => {
    if (!selectedAssignment) {
      setScheduleSlots([]);
      return;
    }
    setScheduleSlots((current) => {
      const required = Math.max(selectedAssignment.sessions_per_week, 1);
      const next = current.slice(0, required);
      if (next.length < required) {
        const defaults = buildDefaultSlots(required - next.length);
        next.push(...defaults);
      }
      return next;
    });
  }, [selectedAssignment]);

  // Reset slot action state when selected pill changes
  useEffect(() => {
    setRescheduleExpanded(false);
    setRescheduleSlots([]);
    setRescheduleError(null);
    setRescheduleSharedTime("08:00");
    setRescheduleHadMixedTimes(false);
    setConfirmUnassign(false);
  }, [selectedPill]);

  const sortedDailyQueue = useMemo(() => {
    const monthlyMatches = (payload?.monthly_occurrences ?? []).filter(
      (occurrence) => occurrence.session_date === selectedDate,
    );
    const source =
      monthlyMatches.length > 0 || payload?.occurrence_view === "monthly"
        ? monthlyMatches
        : payload?.selected_date === selectedDate
          ? payload.today_queue
          : [];

    return [...source].sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [
    payload?.monthly_occurrences,
    payload?.occurrence_view,
    payload?.selected_date,
    payload?.today_queue,
    selectedDate,
  ]);

  const selectedCalendarDayDetails = useMemo(() => {
    if (!selectedCalendarDay) return null;
    const occurrences = (payload?.monthly_occurrences ?? [])
      .filter(
        (occurrence) =>
          occurrence.student_id === selectedCalendarDay.studentId &&
          occurrence.session_date === selectedCalendarDay.dateStr,
      )
      .sort((a, b) => a.start_time.localeCompare(b.start_time));

    if (occurrences.length === 0) return null;

    return {
      dateStr: selectedCalendarDay.dateStr,
      studentName: occurrences[0].student_name,
      occurrences,
    };
  }, [payload?.monthly_occurrences, selectedCalendarDay]);

  const toggleStudentExpanded = (studentId: string) => {
    setExpandedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const handleCalendarCellClick = (occurrences: OccurrenceRow[]) => {
    const missingIds = occurrences.some((o) => !o.id);
    if (missingIds) {
      setError("Attendance records are still being set up. Please reload the page and try again.");
      return;
    }
    if (occurrences.length > 1) {
      setSelectedCalendarDay({
        studentId: occurrences[0].student_id,
        dateStr: occurrences[0].session_date,
      });
      return;
    }

    const [occurrence] = occurrences;
    const newStatus = occurrence.attendance_status === "present" ? "absent" : "present";
    void markAttendance(occurrence, newStatus);
  };


  const visiblePlannerDays = useMemo(
    () => (payload?.weekly_slot_actions ?? []).filter((day) => day.occupied_pills.length > 0),
    [payload?.weekly_slot_actions],
  );

  const [confirmRemark, setConfirmRemark] = useState<{
    occurrence: OccurrenceRow;
    newStatus: "present" | "absent";
  } | null>(null);

  const doMarkAttendance = async (occurrence: OccurrenceRow, status: "present" | "absent") => {
    if (!occurrence.id) return;
    const previousStatus = occurrence.attendance_status;
    setBusyKey(`mark:${occurrence.id}`);

    const applyAttendanceStatus = (
      prev: TeacherPayload | null,
      nextStatus: OccurrenceRow["attendance_status"],
      fromStatus: OccurrenceRow["attendance_status"],
    ) => {
      if (!prev) return prev;
      const updateOcc = (occ: OccurrenceRow) =>
        occ.id === occurrence.id ? { ...occ, attendance_status: nextStatus } : occ;
      const monthlyOccurrences = prev.monthly_occurrences.map(updateOcc);

      return {
        ...prev,
        summary:
          occurrence.session_date <= currentDateKey()
            ? updateAttendanceSummaryForChange(prev.summary, fromStatus, nextStatus)
            : prev.summary,
        today_queue: prev.today_queue.map(updateOcc),
        monthly_occurrences: monthlyOccurrences,
      };
    };

    setPayload((prev) => {
      return applyAttendanceStatus(prev, status, previousStatus);
    });

    try {
      const response = await authFetch("/api/teacher/online/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occurrence_id: occurrence.id,
          status,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Failed to mark attendance");
    } catch (markError) {
      setPayload((prev) => {
        return applyAttendanceStatus(prev, previousStatus, status);
      });
      setError(markError instanceof Error ? markError.message : "Failed to mark attendance");
    } finally {
      setBusyKey(null);
    }
  };

  const markAttendance = async (occurrence: OccurrenceRow, status: "present" | "absent") => {
    // If already marked with a different status, confirm first
    if (occurrence.attendance_status !== null && occurrence.attendance_status !== status) {
      setConfirmRemark({ occurrence, newStatus: status });
      return;
    }
    await doMarkAttendance(occurrence, status);
  };

  const openRescheduleEditor = (pill: PlannerPill) => {
    const pkg = payload?.weekly_packages.find((item) => item.id === pill.package_id);
    if (!pkg) return;
    if (!pkg.student_package_assignment_id) {
      setError("This package is missing its assignment link, so weekly reschedule is unavailable.");
      return;
    }

    const sortedCurrentSlots = [...pkg.slots]
      .sort((left, right) => {
        if (left.day_of_week_snapshot !== right.day_of_week_snapshot) {
          return left.day_of_week_snapshot - right.day_of_week_snapshot;
        }
        return left.start_time_snapshot.localeCompare(right.start_time_snapshot);
      })
      .map<SlotDraft>((slot) => ({
        day_of_week: slot.day_of_week_snapshot,
        start_time: normalizeThirtyMinuteTime(slot.start_time_snapshot.slice(0, 5)),
      }));

    const required = Math.max(pkg.sessions_per_week, 1);
    const sharedStartTime = getMostCommonStartTime(sortedCurrentSlots);
    const hadMixedTimes = new Set(sortedCurrentSlots.map((slot) => slot.start_time)).size > 1;
    const sameTimeSlots = sortedCurrentSlots
      .slice(0, required)
      .map((slot) => ({ ...slot, start_time: sharedStartTime }));
    const next = fillMissingDays(sameTimeSlots, required, sharedStartTime);

    setSelectedPill(pill);
    setRescheduleSlots(next);
    setRescheduleError(null);
    setRescheduleSharedTime(sharedStartTime);
    setRescheduleHadMixedTimes(hadMixedTimes);
    setConfirmUnassign(false);
    setRescheduleExpanded(true);
  };

  const closeSelectedPillModal = () => {
    setSelectedPill(null);
    setRescheduleExpanded(false);
    setRescheduleSlots([]);
    setRescheduleError(null);
    setRescheduleSharedTime("08:00");
    setRescheduleHadMixedTimes(false);
    setConfirmUnassign(false);
  };

  const submitReschedule = async () => {
    if (!selectedPill || !payload) return;
    const pkg = payload.weekly_packages.find((item) => item.id === selectedPill.package_id);
    if (!pkg?.student_package_assignment_id) {
      setRescheduleError("This package is missing its assignment link, so weekly reschedule is unavailable.");
      return;
    }
    const validationError = getSlotDraftValidationError(
      rescheduleSlots,
      Math.max(pkg.sessions_per_week, 1),
    );
    if (validationError) {
      setRescheduleError(validationError);
      return;
    }

    setRescheduleError(null);
    setBusyKey(`reschedule:${pkg.id}`);
    try {
      const response = await authFetch("/api/teacher/online/attendance/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignment_id: pkg.student_package_assignment_id,
          month,
          slots: rescheduleSlots,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Failed to reschedule weekly slots");

      setPayload((prev) => {
        if (!prev) return prev;
        const responseData = data as ScheduleResponse;
        const nextSlots = responseData.package_slots ?? [];
        const weeklyPackages = prev.weekly_packages.map((item) =>
          item.id === pkg.id ? { ...item, slots: nextSlots } : item,
        );
        const nextSlotIds = new Set(nextSlots.map((slot) => slot.id));
        const monthlyOccurrences = prev.monthly_occurrences.filter(
          (occurrence) =>
            occurrence.package_id !== pkg.id || nextSlotIds.has(occurrence.package_slot_id),
        );

        return {
          ...prev,
          summary: prev.occurrence_view === "monthly" ? buildAttendanceSummary(monthlyOccurrences) : prev.summary,
          weekly_packages: weeklyPackages,
          weekly_slot_actions: buildWeeklySlotActions(weeklyPackages, month),
          monthly_occurrences: monthlyOccurrences,
          today_queue: prev.today_queue.filter(
            (occurrence) =>
              occurrence.package_id !== pkg.id || nextSlotIds.has(occurrence.package_slot_id),
          ),
        };
      });
      setRescheduleExpanded(false);
      setRescheduleSlots([]);
      setRescheduleError(null);
      setRescheduleSharedTime("08:00");
      setRescheduleHadMixedTimes(false);
      setError(null);
      setSelectedPill(null);
      refreshAttendanceInBackground(silentlyRefreshAttendance);
    } catch (caughtError) {
      setRescheduleError(
        caughtError instanceof Error ? caughtError.message : "Failed to reschedule weekly slots",
      );
    } finally {
      setBusyKey(null);
    }
  };

  const submitSchedule = async () => {
    if (!payload) return;
    if (!scheduleAssignmentId || !selectedAssignment) {
      setScheduleError("Select an assigned package first.");
      return;
    }
    const validationError = getSlotDraftValidationError(
      scheduleSlots,
      Math.max(selectedAssignment.sessions_per_week, 1),
    );
    if (validationError) {
      setScheduleError(validationError);
      return;
    }

    setScheduleError(null);
    setBusyKey("schedule");
    try {
      const response = await authFetch("/api/teacher/online/attendance/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignment_id: scheduleAssignmentId,
          month,
          slots: scheduleSlots,
        }),
      });
      const data = (await response.json()) as ScheduleResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Failed to schedule student");

      setPayload((prev) => {
        if (!prev) return prev;
        const scheduledPackageId = data.package?.id;
        if (!scheduledPackageId) return prev;

        const scheduledPackage: WeeklyPackage = {
          id: scheduledPackageId,
          student_id: selectedAssignment.student_id,
          student_name: selectedAssignment.student_name,
          course_id: selectedAssignment.course_id,
          course_name: selectedAssignment.course_name,
          student_package_assignment_id: selectedAssignment.id,
          sessions_per_week: selectedAssignment.sessions_per_week,
          slots: data.package_slots ?? [],
        };
        const packageExists = prev.weekly_packages.some((pkg) => pkg.id === scheduledPackageId);
        const weeklyPackages = packageExists
          ? prev.weekly_packages.map((pkg) => (pkg.id === scheduledPackageId ? scheduledPackage : pkg))
          : [...prev.weekly_packages, scheduledPackage];

        return {
          ...prev,
          weekly_packages: weeklyPackages,
          weekly_slot_actions: buildWeeklySlotActions(weeklyPackages, month),
          scheduler: {
            ...prev.scheduler,
            pending_assignments: prev.scheduler.pending_assignments.filter(
              (assignment) => assignment.id !== selectedAssignment.id,
            ),
          },
        };
      });
      setScheduleOpen(false);
      setScheduleAssignmentId("");
      setScheduleSlots([]);
      setScheduleError(null);
      setError(null);
      refreshAttendanceInBackground(silentlyRefreshAttendance);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Failed to schedule student";
      if (message.includes("already has a schedule for the selected month")) {
        setScheduleError("This student is already scheduled this month. Use Reschedule weekly slots in Class Timetable.");
      } else {
        setScheduleError(message);
      }
    } finally {
      setBusyKey(null);
    }
  };

  const openFillModal = (packageId: string) => {
    const pkg = payload?.weekly_packages.find((p) => p.id === packageId);
    if (!pkg) return;
    const missing = Math.max(pkg.sessions_per_week - pkg.slots.length, 0);
    if (missing <= 0) return;
    setFillPackageId(packageId);
    setFillSlots(buildDefaultSlots(missing));
    setFillError(null);
    setFillOpen(true);
    setSelectedPill(null);
  };

  const submitFill = async () => {
    if (!fillPackageId || fillSlots.length === 0) return;
    const validationError = getSlotDraftValidationError(fillSlots, fillSlots.length);
    if (validationError) {
      setFillError(validationError);
      return;
    }
    setFillError(null);
    setBusyKey("fill");
    try {
      const response = await authFetch("/api/teacher/online/attendance/package-slots/fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          package_id: fillPackageId,
          slots: fillSlots,
        }),
      });
      const data = (await response.json()) as FillSlotsResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Failed to fill slots");
      setPayload((prev) => {
        if (!prev) return prev;
        const nextSlots = data.new_slots ?? [];
        const weeklyPackages = prev.weekly_packages.map((pkg) =>
          pkg.id === fillPackageId ? { ...pkg, slots: [...pkg.slots, ...nextSlots] } : pkg,
        );

        return {
          ...prev,
          weekly_packages: weeklyPackages,
          weekly_slot_actions: buildWeeklySlotActions(weeklyPackages, month),
        };
      });
      setFillOpen(false);
      setFillPackageId("");
      setFillSlots([]);
      setFillError(null);
      setError(null);
      refreshAttendanceInBackground(silentlyRefreshAttendance);
    } catch (caughtError) {
      setFillError(caughtError instanceof Error ? caughtError.message : "Failed to fill slots");
    } finally {
      setBusyKey(null);
    }
  };

  const unassignAllSlots = async (pill: PlannerPill) => {
    const pkg = payload?.weekly_packages.find((item) => item.id === pill.package_id);
    const activeSlotIds = [...new Set((pkg?.slots ?? []).map((slot) => slot.id).filter(Boolean))];
    if (activeSlotIds.length === 0) {
      setError("No active slots found for this package.");
      return;
    }

    setBusyKey(`unassign-package:${pill.package_id}`);
    try {
      const response = await authFetch(
        `/api/teacher/online/attendance/package-slots/package/${encodeURIComponent(pill.package_id)}`,
        { method: "DELETE" },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Failed to unassign slots");

      setPayload((prev) => {
        if (!prev) return prev;
        const removedSlotIds = new Set(activeSlotIds);
        const weeklyPackages = prev.weekly_packages.map((item) =>
          item.id === pill.package_id
            ? { ...item, slots: item.slots.filter((slot) => !removedSlotIds.has(slot.id)) }
            : item,
        );
        const monthlyOccurrences = prev.monthly_occurrences.filter(
          (occurrence) => !removedSlotIds.has(occurrence.package_slot_id),
        );

        return {
          ...prev,
          summary: prev.occurrence_view === "monthly" ? buildAttendanceSummary(monthlyOccurrences) : prev.summary,
          weekly_packages: weeklyPackages,
          weekly_slot_actions: buildWeeklySlotActions(weeklyPackages, month),
          monthly_occurrences: monthlyOccurrences,
          today_queue: prev.today_queue.filter(
            (occurrence) => !removedSlotIds.has(occurrence.package_slot_id),
          ),
        };
      });
      if (selectedPill?.package_id === pill.package_id) {
        setSelectedPill(null);
      }
      setConfirmUnassign(false);
      setError(null);
      refreshAttendanceInBackground(silentlyRefreshAttendance);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to unassign slots");
    } finally {
      setBusyKey(null);
    }
  };

  const openContext = (event: React.MouseEvent, actions: PlannerContextAction[], title?: string) => {
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      title,
      actions,
    });
  };

  if (programScope === "campus") {
    return (
      <div className="min-h-screen bg-slate-50">
        <main className="mx-auto max-w-4xl p-6">
          <Card className="p-6">
            <h1 className="text-xl font-semibold text-slate-900">Online Attendance Unavailable</h1>
            <p className="mt-2 text-sm text-slate-600">
              This teacher account is currently scoped to campus programs only.
            </p>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(191,219,254,0.42),_transparent_36%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)]">
      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        {error ? (
          <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <div className="flex items-center justify-between gap-3">
              <span>{error}</span>
              <button
                type="button"
                className="shrink-0 text-rose-400 transition hover:text-rose-600"
                onClick={() => setError(null)}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </Card>
        ) : null}
        {payload?.warning ? (
          <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{payload.warning}</Card>
        ) : null}
        {pendingAssignments.length > 0 ? (
          <Card className="border-rose-200 bg-rose-50/90 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-500">
                  Packages Waiting For Slot Assignment
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {pendingAssignments.map((assignment) => (
                    <span
                      key={assignment.id}
                      className="rounded-full border border-rose-200 bg-white px-3 py-1 text-sm font-semibold text-rose-700"
                    >
                      {assignment.student_name} • {assignment.course_name}
                    </span>
                  ))}
                </div>
              </div>
              <Button
                className="self-start"
                onClick={() => {
                  setScheduleOpen(true);
                  setScheduleAssignmentId(pendingAssignments[0]?.id ?? "");
                  setScheduleSlots([]);
                  setScheduleError(null);
                }}
                disabled={pendingAssignments.length === 0}
              >
                Assign Slot
              </Button>
            </div>
          </Card>
        ) : null}
        {underScheduledPackages.length > 0 ? (
          <Card className="border-amber-200 bg-amber-50/90 p-4">
            <p className="text-xs font-medium uppercase tracking-widest text-amber-500">
              Incomplete Slots
            </p>
            <div className="mt-2 space-y-2">
              {underScheduledPackages.map((pkg) => (
                <div key={pkg.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-amber-900">
                    <span className="font-semibold">{pkg.student_name}</span>
                    {" "}&middot;{" "}{pkg.course_name}
                    {" "}<span className="text-amber-600">({pkg.slots.length}/{pkg.sessions_per_week} slots assigned)</span>
                  </p>
                  <Button
                    className="self-start bg-amber-600 text-white hover:bg-amber-700"
                    onClick={() => openFillModal(pkg.id)}
                  >
                    Fill Slots
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {loading && !payload ? (
            [1, 2, 3, 4].map((i) => (
              <Card key={i} className="animate-pulse p-4">
                <div className="h-3 w-20 rounded bg-slate-200" />
                <div className="mt-3 h-7 w-12 rounded bg-slate-200" />
              </Card>
            ))
          ) : (
            <>
              <Card className="p-4">
                <p className="text-xs uppercase text-slate-400">Total Sessions</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{payload?.summary.total_sessions ?? 0}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs uppercase text-slate-400">Marked</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{payload?.summary.marked_sessions ?? 0}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs uppercase text-slate-400">Present</p>
                <p className="mt-1 text-2xl font-semibold text-emerald-700">{payload?.summary.present_count ?? 0}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs uppercase text-slate-400">Attendance</p>
                <p className="mt-1 text-2xl font-semibold text-sky-700">{payload?.summary.attendance_rate_pct ?? 0}%</p>
              </Card>
            </>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Class Timetable</h2>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 lg:justify-end">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                Islamic Course
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Hafazan
              </span>
            </div>
          </div>
          {visiblePlannerDays.length === 0 ? (
            <Card className="p-4 text-sm text-slate-500">No scheduled slots.</Card>
          ) : null}
          {visiblePlannerDays.map((day) => (
            <Card key={day.day_of_week} className="rounded-[24px] border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">{day.label}</h3>
                  <p className="mt-1 text-sm text-slate-500">{day.occupied_pills.length} scheduled</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                {day.occupied_pills.map((pill) => (
                  <button
                    key={pill.package_slot_id}
                    type="button"
                    className={cn(
                      "min-w-[168px] rounded-[22px] border px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5",
                      getCourseTone(pill.course_name),
                    )}
                    onClick={() => {
                      setSelectedPill(pill);
                      setRescheduleExpanded(false);
                      setRescheduleSlots([]);
                      setRescheduleError(null);
                      setRescheduleSharedTime("08:00");
                      setRescheduleHadMixedTimes(false);
                      setConfirmUnassign(false);
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      openContext(
                        event,
                        [
                          {
                            id: "reschedule",
                            label:
                              busyKey === `reschedule:${pill.package_id}`
                                ? "Saving schedule..."
                                : "Reschedule weekly slots",
                            onSelect: () => openRescheduleEditor(pill),
                          },
                          {
                            id: "unassign",
                            label:
                              busyKey === `unassign-package:${pill.package_id}`
                                ? "Removing schedule..."
                                : "Remove all weekly slots",
                            tone: "danger",
                            disabled: busyKey === `unassign-package:${pill.package_id}`,
                            onSelect: () => {
                              setSelectedPill(pill);
                              setRescheduleExpanded(false);
                              setRescheduleSlots([]);
                              setRescheduleError(null);
                              setRescheduleSharedTime("08:00");
                              setRescheduleHadMixedTimes(false);
                              setConfirmUnassign(true);
                            },
                          },
                        ],
                        pill.student_name,
                      );
                    }}
                  >
                    <div className="text-base font-semibold uppercase tracking-wide">{secondNameLabel(pill.student_name)}</div>
                    <div className="mt-1 text-sm font-medium opacity-90">
                      {timeRangeLabel(pill.start_time, pill.duration_minutes)}
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Attendance</h2>
              <div className="inline-flex rounded-2xl border border-slate-200 bg-white/80 p-1 shadow-sm backdrop-blur-sm">
                <button
                  type="button"
                  className={cn(
                    "rounded-xl px-4 py-1.5 text-xs font-semibold tracking-wide transition-all duration-200",
                    classView === "daily"
                      ? "bg-slate-900 text-white shadow-md"
                      : "text-slate-400 hover:text-slate-600",
                  )}
                  onClick={() => {
                    setClassView("daily");
                    const today = currentDateKey();
                    setSelectedDate(today);
                    setMonth(today.slice(0, 7));
                  }}
                >
                  Daily
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-xl px-4 py-1.5 text-xs font-semibold tracking-wide transition-all duration-200",
                    classView === "monthly"
                      ? "bg-slate-900 text-white shadow-md"
                      : "text-slate-400 hover:text-slate-600",
                  )}
                  onClick={() => setClassView("monthly")}
                >
                  Monthly
                </button>
              </div>
            </div>
            {classView === "daily" ? (
              <DateDropdown
                value={selectedDate}
                onChange={(nextDate) => {
                  setSelectedDate(nextDate);
                  setMonth(nextDate.slice(0, 7));
                }}
              />
            ) : classView === "monthly" ? (
              <MonthDropdown value={month} onChange={setMonth} />
            ) : null}
          </div>

          {classView === "daily" ? (
            <>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="animate-pulse p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-2">
                          <div className="h-4 w-32 rounded bg-slate-200" />
                          <div className="h-3 w-24 rounded bg-slate-100" />
                          <div className="h-3 w-28 rounded bg-slate-100" />
                        </div>
                        <div className="flex gap-2">
                          <div className="h-11 w-20 rounded-xl bg-slate-100" />
                          <div className="h-11 w-20 rounded-xl bg-slate-100" />
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : sortedDailyQueue.length === 0 ? (
                <Card className="p-6 text-center">
                  <p className="text-sm text-slate-500">
                    No online sessions scheduled for {formatDateHeading(selectedDate)}.
                  </p>
                </Card>
              ) : (
                sortedDailyQueue.map((occurrence) => {
                  const isMarked = occurrence.attendance_status !== null;
                  const isBusy = busyKey === `mark:${occurrence.id}`;
                  return (
                    <Card
                      key={occurrence.id ?? `${occurrence.package_slot_id}:${occurrence.session_date}`}
                      className={cn("p-4 transition-colors", isMarked && "bg-slate-50/60")}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">{occurrence.student_name}</p>
                            {isMarked ? (
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                                  occurrence.attendance_status === "present"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-rose-100 text-rose-700",
                                )}
                              >
                                {occurrence.attendance_status}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-slate-500">{occurrence.course_name}</p>
                          <p className="mt-1 text-xs font-medium text-sky-700">
                            {timeRangeLabel(occurrence.start_time, occurrence.duration_minutes)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className={cn(
                              "flex h-11 min-w-[80px] items-center justify-center rounded-xl px-4 text-sm font-medium transition",
                              occurrence.attendance_status === "present"
                                ? "bg-emerald-600 text-white ring-2 ring-emerald-300"
                                : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                              isBusy && "pointer-events-none opacity-60",
                            )}
                            disabled={isBusy}
                            onClick={() => void markAttendance(occurrence, "present")}
                          >
                            {occurrence.attendance_status === "present" ? "Present \u2713" : "Present"}
                          </button>
                          <button
                            type="button"
                            className={cn(
                              "flex h-11 min-w-[80px] items-center justify-center rounded-xl px-4 text-sm font-medium transition",
                              occurrence.attendance_status === "absent"
                                ? "bg-rose-600 text-white ring-2 ring-rose-300"
                                : "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
                              isBusy && "pointer-events-none opacity-60",
                            )}
                            disabled={isBusy}
                            onClick={() => void markAttendance(occurrence, "absent")}
                          >
                            {occurrence.attendance_status === "absent" ? "Absent \u2713" : "Absent"}
                          </button>
                        </div>
                      </div>
                    </Card>
                  );
                })
              )}
            </>
          ) : (
            <MonthlyAttendancePanel
              month={month}
              occurrences={payload?.monthly_occurrences ?? []}
              loading={loading}
              busyKey={busyKey}
              expandedStudentIds={expandedStudents}
              onStudentToggle={toggleStudentExpanded}
              onDayClick={handleCalendarCellClick}
            />
          )}
        </section>
      </main>

      <PlannerContextMenu
        open={Boolean(contextMenu)}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        title={contextMenu?.title}
        actions={contextMenu?.actions ?? []}
        onClose={() => setContextMenu(null)}
      />

      <Modal
        open={scheduleOpen}
        title="Assign Slot"
        description="Assign weekly day/time slots for an admin-assigned package."
        onClose={() => setScheduleOpen(false)}
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submitSchedule()} disabled={busyKey === "schedule"}>
              {busyKey === "schedule" ? "Scheduling..." : "Save Schedule"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Assigned Package</label>
              <ScheduleSelect
                value={scheduleAssignmentId}
                onChange={(event) => {
                  setScheduleAssignmentId(event.target.value);
                  setScheduleError(null);
                }}
              >
                <option value="">Select assigned package</option>
                {pendingAssignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.student_name} • {assignment.course_name}
                  </option>
                ))}
              </ScheduleSelect>
            </div>
          </div>

          {selectedAssignment ? (
            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Student</p>
                <p className="mt-1 font-semibold text-slate-900">{selectedAssignment.student_name}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Course</p>
                <p className="mt-1 font-semibold text-slate-900">{selectedAssignment.course_name}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Weekly Slots</p>
                <p className="mt-1 font-semibold text-slate-900">{selectedAssignment.sessions_per_week}</p>
              </div>
            </div>
          ) : null}

          {selectedAssignment ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Assigned package requires{" "}
              <span className="font-semibold text-slate-900">{selectedAssignment.sessions_per_week}</span> weekly
              slot(s).
            </div>
          ) : null}

          <div className="space-y-2">
            {scheduleSlots.map((slot, index) => (
              <div key={`${index}:${slot.day_of_week}:${slot.start_time}`} className={scheduleSlotRowClassName}>
                <ScheduleSelect
                  value={slot.day_of_week}
                  onChange={(event) => {
                    const dayOfWeek = Number(event.target.value);
                    setScheduleSlots((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, day_of_week: dayOfWeek } : item,
                      ),
                    );
                    setScheduleError(null);
                  }}
                >
                  <ScheduleDayOptions />
                </ScheduleSelect>
                <TimeBlockPicker
                  dense
                  value={slot.start_time}
                  onChange={(startTime) => {
                    setScheduleSlots((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, start_time: startTime } : item,
                      ),
                    );
                    setScheduleError(null);
                  }}
                />
              </div>
            ))}
          </div>
          {scheduleError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {scheduleError}
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(selectedPill)}
        title={selectedPill ? selectedPill.student_name : "Slot details"}
        description={selectedPill ? selectedPill.course_name : undefined}
        onClose={closeSelectedPillModal}
      >
        {selectedPill ? (() => {
          const pillPkg = payload?.weekly_packages.find((p) => p.id === selectedPill.package_id);
          const activeSlotCount = pillPkg?.slots.length ?? 0;
          const requiredSlots = pillPkg?.sessions_per_week ?? 0;
          const isUnderScheduled = pillPkg && activeSlotCount < requiredSlots;
          const showingActionSection = rescheduleExpanded || confirmUnassign;
          const rescheduleExpectedCount = Math.max(requiredSlots, 1);
          const selectedRescheduleDays = new Set(rescheduleSlots.map((slot) => slot.day_of_week));
          const rescheduleDayCountError =
            rescheduleExpanded && rescheduleSlots.length < rescheduleExpectedCount
              ? `Select exactly ${rescheduleExpectedCount} day${rescheduleExpectedCount === 1 ? "" : "s"} for this package.`
              : null;
          return (
            <div className="space-y-4">
              {!showingActionSection ? (
                <>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <span className="text-base">&#128100;</span>
                      <p className="font-medium text-slate-900">{selectedPill.student_name}</p>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-base">&#128214;</span>
                      <p className="font-medium text-slate-900">{selectedPill.course_name}</p>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-base">&#128336;</span>
                      <p className="text-slate-700">
                        {DAY_OPTIONS.find((day) => day.value === selectedPill.day_of_week)?.shortLabel ??
                          selectedPill.day_of_week}
                        {" \u2022 "}
                        {timeRangeLabel(selectedPill.start_time, selectedPill.duration_minutes)}
                      </p>
                    </div>
                    {pillPkg ? (
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="text-base">&#128202;</span>
                        <p className={cn("font-medium", isUnderScheduled ? "text-amber-700" : "text-slate-700")}>
                          {activeSlotCount} of {requiredSlots} slots assigned
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {isUnderScheduled ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 transition hover:bg-amber-100"
                      onClick={() => openFillModal(selectedPill.package_id)}
                    >
                      <span className="font-semibold">{requiredSlots - activeSlotCount} slot(s) missing</span>
                      <span className="ml-auto text-amber-600">Fill remaining slots &rarr;</span>
                    </button>
                  ) : null}

                  <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-xl border-rose-200 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 sm:px-4 sm:text-sm"
                      disabled={busyKey === `unassign-package:${selectedPill.package_id}`}
                      onClick={() => {
                        setRescheduleExpanded(false);
                        setRescheduleSlots([]);
                        setRescheduleError(null);
                        setRescheduleSharedTime("08:00");
                        setRescheduleHadMixedTimes(false);
                        setConfirmUnassign(true);
                      }}
                    >
                      Remove slots
                    </Button>
                    <Button
                      type="button"
                      className="h-10 rounded-xl bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800 sm:px-4 sm:text-sm"
                      disabled={busyKey === `reschedule:${selectedPill.package_id}`}
                      onClick={() => openRescheduleEditor(selectedPill)}
                    >
                      Reschedule
                    </Button>
                  </div>
                </>
              ) : null}

              {rescheduleExpanded ? (
                <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">Adjust weekly schedule</p>
                    <button
                      type="button"
                      className="text-xs text-slate-400 hover:text-slate-600"
                      onClick={() => {
                        setRescheduleExpanded(false);
                        setRescheduleError(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  <p className="text-xs leading-5 text-slate-500">
                    Replace the future weekly schedule. Past attendance stays.
                  </p>
                  {rescheduleHadMixedTimes ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                      Current schedule has mixed times. Saving will apply one time to all selected days.
                    </div>
                  ) : null}

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Class time
                    </label>
                    <TimeBlockPicker
                      grouped
                      value={rescheduleSharedTime}
                      onChange={(startTime) => {
                        const normalizedStartTime = normalizeThirtyMinuteTime(startTime);
                        setRescheduleSharedTime(normalizedStartTime);
                        setRescheduleSlots((current) =>
                          current.map((slot) => ({ ...slot, start_time: normalizedStartTime })),
                        );
                        setRescheduleError(null);
                      }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Class days
                      </label>
                      <span className="text-xs text-slate-400">
                        {rescheduleSlots.length}/{rescheduleExpectedCount} selected
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                      {DAY_OPTIONS.map((day) => {
                        const isSelected = selectedRescheduleDays.has(day.value);
                        const isBlocked =
                          !isSelected && rescheduleSlots.length >= rescheduleExpectedCount;
                        return (
                          <button
                            key={`reschedule-day-${day.value}`}
                            type="button"
                            disabled={isBlocked}
                            className={cn(
                              "h-9 rounded-xl border px-2 text-sm font-semibold transition",
                              isSelected
                                ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                              isBlocked &&
                                "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300 shadow-none hover:border-slate-100 hover:bg-slate-50",
                            )}
                            onClick={() => {
                              setRescheduleSlots((current) => {
                                const dayIsSelected = current.some(
                                  (slot) => slot.day_of_week === day.value,
                                );
                                if (!dayIsSelected && current.length >= rescheduleExpectedCount) {
                                  return current;
                                }
                                const next = dayIsSelected
                                  ? current.filter((slot) => slot.day_of_week !== day.value)
                                  : [
                                      ...current,
                                      { day_of_week: day.value, start_time: rescheduleSharedTime },
                                    ];
                                return DAY_OPTIONS.flatMap((option) => {
                                  const matchingSlot = next.find(
                                    (slot) => slot.day_of_week === option.value,
                                  );
                                  return matchingSlot
                                    ? [{ ...matchingSlot, start_time: rescheduleSharedTime }]
                                    : [];
                                });
                              });
                              setRescheduleError(null);
                            }}
                          >
                            {day.shortLabel}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {rescheduleDayCountError ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      {rescheduleDayCountError}
                    </div>
                  ) : null}
                  {rescheduleError ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      {rescheduleError}
                    </div>
                  ) : null}
                  <Button
                    className="w-full"
                    onClick={() => void submitReschedule()}
                    disabled={
                      busyKey === `reschedule:${selectedPill.package_id}` ||
                      Boolean(rescheduleDayCountError)
                    }
                  >
                    {busyKey === `reschedule:${selectedPill.package_id}` ? "Saving..." : "Save Schedule"}
                  </Button>
                </div>
              ) : null}

              {confirmUnassign ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center">
                  <p className="text-sm text-rose-700">
                    Remove all weekly slots for <span className="font-semibold">{selectedPill.student_name}</span>?
                    {pillPkg ? (
                      <span className="mt-1 block text-xs text-rose-600">
                        This will remove {activeSlotCount} of {requiredSlots} assigned weekly slot
                        {activeSlotCount === 1 ? "" : "s"} for this package.
                      </span>
                    ) : null}
                  </p>
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      className="h-9 text-xs"
                      onClick={() => setConfirmUnassign(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="h-9 bg-rose-600 text-xs text-white hover:bg-rose-700"
                      disabled={busyKey === `unassign-package:${selectedPill.package_id}`}
                      onClick={() => void unassignAllSlots(selectedPill)}
                    >
                      {busyKey === `unassign-package:${selectedPill.package_id}`
                        ? "Removing..."
                        : "Yes, Remove All"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })() : null}
      </Modal>

      <Modal
        open={fillOpen}
        title="Fill Missing Slots"
        description={fillPackage ? `${fillPackage.student_name} • ${fillPackage.course_name}` : undefined}
        onClose={() => setFillOpen(false)}
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => setFillOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submitFill()} disabled={busyKey === "fill"}>
              {busyKey === "fill" ? "Saving..." : "Save Slots"}
            </Button>
          </div>
        }
      >
        {fillPackage ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p className="font-medium text-slate-900">
                Currently assigned: {fillPackage.slots.length} of {fillPackage.sessions_per_week} weekly slots
              </p>
              <div className="mt-2 space-y-1">
                {fillPackage.slots.map((slot) => (
                  <p key={slot.id} className="text-xs text-slate-500">
                    {DAY_OPTIONS.find((d) => d.value === slot.day_of_week_snapshot)?.label ?? slot.day_of_week_snapshot}{" "}
                    • {timeRangeLabel(slot.start_time_snapshot, slot.duration_minutes_snapshot)}
                  </p>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Add {fillMissingCount} more slot{fillMissingCount > 1 ? "s" : ""}
              </label>
              <div className="space-y-2">
                {fillSlots.map((slot, index) => (
                  <div key={`fill-${index}`} className={scheduleSlotRowClassName}>
                    <ScheduleSelect
                      value={slot.day_of_week}
                      onChange={(event) => {
                        const dayOfWeek = Number(event.target.value);
                        setFillSlots((current) =>
                          current.map((item, i) => (i === index ? { ...item, day_of_week: dayOfWeek } : item)),
                        );
                        setFillError(null);
                      }}
                    >
                      <ScheduleDayOptions />
                    </ScheduleSelect>
                    <TimeBlockPicker
                      dense
                      value={slot.start_time}
                      onChange={(startTime) => {
                        setFillSlots((current) =>
                          current.map((item, i) => (i === index ? { ...item, start_time: startTime } : item)),
                        );
                        setFillError(null);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {fillError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {fillError}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* Re-mark confirmation modal */}
      <Modal
        open={Boolean(selectedCalendarDayDetails)}
        title={selectedCalendarDayDetails?.studentName ?? "Session details"}
        description={selectedCalendarDayDetails ? formatDateHeading(selectedCalendarDayDetails.dateStr) : undefined}
        onClose={() => setSelectedCalendarDay(null)}
      >
        {selectedCalendarDayDetails ? (
          <div className="space-y-3">
            {selectedCalendarDayDetails.occurrences.map((occurrence) => {
              const isBusy = busyKey === `mark:${occurrence.id}`;
              const isMarked = occurrence.attendance_status !== null;

              return (
                <Card
                  key={occurrence.id ?? `${occurrence.package_slot_id}:${occurrence.session_date}:${occurrence.start_time}`}
                  className={cn("p-4 transition-colors", isMarked && "bg-slate-50/60")}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{occurrence.course_name}</p>
                        {isMarked ? (
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                              occurrence.attendance_status === "present"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-rose-100 text-rose-700",
                            )}
                          >
                            {occurrence.attendance_status}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs font-medium text-sky-700">
                        {timeRangeLabel(occurrence.start_time, occurrence.duration_minutes)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className={cn(
                          "flex h-10 min-w-[76px] items-center justify-center rounded-xl px-3 text-sm font-medium transition",
                          occurrence.attendance_status === "present"
                            ? "bg-emerald-600 text-white ring-2 ring-emerald-300"
                            : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                          isBusy && "pointer-events-none opacity-60",
                        )}
                        disabled={isBusy}
                        onClick={() => void markAttendance(occurrence, "present")}
                      >
                        {occurrence.attendance_status === "present" ? "Present \u2713" : "Present"}
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "flex h-10 min-w-[76px] items-center justify-center rounded-xl px-3 text-sm font-medium transition",
                          occurrence.attendance_status === "absent"
                            ? "bg-rose-600 text-white ring-2 ring-rose-300"
                            : "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
                          isBusy && "pointer-events-none opacity-60",
                        )}
                        disabled={isBusy}
                        onClick={() => void markAttendance(occurrence, "absent")}
                      >
                        {occurrence.attendance_status === "absent" ? "Absent \u2713" : "Absent"}
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(confirmRemark)}
        title="Change Attendance"
        onClose={() => setConfirmRemark(null)}
      >
        {confirmRemark ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Change attendance for <span className="font-semibold text-slate-900">{confirmRemark.occurrence.student_name}</span> from{" "}
              <span className={cn(
                "font-semibold",
                confirmRemark.occurrence.attendance_status === "present" ? "text-emerald-700" : "text-rose-700",
              )}>
                {confirmRemark.occurrence.attendance_status}
              </span>{" "}
              to{" "}
              <span className={cn(
                "font-semibold",
                confirmRemark.newStatus === "present" ? "text-emerald-700" : "text-rose-700",
              )}>
                {confirmRemark.newStatus}
              </span>?
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmRemark(null)}>
                Cancel
              </Button>
              <Button
                className={cn(
                  "text-white",
                  confirmRemark.newStatus === "present"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700",
                )}
                onClick={() => {
                  const { occurrence, newStatus } = confirmRemark;
                  setConfirmRemark(null);
                  if (occurrence.attendance_status !== newStatus) {
                    void doMarkAttendance(occurrence, newStatus);
                  }
                }}
              >
                Confirm
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
