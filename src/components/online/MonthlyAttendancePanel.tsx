"use client";

import React from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

export type OnlineAttendanceOccurrence = {
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

type CalendarCell = {
  day: number;
  dateStr: string;
  inMonth: boolean;
};

export type StudentCalendarData = {
  student_id: string;
  student_name: string;
  occurrences: OnlineAttendanceOccurrence[];
  occurrencesByDate: Map<string, OnlineAttendanceOccurrence[]>;
};

type StudentCountMode = "presentOnly" | "presentOverTotal" | "presentDaysOverTotalDays";

type Props = {
  month: string;
  occurrences: OnlineAttendanceOccurrence[];
  loading?: boolean;
  busyKey?: string | null;
  expandedStudentIds: ReadonlySet<string>;
  onStudentToggle: (studentId: string) => void;
  onDayClick?: (occurrences: OnlineAttendanceOccurrence[]) => void;
  studentCountMode?: StudentCountMode;
  emptyTitle?: string;
  emptyDescription?: string;
};

export const buildCalendarGrid = (monthKey: string): CalendarCell[][] => {
  const [year, mon] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const firstDayOfWeek = (new Date(Date.UTC(year, mon - 1, 1)).getUTCDay() + 6) % 7;

  const weeks: CalendarCell[][] = [];
  let week: CalendarCell[] = [];

  for (let index = 0; index < firstDayOfWeek; index += 1) {
    week.push({ day: 0, dateStr: "", inMonth: false });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    week.push({ day, dateStr, inMonth: true });
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

export const groupOccurrencesByStudent = (occurrences: OnlineAttendanceOccurrence[]) => {
  const map = new Map<string, StudentCalendarData>();

  occurrences.forEach((occurrence) => {
    let entry = map.get(occurrence.student_id);
    if (!entry) {
      entry = {
        student_id: occurrence.student_id,
        student_name: occurrence.student_name,
        occurrences: [],
        occurrencesByDate: new Map(),
      };
      map.set(occurrence.student_id, entry);
    }

    entry.occurrences.push(occurrence);
    const dateList = entry.occurrencesByDate.get(occurrence.session_date) ?? [];
    dateList.push(occurrence);
    entry.occurrencesByDate.set(occurrence.session_date, dateList);
  });

  return Array.from(map.values())
    .map((entry) => ({
      ...entry,
      occurrences: [...entry.occurrences].sort(
        (a, b) => a.session_date.localeCompare(b.session_date) || a.start_time.localeCompare(b.start_time),
      ),
    }))
    .sort((a, b) => a.student_name.localeCompare(b.student_name));
};

const getCourseCalendarFill = (courseName: string) => {
  if (/hafazan|tahfiz/i.test(courseName)) return "bg-emerald-500 text-white shadow-sm ring-1 ring-emerald-400/50";
  if (/islamic|islam|muamalah/i.test(courseName)) return "bg-sky-500 text-white shadow-sm ring-1 ring-sky-400/50";
  return "bg-slate-600 text-white shadow-sm ring-1 ring-slate-400/50";
};

const getStudentCountLabel = (studentData: StudentCalendarData, mode: StudentCountMode) => {
  const presentCount = studentData.occurrences.filter((occurrence) => occurrence.attendance_status === "present").length;
  if (mode === "presentOnly") return String(presentCount);
  if (mode === "presentDaysOverTotalDays") {
    const presentDays = Array.from(studentData.occurrencesByDate.values()).filter((dateOccurrences) =>
      dateOccurrences.every((occurrence) => occurrence.attendance_status === "present"),
    ).length;
    return `${presentDays}/${studentData.occurrencesByDate.size}`;
  }
  return `${presentCount}/${studentData.occurrences.length}`;
};

export default function MonthlyAttendancePanel({
  month,
  occurrences,
  loading = false,
  busyKey = null,
  expandedStudentIds,
  onStudentToggle,
  onDayClick,
  studentCountMode = "presentDaysOverTotalDays",
  emptyTitle = "No sessions for this month.",
  emptyDescription = "Sessions will appear once packages are assigned and scheduled.",
}: Props) {
  const monthlyByStudent = React.useMemo(() => groupOccurrencesByStudent(occurrences), [occurrences]);
  const calendarGrid = React.useMemo(() => buildCalendarGrid(month), [month]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((index) => (
          <Card key={index} className="animate-pulse rounded-2xl p-5">
            <div className="h-5 w-36 rounded bg-slate-200" />
          </Card>
        ))}
      </div>
    );
  }

  if (monthlyByStudent.length === 0) {
    return (
      <Card className="rounded-2xl p-8 text-center">
        <p className="text-sm text-slate-500">{emptyTitle}</p>
        <p className="mt-1 text-xs text-slate-400">{emptyDescription}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {monthlyByStudent.map((studentData) => {
        const isExpanded = expandedStudentIds.has(studentData.student_id);

        return (
          <div
            key={studentData.student_id}
            className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md"
          >
            <button
              type="button"
              className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-slate-50/50"
              onClick={() => onStudentToggle(studentData.student_id)}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="truncate text-sm font-semibold text-slate-900">{studentData.student_name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                  {getStudentCountLabel(studentData, studentCountMode)}
                </span>
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
              </div>
            </button>

            {isExpanded ? (
              <div className="mx-auto max-w-md border-t border-slate-100 px-4 py-4 sm:px-5">
                <div className="mb-2 grid grid-cols-7 gap-1 text-center">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                    <div
                      key={day}
                      className="pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400"
                    >
                      {day}
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  {calendarGrid.map((weekRow, weekIndex) => (
                    <div key={weekIndex} className="grid grid-cols-7 gap-1">
                      {weekRow.map((cell, cellIndex) => {
                        if (!cell.inMonth) {
                          return <div key={cellIndex} className="aspect-square" />;
                        }

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
                        const isBusy = dayOccurrences.some((occurrence) => busyKey === `mark:${occurrence.id}`);
                        const primaryCourse = dayOccurrences[0].course_name;
                        const multiSession = dayOccurrences.length > 1;

                        return (
                          <button
                            key={cellIndex}
                            type="button"
                            disabled={isBusy}
                            className={cn(
                              "relative flex aspect-square items-center justify-center rounded-lg text-[11px] font-semibold transition-all duration-200",
                              allPresent
                                ? getCourseCalendarFill(primaryCourse)
                                : somePresent
                                  ? "border border-emerald-300 bg-emerald-50 text-emerald-700"
                                  : allAbsent
                                    ? "border border-rose-200 bg-rose-50 text-rose-700"
                                    : "border border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50",
                              isBusy && "pointer-events-none opacity-50",
                            )}
                            onClick={() => onDayClick?.(dayOccurrences)}
                            title={multiSession ? `${dayOccurrences.length} sessions - click to review` : undefined}
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
  );
}
