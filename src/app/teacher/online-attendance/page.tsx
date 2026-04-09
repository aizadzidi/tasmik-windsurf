"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { PlannerContextMenu, type PlannerContextAction } from "@/components/online/PlannerContextMenu";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { authFetch } from "@/lib/authFetch";
import { supabase } from "@/lib/supabaseClient";
import { useTeachingModeContext } from "@/contexts/TeachingModeContext";
import { cn } from "@/lib/utils";
import type { OnlineTeacherScheduleSlotInput, OnlineTeacherSchedulerOptions } from "@/types/online";

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
    }>;
  }>;
  weekly_slot_actions: PlannerDay[];
  today_queue: OccurrenceRow[];
  monthly_occurrences: OccurrenceRow[];
  scheduler: OnlineTeacherSchedulerOptions;
};

type SlotDraft = OnlineTeacherScheduleSlotInput;
type PendingAssignment = OnlineTeacherSchedulerOptions["pending_assignments"][number];

const DAY_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

const currentMonthKey = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
};

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

const getCourseCalendarFill = (courseName: string) => {
  if (/hafazan|tahfiz/i.test(courseName)) return "bg-emerald-500 text-white shadow-sm ring-1 ring-emerald-400/50";
  if (/islamic|islam|muamalah/i.test(courseName)) return "bg-sky-500 text-white shadow-sm ring-1 ring-sky-400/50";
  return "bg-slate-600 text-white shadow-sm ring-1 ring-slate-400/50";
};

type CalendarCell = {
  day: number;
  dateStr: string;
  inMonth: boolean;
};

const buildCalendarGrid = (monthKey: string): CalendarCell[][] => {
  const [year, mon] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const firstDayOfWeek = (new Date(Date.UTC(year, mon - 1, 1)).getUTCDay() + 6) % 7;

  const weeks: CalendarCell[][] = [];
  let week: CalendarCell[] = [];

  for (let i = 0; i < firstDayOfWeek; i++) {
    week.push({ day: 0, dateStr: "", inMonth: false });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    week.push({ day: d, dateStr, inMonth: true });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }

  if (week.length > 0) {
    while (week.length < 7) week.push({ day: 0, dateStr: "", inMonth: false });
    weeks.push(week);
  }

  return weeks;
};

