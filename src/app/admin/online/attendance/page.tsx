"use client";

import React from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  RefreshCw,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import AdminScopeSwitch from "@/components/admin/AdminScopeSwitch";
import MonthDropdown from "@/components/online/MonthDropdown";
import {
  buildCalendarGrid,
  groupOccurrencesByStudent,
  type OnlineAttendanceOccurrence,
  type StudentCalendarData,
} from "@/components/online/MonthlyAttendancePanel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { authFetch } from "@/lib/authFetch";
import { cn } from "@/lib/utils";

type MonthlySummary = {
  total_attendance: number;
  total_sessions: number;
  marked_sessions: number;
  present_count: number;
  absent_count: number;
  attendance_rate_pct: number;
};

type StudentSummary = {
  student_id: string;
  student_name: string;
  summary: MonthlySummary;
};

type TeacherOption = {
  id: string;
  name: string;
  active_package_count: number;
  available_slot_count: number;
};

type TeacherMonthlySummary = TeacherOption & {
  summary: MonthlySummary;
  students: StudentSummary[];
  monthly_occurrences: OnlineAttendanceOccurrence[];
};

type MonthlyPayload = {
  warning?: string;
  month: string;
  selected_teacher: TeacherOption | null;
  teachers: TeacherOption[];
  overall_summary?: MonthlySummary;
  summary: MonthlySummary;
  teacher_summaries?: TeacherMonthlySummary[];
  monthly_occurrences: OnlineAttendanceOccurrence[];
};

const emptySummary: MonthlySummary = {
  total_attendance: 0,
  total_sessions: 0,
  marked_sessions: 0,
  present_count: 0,
  absent_count: 0,
  attendance_rate_pct: 0,
};

const unmarkedCount = (summary: MonthlySummary) =>
  Math.max(summary.total_sessions - summary.marked_sessions, 0);

const currentMonthKey = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
};

const extractError = (payload: unknown, fallback: string) => {
  if (payload && typeof payload === "object" && "error" in payload) {
    const candidate = (payload as { error?: unknown }).error;
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate;
  }
  return fallback;
};

const formatMonthLabel = (monthKey: string) => {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return monthKey;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
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

const getCourseCalendarFill = (courseName: string) => {
  if (/hafazan|tahfiz/i.test(courseName)) return "bg-emerald-600 text-white ring-1 ring-emerald-500";
  if (/islamic|islam|muamalah/i.test(courseName)) return "bg-sky-600 text-white ring-1 ring-sky-500";
  return "bg-slate-700 text-white ring-1 ring-slate-500";
};

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
  loading = false,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  tone: "emerald" | "slate" | "rose";
  loading?: boolean;
}) {
  const toneClass = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    slate: "border-slate-200 bg-white text-slate-900",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
  }[tone];

  return (
    <div className={cn("rounded-xl border px-4 py-4 shadow-sm", toneClass)} aria-busy={loading}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <Icon className="h-4 w-4 opacity-75" />
      </div>
      {loading ? (
        <div className="mt-3 h-9 w-24 animate-pulse rounded-md bg-slate-200/70" />
      ) : (
        <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      )}
    </div>
  );
}

