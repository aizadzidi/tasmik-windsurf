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

const startOfCurrentWeek = () => {
  const now = new Date();
  const current = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = current.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  current.setUTCDate(current.getUTCDate() + diff);
  return current.toISOString().slice(0, 10);
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

const buildDefaultSlots = (count: number): SlotDraft[] =>
  Array.from({ length: count }, (_, index) => ({
    day_of_week: DAY_OPTIONS[index % DAY_OPTIONS.length].value,
    start_time: "08:00",
  }));

export default function TeacherOnlineAttendancePage() {
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const { programScope } = useTeachingModeContext();
  const [month, setMonth] = useState(currentMonthKey());
  const [week, setWeek] = useState(startOfCurrentWeek());
  const [payload, setPayload] = useState<TeacherPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selectedPill, setSelectedPill] = useState<PlannerPill | null>(null);
  const [moveTargetSlotId, setMoveTargetSlotId] = useState("");
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

  const [classView, setClassView] = useState<"today" | "month">("today");
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

  const loadAttendance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch(`/api/teacher/online/attendance?month=${month}&week=${week}`);
      const data = (await response.json()) as TeacherPayload & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch online attendance");
      }
      setPayload(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load attendance");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [month, week]);

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

  const moveCandidates = useMemo(() => {
    if (!selectedPill || !payload) return [] as EmptySlot[];
    return payload.weekly_slot_actions
      .flatMap((day) => day.empty_slots)
      .filter((slot) => slot.course_id === selectedPill.course_id && slot.is_available);
  }, [payload, selectedPill]);

  const todayDateStr = useMemo(() => {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  }, []);

  const monthlyByDate = useMemo(() => {
    const grouped = new Map<string, OccurrenceRow[]>();
    for (const occ of payload?.monthly_occurrences ?? []) {
      const list = grouped.get(occ.session_date) ?? [];
      list.push(occ);
      grouped.set(occ.session_date, list);
    }
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [payload?.monthly_occurrences]);

  const formatDateHeading = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  };

  const visiblePlannerDays = useMemo(
    () => (payload?.weekly_slot_actions ?? []).filter((day) => day.occupied_pills.length > 0),
    [payload?.weekly_slot_actions],
  );

  const markAttendance = async (occurrence: OccurrenceRow, status: "present" | "absent") => {
    if (!occurrence.id) return;
    setBusyKey(`mark:${occurrence.id}`);
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
      await loadAttendance();
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "Failed to mark attendance");
    } finally {
      setBusyKey(null);
    }
  };

  const moveTimeSlot = async () => {
    if (!selectedPill || !moveTargetSlotId) {
      setError("Select a target time slot first.");
      return;
    }
    setBusyKey(`move:${selectedPill.package_slot_id}`);
    try {
      const response = await authFetch(
        `/api/teacher/online/attendance/package-slots/${encodeURIComponent(selectedPill.package_slot_id)}/move`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_slot_template_id: moveTargetSlotId,
            effective_mode: "next_occurrence",
          }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Failed to move time slot");
      setSelectedPill(null);
      await loadAttendance();
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "Failed to move time slot");
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
    if (scheduleSlots.length === 0 || scheduleSlots.some((slot) => !slot.start_time)) {
      setScheduleError("Complete all slot day/time fields.");
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
        setScheduleError("This student is already scheduled this month. Use Class Timetable to move slot times.");
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
    if (fillSlots.some((slot) => !slot.start_time)) {
      setFillError("Complete all slot day/time fields.");
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

  const unassignSlot = async (pill: PlannerPill) => {
    // Find the package to show slot count warning
    const pkg = payload?.weekly_packages.find((p) => p.id === pill.package_id);
    const slotsAfter = pkg ? pkg.slots.length - 1 : 0;
    const totalRequired = pkg?.sessions_per_week ?? 0;
    const warning = pkg && slotsAfter < totalRequired
      ? `\nThis student has a ${totalRequired}x/week package. After unassigning, only ${slotsAfter} of ${totalRequired} slots will remain.`
      : "";
    const confirmed = window.confirm(`Unassign slot for ${pill.student_name}?${warning}`);
    if (!confirmed) return;
    setBusyKey(`unassign:${pill.package_slot_id}`);
    try {
      const response = await authFetch(
        `/api/teacher/online/attendance/package-slots/${encodeURIComponent(pill.package_slot_id)}`,
        { method: "DELETE" },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Failed to unassign slot");
      if (selectedPill?.package_slot_id === pill.package_slot_id) {
        setSelectedPill(null);
      }
      await loadAttendance();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to unassign slot");
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
          <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</Card>
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
                      setMoveTargetSlotId("");
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      openContext(
                        event,
                        [
                          {
                            id: "move",
                            label: "Move to another slot",
                            onSelect: () => {
                              setSelectedPill(pill);
                              setMoveTargetSlotId("");
                            },
                          },
                          {
                            id: "unassign",
                            label: busyKey === `unassign:${pill.package_slot_id}` ? "Unassigning..." : "Unassign slot",
                            tone: "danger",
                            disabled: busyKey === `unassign:${pill.package_slot_id}`,
                            onSelect: () => void unassignSlot(pill),
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
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-slate-900">
                {classView === "today" ? "Class Today" : "This Month"}
              </h2>
              <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5">
                <button
                  type="button"
                  className={cn(
                    "rounded-[10px] px-3 py-1.5 text-xs font-medium transition",
                    classView === "today"
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700",
                  )}
                  onClick={() => setClassView("today")}
                >
                  Today
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-[10px] px-3 py-1.5 text-xs font-medium transition",
                    classView === "month"
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700",
                  )}
                  onClick={() => setClassView("month")}
                >
                  This Month
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
              />
              <input
                type="date"
                value={week}
                onChange={(event) => setWeek(event.target.value)}
                className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
              />
            </div>
          </div>

          {classView === "today" ? (
            <>
              {loading ? (
                <Card className="p-4 text-sm text-slate-500">Loading today queue...</Card>
              ) : (payload?.today_queue ?? []).length === 0 ? (
                <Card className="p-4 text-sm text-slate-500">No online sessions scheduled for today.</Card>
              ) : (
                (payload?.today_queue ?? []).map((occurrence) => (
                  <Card key={occurrence.id ?? `${occurrence.package_slot_id}:${occurrence.session_date}`} className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{occurrence.student_name}</p>
                        <p className="text-xs text-slate-500">{occurrence.course_name}</p>
                        <p className="mt-1 text-xs font-medium text-sky-700">
                          {occurrence.session_date} • {timeLabel(occurrence.start_time)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-1 text-xs font-semibold",
                            occurrence.attendance_status === "present"
                              ? "bg-emerald-100 text-emerald-700"
                              : occurrence.attendance_status === "absent"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-slate-100 text-slate-600",
                          )}
                        >
                          {occurrence.attendance_status ?? "unmarked"}
                        </span>
                        <Button
                          className="h-8 rounded-lg bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700"
                          disabled={busyKey === `mark:${occurrence.id}`}
                          onClick={() => void markAttendance(occurrence, "present")}
                        >
                          Present
                        </Button>
                        <Button
                          className="h-8 rounded-lg bg-rose-600 px-3 text-xs text-white hover:bg-rose-700"
                          disabled={busyKey === `mark:${occurrence.id}`}
                          onClick={() => void markAttendance(occurrence, "absent")}
                        >
                          Absent
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </>
          ) : (
            <>
              {loading ? (
                <Card className="p-4 text-sm text-slate-500">Loading monthly sessions...</Card>
              ) : monthlyByDate.length === 0 ? (
                <Card className="p-4 text-sm text-slate-500">No sessions for this month.</Card>
              ) : (
                monthlyByDate.map(([dateStr, occurrences]) => {
                  const isToday = dateStr === todayDateStr;
                  const allMarked = occurrences.every((o) => o.attendance_status !== null);
                  const hasUnmarked = occurrences.some((o) => o.attendance_status === null);
                  const isPast = dateStr < todayDateStr;

                  return (
                    <div key={dateStr} className="space-y-2">
                      <div
                        className={cn(
                          "flex items-center gap-2 rounded-xl px-3 py-2",
                          isToday
                            ? "bg-sky-50 border border-sky-200"
                            : hasUnmarked
                              ? "bg-amber-50 border border-amber-200"
                              : isPast && allMarked
                                ? "bg-slate-50 border border-slate-100"
                                : "bg-white border border-slate-200",
                        )}
                      >
                        <h3 className={cn(
                          "text-sm font-semibold",
                          isToday ? "text-sky-800" : hasUnmarked ? "text-amber-800" : "text-slate-700",
                        )}>
                          {formatDateHeading(dateStr)}
                        </h3>
                        {isToday ? (
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-700">
                            Today
                          </span>
                        ) : null}
                        {hasUnmarked ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                            {occurrences.filter((o) => o.attendance_status === null).length} unmarked
                          </span>
                        ) : null}
                      </div>

                      {occurrences.map((occurrence) => (
                        <Card
                          key={occurrence.id ?? `${occurrence.package_slot_id}:${occurrence.session_date}`}
                          className={cn(
                            "p-4",
                            isPast && allMarked ? "opacity-60" : "",
                          )}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{occurrence.student_name}</p>
                              <p className="text-xs text-slate-500">{occurrence.course_name}</p>
                              <p className="mt-1 text-xs font-medium text-sky-700">
                                {timeRangeLabel(occurrence.start_time, occurrence.duration_minutes)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "rounded-full px-2 py-1 text-xs font-semibold",
                                  occurrence.attendance_status === "present"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : occurrence.attendance_status === "absent"
                                      ? "bg-rose-100 text-rose-700"
                                      : "bg-slate-100 text-slate-600",
                                )}
                              >
                                {occurrence.attendance_status ?? "unmarked"}
                              </span>
                              <Button
                                className="h-8 rounded-lg bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700"
                                disabled={busyKey === `mark:${occurrence.id}`}
                                onClick={() => void markAttendance(occurrence, "present")}
                              >
                                Present
                              </Button>
                              <Button
                                className="h-8 rounded-lg bg-rose-600 px-3 text-xs text-white hover:bg-rose-700"
                                disabled={busyKey === `mark:${occurrence.id}`}
                                onClick={() => void markAttendance(occurrence, "absent")}
                              >
                                Absent
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  );
                })
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
        description={selectedPill ? `${selectedPill.course_name} slot actions` : undefined}
        onClose={() => setSelectedPill(null)}
      >
        {selectedPill ? (() => {
          const pillPkg = payload?.weekly_packages.find((p) => p.id === selectedPill.package_id);
          const activeSlotCount = pillPkg?.slots.length ?? 0;
          const requiredSlots = pillPkg?.sessions_per_week ?? 0;
          const isUnderScheduled = pillPkg && activeSlotCount < requiredSlots;
          return (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <p className="font-medium text-slate-900">Student: {selectedPill.student_name}</p>
                <p className="mt-1">
                  Course: <span className="font-medium text-slate-900">{selectedPill.course_name}</span>
                </p>
                <p className="mt-1">
                  Current slot: {dayById.get(selectedPill.day_of_week)?.label ?? selectedPill.day_of_week} •{" "}
                  {timeRangeLabel(selectedPill.start_time, selectedPill.duration_minutes)}
                </p>
                {pillPkg ? (
                  <p className={cn("mt-1 font-medium", isUnderScheduled ? "text-amber-700" : "text-slate-700")}>
                    Slots assigned: {activeSlotCount} of {requiredSlots}
                    {isUnderScheduled ? " !" : ""}
                  </p>
                ) : null}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Move to another available time</label>
                <div className="flex gap-2">
                  <select
                    value={moveTargetSlotId}
                    onChange={(event) => setMoveTargetSlotId(event.target.value)}
                    className="h-11 flex-1 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="">Select target slot</option>
                    {moveCandidates.map((slot) => (
                      <option key={slot.slot_template_id} value={slot.slot_template_id}>
                        {(dayById.get(slot.day_of_week)?.label ?? slot.day_of_week) +
                          " • " +
                          timeRangeLabel(slot.start_time, slot.duration_minutes)}
                      </option>
                    ))}
                  </select>
                  <Button onClick={() => void moveTimeSlot()} disabled={busyKey === `move:${selectedPill.package_slot_id}`}>
                    Move
                  </Button>
                  <Button
                    variant="outline"
                    className="border-rose-200 text-rose-700 hover:bg-rose-50"
                    disabled={busyKey === `unassign:${selectedPill.package_slot_id}`}
                    onClick={() => void unassignSlot(selectedPill)}
                  >
                    {busyKey === `unassign:${selectedPill.package_slot_id}` ? "Unassigning..." : "Unassign"}
                  </Button>
                </div>
                {moveCandidates.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">No available target slots for this course.</p>
                ) : null}
              </div>

              {isUnderScheduled ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 transition hover:bg-amber-100"
                  onClick={() => openFillModal(selectedPill.package_id)}
                >
                  <span className="font-semibold">{requiredSlots - activeSlotCount} slot(s) missing</span>
                  <span className="ml-auto text-amber-600">Fill remaining slots &rarr;</span>
                </button>
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
    </div>
  );
}