type StudentCalendarData = {
  student_id: string;
  student_name: string;
  occurrencesByDate: Map<string, OccurrenceRow[]>;
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

const getSlotDraftValidationError = (slots: SlotDraft[], expectedCount?: number) => {
  if (typeof expectedCount === "number" && slots.length !== expectedCount) {
    return `Enter exactly ${expectedCount} valid weekly slot(s).`;
  }

  const keys = new Set<string>();
  for (const slot of slots) {
    if (!slot.start_time) {
      return "Complete all slot day/time fields.";
    }
    const key = `${slot.day_of_week}:${slot.start_time}`;
    if (keys.has(key)) {
      return "Duplicate day/time slots are not allowed in the same schedule.";
    }
    keys.add(key);
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

export default function TeacherOnlineAttendancePage() {
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const { programScope } = useTeachingModeContext();
  const [month, setMonth] = useState(currentMonthKey());
  const [payload, setPayload] = useState<TeacherPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selectedPill, setSelectedPill] = useState<PlannerPill | null>(null);
  const [rescheduleExpanded, setRescheduleExpanded] = useState(false);
  const [rescheduleSlots, setRescheduleSlots] = useState<SlotDraft[]>([]);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
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
      const { data, error: userError } = await supabase.auth.getUser();
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

  const loadAttendance = useCallback(async (options?: { preservePayloadOnError?: boolean; showLoading?: boolean }) => {
    const preservePayloadOnError = options?.preservePayloadOnError ?? false;
    const showLoading = options?.showLoading ?? true;
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const response = await authFetch(`/api/teacher/online/attendance?month=${month}`);
      const data = (await response.json()) as TeacherPayload & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch online attendance");
      }
      setPayload(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load attendance");
      if (!preservePayloadOnError) {
        setPayload(null);
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    if (!teacherId) return;
    void loadAttendance();
  }, [teacherId, loadAttendance]);

  const dayById = useMemo(
    () => new Map((payload?.weekly_slot_actions ?? []).map((day) => [day.day_of_week, day])),
    [payload?.weekly_slot_actions],
  );

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
    setConfirmUnassign(false);
  }, [selectedPill]);

  const sortedTodayQueue = useMemo(() => {
    return [...(payload?.today_queue ?? [])].sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [payload?.today_queue]);

  const monthlyByStudent = useMemo<StudentCalendarData[]>(() => {
    const map = new Map<string, StudentCalendarData>();
    for (const occ of payload?.monthly_occurrences ?? []) {
      let entry = map.get(occ.student_id);
      if (!entry) {
        entry = { student_id: occ.student_id, student_name: occ.student_name, occurrencesByDate: new Map() };
        map.set(occ.student_id, entry);
      }
      const dateList = entry.occurrencesByDate.get(occ.session_date) ?? [];
      dateList.push(occ);
      entry.occurrencesByDate.set(occ.session_date, dateList);
    }
    return Array.from(map.values()).sort((a, b) => a.student_name.localeCompare(b.student_name));
  }, [payload?.monthly_occurrences]);

  const calendarGrid = useMemo(() => buildCalendarGrid(month), [month]);

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

    // Optimistic update
    setPayload((prev) => {
      if (!prev) return prev;
      const updateOcc = (occ: OccurrenceRow) =>
        occ.id === occurrence.id ? { ...occ, attendance_status: status } : occ;
      return {
        ...prev,
        today_queue: prev.today_queue.map(updateOcc),
        monthly_occurrences: prev.monthly_occurrences.map(updateOcc),
      };
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
      // Refresh counts and derived lists without wiping the optimistic UI if this follow-up fetch fails.
      void loadAttendance({ preservePayloadOnError: true, showLoading: false });
    } catch (markError) {
      // Revert optimistic update
      setPayload((prev) => {
        if (!prev) return prev;
        const revertOcc = (occ: OccurrenceRow) =>
          occ.id === occurrence.id ? { ...occ, attendance_status: previousStatus } : occ;
        return {
          ...prev,
          today_queue: prev.today_queue.map(revertOcc),
          monthly_occurrences: prev.monthly_occurrences.map(revertOcc),
        };
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
        start_time: slot.start_time_snapshot.slice(0, 5),
      }));

    const required = Math.max(pkg.sessions_per_week, 1);
    const next = sortedCurrentSlots.slice(0, required);
    if (next.length < required) {
      next.push(...buildDefaultSlots(required - next.length));
    }

    setSelectedPill(pill);
    setRescheduleSlots(next);
    setRescheduleError(null);
    setRescheduleExpanded(true);
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

      setRescheduleExpanded(false);
      setRescheduleSlots([]);
      setRescheduleError(null);
      setError(null);
      setSelectedPill(null);
      await loadAttendance();
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
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Failed to schedule student");

      setScheduleOpen(false);
      setScheduleAssignmentId("");
      setScheduleSlots([]);
      setScheduleError(null);
      setError(null);
      await loadAttendance();
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
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Failed to fill slots");
      setFillOpen(false);
      setFillPackageId("");
      setFillSlots([]);
      setFillError(null);
      setError(null);
      await loadAttendance();
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

      if (selectedPill?.package_id === pill.package_id) {
        setSelectedPill(null);
      }

      await loadAttendance();
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
                    // Reset month to current so Daily view always shows today's data
                    setMonth(currentMonthKey());
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
            {classView === "monthly" ? (
              <input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm shadow-sm transition focus:ring-2 focus:ring-slate-300"
              />
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
              ) : sortedTodayQueue.length === 0 ? (
                <Card className="p-6 text-center">
                  <p className="text-sm text-slate-500">No online sessions scheduled for today.</p>
                </Card>
              ) : (
                sortedTodayQueue.map((occurrence) => {
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
            <>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="animate-pulse rounded-2xl p-5">
                      <div className="h-5 w-36 rounded bg-slate-200" />
                    </Card>
                  ))}
                </div>
              ) : monthlyByStudent.length === 0 ? (
                <Card className="rounded-2xl p-8 text-center">
                  <p className="text-sm text-slate-500">No sessions for this month.</p>
                  <p className="mt-1 text-xs text-slate-400">Sessions will appear once packages are assigned and scheduled.</p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {monthlyByStudent.map((studentData) => {
                    const isExpanded = expandedStudents.has(studentData.student_id);
                    const totalSessions = studentData.occurrencesByDate.size;
                    const presentDays = Array.from(studentData.occurrencesByDate.values()).filter((occs) =>
                      occs.every((o) => o.attendance_status === "present"),
                    ).length;

                    return (
                      <div
                        key={studentData.student_id}
                        className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md"
                      >
                        {/* Accordion header */}
                        <button
                          type="button"
                          className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-slate-50/50"
                          onClick={() => toggleStudentExpanded(studentData.student_id)}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-slate-900">
                              {studentData.student_name}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                              {presentDays}/{totalSessions}
                            </span>
                          </div>
                          <svg
                            className={cn(
                              "h-4 w-4 text-slate-400 transition-transform duration-200",
                              isExpanded && "rotate-180",
                            )}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {/* Accordion body: calendar grid */}
                        {isExpanded ? (
                          <div className="mx-auto max-w-md border-t border-slate-100 px-4 py-4 sm:px-5">
                            {/* Day headers */}
                            <div className="mb-2 grid grid-cols-7 gap-1 text-center">
                              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                                <div
                                  key={d}
                                  className="pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400"
                                >
                                  {d}
                                </div>
                              ))}
                            </div>
                            {/* Week rows */}
                            <div className="space-y-1">
                              {calendarGrid.map((weekRow, weekIdx) => (
                                <div key={weekIdx} className="grid grid-cols-7 gap-1">
                                  {weekRow.map((cell, cellIdx) => {
                                    if (!cell.inMonth) {
                                      return <div key={cellIdx} className="aspect-square" />;
                                    }

                                    const dayOccurrences = studentData.occurrencesByDate.get(cell.dateStr);
                                    const hasClass = dayOccurrences && dayOccurrences.length > 0;

                                    if (!hasClass) {
                                      return (
                                        <div
                                          key={cellIdx}
                                          className="flex aspect-square items-center justify-center rounded-lg bg-slate-50 text-[11px] text-slate-300"
                                        >
                                          {cell.day}
                                        </div>
                                      );
                                    }

                                    const allPresent = dayOccurrences.every(
                                      (o) => o.attendance_status === "present",
                                    );
                                    const somePresent = !allPresent && dayOccurrences.some(
                                      (o) => o.attendance_status === "present",
                                    );
                                    const isBusy = dayOccurrences.some(
                                      (o) => busyKey === `mark:${o.id}`,
                                    );
                                    const primaryCourse = dayOccurrences[0].course_name;
                                    const multiSession = dayOccurrences.length > 1;

                                    return (
                                      <button
                                        key={cellIdx}
                                        type="button"
                                        disabled={isBusy}
                                        className={cn(
                                          "relative flex aspect-square items-center justify-center rounded-lg text-[11px] font-semibold transition-all duration-200",
                                          allPresent
                                            ? getCourseCalendarFill(primaryCourse)
                                            : somePresent
                                              ? "border border-emerald-300 bg-emerald-50 text-emerald-700"
                                              : "border border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50",
                                          isBusy && "pointer-events-none opacity-50",
                                        )}
                                        onClick={() => handleCalendarCellClick(dayOccurrences)}
                                        title={
                                          multiSession
                                            ? `${dayOccurrences.length} sessions - click to review`
                                            : undefined
                                        }
                                      >
                                        {cell.day}
                                        {multiSession ? (
                                          <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-sky-500" />
                                        ) : null}
                                      </button>
                                    );
                                  })}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
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
              <select
                value={scheduleAssignmentId}
                onChange={(event) => {
                  setScheduleAssignmentId(event.target.value);
                  setScheduleError(null);
                }}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="">Select assigned package</option>
                {pendingAssignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.student_name} • {assignment.course_name}
                  </option>
                ))}
              </select>
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
              <div key={`${index}:${slot.day_of_week}:${slot.start_time}`} className="grid gap-2 sm:grid-cols-2">
                <select
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
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
                >
                  {DAY_OPTIONS.map((day) => (
                    <option key={day.label} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </select>
                <input
                  type="time"
                  value={slot.start_time}
                  onChange={(event) => {
                    const startTime = event.target.value;
                    setScheduleSlots((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, start_time: startTime } : item,
                      ),
                    );
                    setScheduleError(null);
                  }}
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
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
        onClose={() => setSelectedPill(null)}
      >
        {selectedPill ? (() => {
          const pillPkg = payload?.weekly_packages.find((p) => p.id === selectedPill.package_id);
          const activeSlotCount = pillPkg?.slots.length ?? 0;
          const requiredSlots = pillPkg?.sessions_per_week ?? 0;
          const isUnderScheduled = pillPkg && activeSlotCount < requiredSlots;
          return (
            <div className="space-y-4">
              {/* Info card */}
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
                    {dayById.get(selectedPill.day_of_week)?.label ?? selectedPill.day_of_week}
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

              {/* Under-scheduled warning — promoted to top */}
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

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Actions</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              {/* Reschedule action */}
              <div>
                {!rescheduleExpanded ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    disabled={busyKey === `reschedule:${selectedPill.package_id}`}
                    onClick={() => openRescheduleEditor(selectedPill)}
                  >
                    <span>&#128260;</span>
                    <span>Reschedule weekly slots</span>
                    <span className="ml-auto text-slate-400">&darr;</span>
                  </button>
                ) : (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-700">Adjust weekly schedule</p>
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
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      Replace the future weekly schedule for this package. Past attendance stays, and today stays if already marked.
                    </div>
                    <div className="space-y-2">
                      {rescheduleSlots.map((slot, index) => (
                        <div key={`reschedule-${index}:${slot.day_of_week}:${slot.start_time}`} className="grid gap-2 sm:grid-cols-2">
                          <select
                            value={slot.day_of_week}
                            onChange={(event) => {
                              const dayOfWeek = Number(event.target.value);
                              setRescheduleSlots((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, day_of_week: dayOfWeek } : item,
                                ),
                              );
                              setRescheduleError(null);
                            }}
                            className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
                          >
                            {DAY_OPTIONS.map((day) => (
                              <option key={day.label} value={day.value}>
                                {day.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="time"
                            value={slot.start_time}
                            onChange={(event) => {
                              const startTime = event.target.value;
                              setRescheduleSlots((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, start_time: startTime } : item,
                                ),
                              );
                              setRescheduleError(null);
                            }}
                            className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
                          />
                        </div>
                      ))}
                    </div>
                    {rescheduleError ? (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        {rescheduleError}
                      </div>
                    ) : null}
                    <Button
                      className="w-full"
                      onClick={() => void submitReschedule()}
                      disabled={busyKey === `reschedule:${selectedPill.package_id}`}
                    >
                      {busyKey === `reschedule:${selectedPill.package_id}` ? "Saving..." : "Save Schedule"}
                    </Button>
                  </div>
                )}
              </div>

              {/* Unassign — separated, de-emphasized, with confirmation */}
              <div className="pt-2">
                {!confirmUnassign ? (
                  <button
                    type="button"
                    className="w-full text-center text-sm text-rose-500 transition hover:text-rose-700"
                    onClick={() => setConfirmUnassign(true)}
                  >
                    Remove all weekly slots
                  </button>
                ) : (
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
                )}
              </div>
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
                  <div key={`fill-${index}`} className="grid gap-2 sm:grid-cols-2">
                    <select
                      value={slot.day_of_week}
                      onChange={(event) => {
                        const dayOfWeek = Number(event.target.value);
                        setFillSlots((current) =>
                          current.map((item, i) => (i === index ? { ...item, day_of_week: dayOfWeek } : item)),
                        );
                        setFillError(null);
                      }}
                      className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
                    >
                      {DAY_OPTIONS.map((day) => (
                        <option key={day.label} value={day.value}>
                          {day.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="time"
                      value={slot.start_time}
                      onChange={(event) => {
                        const startTime = event.target.value;
                        setFillSlots((current) =>
                          current.map((item, i) => (i === index ? { ...item, start_time: startTime } : item)),
                        );
                        setFillError(null);
                      }}
                      className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
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