function StudentMonthlyCalendar({
  month,
  studentData,
  onDayClick,
}: {
  month: string;
  studentData: StudentCalendarData;
  onDayClick: (occurrences: OnlineAttendanceOccurrence[]) => void;
}) {
  const calendarGrid = React.useMemo(() => buildCalendarGrid(month), [month]);

  return (
    <div className="border-t border-slate-100 bg-slate-50 px-3 py-4 sm:px-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{studentData.student_name}</p>
          <p className="text-xs text-slate-500">Monthly attendance for {formatMonthLabel(month)}</p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-full bg-emerald-100 px-2 py-1 font-medium text-emerald-700">Present</span>
          <span className="rounded-full bg-rose-100 px-2 py-1 font-medium text-rose-700">Absent</span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md rounded-xl border border-slate-200 bg-white p-2 sm:p-3">
        <div className="mb-2 grid grid-cols-7 gap-px text-center sm:gap-1">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <div key={day} className="pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {day}
            </div>
          ))}
        </div>

        <div className="space-y-px sm:space-y-1">
          {calendarGrid.map((weekRow, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7 gap-px sm:gap-1">
              {weekRow.map((cell, cellIndex) => {
                if (!cell.inMonth) return <div key={cellIndex} className="aspect-square" />;

                const dayOccurrences = studentData.occurrencesByDate.get(cell.dateStr);
                const hasClass = dayOccurrences && dayOccurrences.length > 0;
                if (!hasClass) {
                  return (
                    <div
                      key={cellIndex}
                      className="flex aspect-square items-center justify-center rounded-lg bg-slate-50 text-[11px] text-slate-300"
                    >
                      {cell.day}
                    </div>
                  );
                }

                const allPresent = dayOccurrences.every(
                  (occurrence) => occurrence.attendance_status === "present",
                );
                const somePresent = !allPresent && dayOccurrences.some(
                  (occurrence) => occurrence.attendance_status === "present",
                );
                const allAbsent = dayOccurrences.every(
                  (occurrence) => occurrence.attendance_status === "absent",
                );
                const primaryCourse = dayOccurrences[0].course_name;
                const multiSession = dayOccurrences.length > 1;
                const presentCount = dayOccurrences.filter(
                  (occurrence) => occurrence.attendance_status === "present",
                ).length;
                const absentCount = dayOccurrences.filter(
                  (occurrence) => occurrence.attendance_status === "absent",
                ).length;
                const unmarkedCount = dayOccurrences.filter(
                  (occurrence) => occurrence.attendance_status === null,
                ).length;
                const dayLabel = `${formatDateHeading(cell.dateStr)}: ${dayOccurrences.length} session${
                  dayOccurrences.length === 1 ? "" : "s"
                }, ${presentCount} present, ${absentCount} absent, ${unmarkedCount} unmarked`;

                return (
                  <button
                    key={cellIndex}
                    type="button"
                    aria-label={dayLabel}
                    className={cn(
                      "relative flex aspect-square min-h-11 cursor-pointer items-center justify-center rounded-lg text-[11px] font-semibold",
                      "transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-slate-300",
                      allPresent
                        ? getCourseCalendarFill(primaryCourse)
                        : somePresent
                          ? "border border-emerald-300 bg-emerald-50 text-emerald-700"
                          : allAbsent
                            ? "border border-rose-200 bg-rose-50 text-rose-700"
                            : "border border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50",
                    )}
                    onClick={() => onDayClick(dayOccurrences)}
                    title={dayLabel}
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
    </div>
  );
}

export default function AdminOnlineAttendancePage() {
  const [month, setMonth] = React.useState(currentMonthKey());
  const [payload, setPayload] = React.useState<MonthlyPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [refreshing, setRefreshing] = React.useState(false);
  const [expandedTeacherId, setExpandedTeacherId] = React.useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = React.useState<string | null>(null);
  const [selectedDayOccurrences, setSelectedDayOccurrences] = React.useState<OnlineAttendanceOccurrence[]>([]);

  const refreshData = React.useCallback(
    async (withLoading = true) => {
      if (withLoading) setLoading(true);
      else setRefreshing(true);
      setError("");

      try {
        const query = new URLSearchParams({ month });
        const response = await authFetch(`/api/admin/online/attendance/monthly?${query.toString()}`);
        const nextPayload = (await response.json()) as MonthlyPayload & { error?: string };

        if (!response.ok) {
          throw new Error(extractError(nextPayload, "Failed to load monthly online attendance"));
        }

        setPayload(nextPayload);
        setExpandedTeacherId((current) => {
          const teachers = nextPayload.teacher_summaries ?? [];
          return teachers.some((teacher) => teacher.id === current) ? current : null;
        });
        setSelectedStudentId((current) => {
          const teachers = nextPayload.teacher_summaries ?? [];
          const stillExists = teachers.some((teacher) =>
            teacher.students.some((student) => student.student_id === current),
          );
          return stillExists ? current : null;
        });
      } catch (refreshError) {
        setError(
          refreshError instanceof Error ? refreshError.message : "Failed to load monthly online attendance",
        );
      } finally {
        if (withLoading) setLoading(false);
        else setRefreshing(false);
      }
    },
    [month],
  );

  React.useEffect(() => {
    setExpandedTeacherId(null);
    setSelectedStudentId(null);
  }, [month]);

  React.useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const teacherSummaries = payload?.teacher_summaries ?? [];
  const overallSummary = payload?.overall_summary ?? payload?.summary ?? emptySummary;
  const expandedTeacher = teacherSummaries.find((teacher) => teacher.id === expandedTeacherId) ?? null;
  const selectedStudentOccurrences = React.useMemo(() => {
    if (!expandedTeacher || !selectedStudentId) return [];
    return expandedTeacher.monthly_occurrences.filter(
      (occurrence) => occurrence.student_id === selectedStudentId,
    );
  }, [expandedTeacher, selectedStudentId]);
  const selectedStudentData = React.useMemo(
    () => groupOccurrencesByStudent(selectedStudentOccurrences)[0] ?? null,
    [selectedStudentOccurrences],
  );
  const selectedDayHeading = selectedDayOccurrences[0]?.session_date
    ? formatDateHeading(selectedDayOccurrences[0].session_date)
    : undefined;

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminNavbar />
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Online Attendance</h1>
            <p className="mt-1 text-sm text-slate-500">Overview semua guru untuk {formatMonthLabel(month)}.</p>
          </div>
          <AdminScopeSwitch />
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard
            label="Present"
            value={overallSummary.total_attendance}
            icon={CheckCircle2}
            tone="emerald"
            loading={loading}
          />
          <SummaryCard
            label="Marked"
            value={`${overallSummary.marked_sessions}/${overallSummary.total_sessions}`}
            icon={CalendarDays}
            tone="slate"
            loading={loading}
          />
          <SummaryCard
            label="Unmarked"
            value={unmarkedCount(overallSummary)}
            icon={CalendarDays}
            tone="slate"
            loading={loading}
          />
          <SummaryCard
            label="Total Sessions"
            value={overallSummary.total_sessions}
            icon={CalendarDays}
            tone="slate"
            loading={loading}
          />
          <SummaryCard
            label="Absent"
            value={overallSummary.absent_count}
            icon={XCircle}
            tone="rose"
            loading={loading}
          />
        </section>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <MonthDropdown value={month} onChange={setMonth} />
            <Button
              variant="outline"
              className="h-11 cursor-pointer rounded-xl border-slate-200"
              onClick={() => void refreshData(false)}
              disabled={refreshing}
            >
              <RefreshCw className={cn("h-4 w-4", refreshing ? "animate-spin" : "")} />
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>
          </div>

          {payload?.warning ? (
            <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {payload.warning}
            </div>
          ) : null}
          {error ? (
            <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3].map((index) => (
                <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : teacherSummaries.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-slate-700">No online teachers found.</p>
              <p className="mt-1 text-xs text-slate-500">Attendance will appear once teachers have packages.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {teacherSummaries.map((teacher) => {
                const isExpanded = expandedTeacherId === teacher.id;
                const hasStudents = teacher.students.length > 0;
                const teacherUnmarked = unmarkedCount(teacher.summary);

                return (
                  <div key={teacher.id}>
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-slate-300"
                      onClick={() => {
                        setExpandedTeacherId((current) => (current === teacher.id ? null : teacher.id));
                        setSelectedStudentId(null);
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100">
                          <UserRound className="h-4 w-4 text-slate-600" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-slate-950">{teacher.name}</p>
                          <p className="text-xs text-slate-500">
                            {teacher.students.length} students - {teacher.active_package_count} active packages
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <div className="text-right">
                          <p className="text-2xl font-semibold tabular-nums text-slate-950">
                            {teacher.summary.marked_sessions}/{teacher.summary.total_sessions}
                          </p>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            sessions marked
                          </p>
                          {teacherUnmarked > 0 ? (
                            <p className="text-[10px] font-medium text-amber-600">
                              {teacherUnmarked} unmarked
                            </p>
                          ) : null}
                        </div>
                        <ChevronDown
                          className={cn("h-5 w-5 text-slate-400 transition-transform", isExpanded && "rotate-180")}
                        />
                      </div>
                    </button>

                    {isExpanded ? (
                      <div className="border-t border-slate-100 bg-white">
                        <div className="grid gap-2 px-4 py-3 sm:grid-cols-2 lg:grid-cols-5">
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <p className="text-xs text-slate-500">Marked Sessions</p>
                            <p className="text-lg font-semibold text-slate-900">
                              {teacher.summary.marked_sessions} of {teacher.summary.total_sessions}
                            </p>
                          </div>
                          <div className="rounded-lg bg-amber-50 px-3 py-2">
                            <p className="text-xs text-amber-700">Unmarked</p>
                            <p className="text-lg font-semibold text-amber-800">
                              {teacherUnmarked}
                            </p>
                          </div>
                          <div className="rounded-lg bg-emerald-50 px-3 py-2">
                            <p className="text-xs text-emerald-700">Present</p>
                            <p className="text-lg font-semibold text-emerald-800">
                              {teacher.summary.total_attendance}
                            </p>
                          </div>
                          <div className="rounded-lg bg-rose-50 px-3 py-2">
                            <p className="text-xs text-rose-700">Absent</p>
                            <p className="text-lg font-semibold text-rose-800">{teacher.summary.absent_count}</p>
                          </div>
                          <div className="rounded-lg bg-sky-50 px-3 py-2">
                            <p className="text-xs text-sky-700">Rate</p>
                            <p className="text-lg font-semibold text-sky-800">
                              {teacher.summary.attendance_rate_pct}%
                            </p>
                          </div>
                        </div>

                        {!hasStudents ? (
                          <div className="px-4 pb-4 text-sm text-slate-500">
                            No sessions scheduled for this teacher in {formatMonthLabel(month)}.
                          </div>
                        ) : (
                          <div className="px-4 pb-4">
                            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                              <Users className="h-3.5 w-3.5" />
                              Student Summary
                            </div>
                            <div className="overflow-hidden rounded-xl border border-slate-200">
                              {teacher.students.map((student) => {
                                const isSelected = selectedStudentId === student.student_id;
                                const studentUnmarked = unmarkedCount(student.summary);

                                return (
                                  <div key={student.student_id} className="border-b border-slate-100 last:border-b-0">
                                    <button
                                      type="button"
                                      className={cn(
                                        "flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-slate-300",
                                        isSelected ? "bg-sky-50" : "bg-white hover:bg-slate-50",
                                      )}
                                      onClick={() => {
                                        setSelectedStudentId((current) =>
                                          current === student.student_id ? null : student.student_id,
                                        );
                                      }}
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-slate-900">
                                          {student.student_name}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                          Marked {student.summary.marked_sessions}/{student.summary.total_sessions}
                                          {" "}-
                                          {" "}unmarked {studentUnmarked}
                                          {" "}-
                                          {" "}present {student.summary.present_count}
                                          {" "}-
                                          {" "}absent {student.summary.absent_count}
                                        </p>
                                      </div>
                                      <ChevronDown
                                        className={cn(
                                          "h-4 w-4 shrink-0 text-slate-400 transition-transform",
                                          isSelected && "rotate-180",
                                        )}
                                      />
                                    </button>

                                    {isSelected && selectedStudentData ? (
                                      <StudentMonthlyCalendar
                                        month={month}
                                        studentData={selectedStudentData}
                                        onDayClick={setSelectedDayOccurrences}
                                      />
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <Modal
        open={selectedDayOccurrences.length > 0}
        title={selectedDayOccurrences[0]?.student_name ?? "Session details"}
        description={selectedDayHeading}
        onClose={() => setSelectedDayOccurrences([])}
      >
        <div className="space-y-3">
          {selectedDayOccurrences.map((occurrence) => {
            const isMarked = occurrence.attendance_status !== null;
            return (
              <Card
                key={occurrence.id ?? `${occurrence.package_slot_id}:${occurrence.session_date}:${occurrence.start_time}`}
                className={cn("p-4 shadow-sm", isMarked && "bg-slate-50/60")}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          unmarked
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs font-medium text-sky-700">
                      {timeRangeLabel(occurrence.start_time, occurrence.duration_minutes)}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
