"use client";

import React from "react";
import Navbar from "@/components/Navbar";
import { Card, CardContent } from "@/components/ui/Card";
import { Progress } from "@/components/ui/progress";
import {
  mockClassAttendance,
  buildInitialAttendanceState,
  calculateStudentSummaries,
  getFamilyStudents,
  getStudentHistory,
  calculateClassDailyStats,
} from "@/data/attendance";
import type { StudentAttendanceSummary } from "@/types/attendance";

const familyId = "fam-yusof";

const toLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDate = (date: string) => {
  try {
    const d = new Date(date);
    return {
      label: d.toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" }),
      weekday: d.toLocaleDateString("en-MY", { weekday: "long" }),
    };
  } catch {
    return { label: date, weekday: "" };
  }
};

export default function ParentAttendancePage() {
  const classes = mockClassAttendance;
  const attendanceState = React.useMemo(() => buildInitialAttendanceState(classes), [classes]);
  const studentSummaries = React.useMemo(
    () => calculateStudentSummaries(attendanceState, classes),
    [attendanceState, classes],
  );
  const familyStudents = React.useMemo(() => getFamilyStudents(classes, familyId), [classes]);

  const summaries: StudentAttendanceSummary[] = familyStudents
    .map((student) => studentSummaries.find((summary) => summary?.id === student.id))
    .filter((summary): summary is StudentAttendanceSummary => Boolean(summary));

  const [selectedStudentId, setSelectedStudentId] = React.useState<string>(() => summaries[0]?.id ?? "");

  React.useEffect(() => {
    if (!summaries.length) {
      setSelectedStudentId("");
      return;
    }
    if (!selectedStudentId || !summaries.some((summary) => summary.id === selectedStudentId)) {
      setSelectedStudentId(summaries[0].id);
    }
  }, [summaries, selectedStudentId]);

  const selectedSummary =
    summaries.find((summary) => summary.id === selectedStudentId) ?? summaries[0] ?? null;

  const selectedHistory = React.useMemo(() => {
    if (!selectedSummary) return [];
    return getStudentHistory(attendanceState, selectedSummary.classId, selectedSummary.id);
  }, [attendanceState, selectedSummary]);

  const todayRecord = React.useMemo(() => {
    if (!selectedSummary) return null;
    const todayIso = toLocalDateKey(new Date());
    const classItem = classes.find((item) => item.id === selectedSummary.classId);
    if (!classItem) return null;
    const stats = calculateClassDailyStats(attendanceState, classItem.id, classItem.students, todayIso);
    if (!stats.submitted) return null;
    return stats;
  }, [attendanceState, classes, selectedSummary]);

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Attendance</p>
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Children attendance</h1>
            <p className="text-slate-600">Monitor daily presence, streaks, and recent absences.</p>
          </div>
        </div>

        {!summaries.length && (
          <Card className="mt-10 border-dashed border-slate-200 text-center">
            <CardContent className="space-y-4 p-10">
              <h2 className="text-xl font-semibold text-slate-800">No students linked yet</h2>
              <p className="text-sm text-slate-500">
                Once your children are linked to this parent account their attendance appears here automatically.
              </p>
            </CardContent>
          </Card>
        )}

        {summaries.length > 0 && (
          <section className="mt-10 space-y-8">
            <div className="grid gap-6 lg:grid-cols-2">
              {summaries.map((summary) => (
                <Card key={summary.id} className="border-slate-100 shadow">
                  <CardContent className="space-y-4 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          {summary.className}
                        </p>
                        <h3 className="text-xl font-semibold text-slate-900">{summary.name}</h3>
                      </div>
                      <div className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        {summary.attendancePercent}% overall
                      </div>
                    </div>
                    <div className="space-y-3">
                      <Progress value={summary.attendancePercent} className="h-2 bg-slate-200" />
                      <div className="flex items-center justify-between text-sm text-slate-600">
                        <span>
                          Present {summary.presentDays}/{summary.totalDays || 1} days
                        </span>
                        <span>Streak {summary.currentPresentStreak} days</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                        <p className="text-xs uppercase tracking-widest">Best streak</p>
                        <p className="text-2xl font-semibold">{summary.bestPresentStreak}</p>
                        <p className="text-xs text-emerald-600">consecutive days present</p>
                      </div>
                      <div className="rounded-2xl bg-rose-50 p-3 text-rose-700">
                        <p className="text-xs uppercase tracking-widest">Absences</p>
                        <p className="text-2xl font-semibold">{summary.absentDays}</p>
                        <p className="text-xs text-rose-600">
                          {summary.lastAbsentDate
                            ? `Last on ${formatDate(summary.lastAbsentDate).label}`
                            : "No absences recorded"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="border-slate-100 shadow">
              <CardContent className="space-y-6 p-6">
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Daily log</p>
                    <h2 className="text-2xl font-semibold text-slate-900">Recent attendance</h2>
                    {todayRecord && (
                      <p className="text-xs text-slate-500">
                        Today&apos;s class average: {todayRecord.present}/{todayRecord.total} present (
                        {todayRecord.percent}%)
                      </p>
                    )}
                  </div>
                  <div className="ml-auto">
                    <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
                      Student
                      <select
                        value={selectedSummary?.id ?? ""}
                        onChange={(event) => setSelectedStudentId(event.target.value)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-900 shadow-inner focus:outline-none"
                      >
                        {summaries.map((summary) => (
                          <option key={summary.id} value={summary.id}>
                            {summary.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                {selectedSummary && (
                  <div className="grid gap-6 lg:grid-cols-[2fr_minmax(0,1fr)]">
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-100 bg-slate-50/70">
                        {selectedHistory.slice(0, 7).map((entry) => {
                          const { label, weekday } = formatDate(entry.date);
                          const isPresent = entry.status === "present";
                          return (
                            <div
                              key={entry.date}
                              className="flex items-center justify-between border-b border-slate-100 px-5 py-4 last:border-b-0"
                            >
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{label}</p>
                                <p className="text-xs text-slate-500">{weekday}</p>
                              </div>
                              <span
                                className={`rounded-full px-4 py-1 text-sm font-semibold ${
                                  isPresent
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-rose-100 text-rose-700"
                                }`}
                              >
                                {isPresent ? "Present" : "Absent"}
                              </span>
                            </div>
                          );
                        })}
                        {!selectedHistory.length && (
                          <p className="px-5 py-6 text-center text-sm text-slate-500">
                            Attendance history will appear once the teacher begins marking attendance for this child.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-4 rounded-2xl border border-slate-100 bg-white/60 p-5">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Summary</p>
                        <p className="text-sm text-slate-600">
                          Latest update on{" "}
                          {selectedHistory.length ? formatDate(selectedHistory[0].date).label : "—"}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
                          <span>Attendance score</span>
                          <span>{selectedSummary.attendancePercent}%</span>
                        </div>
                        <Progress value={selectedSummary.attendancePercent} className="h-2 bg-slate-200" />
                      </div>
                      <div className="grid gap-3 text-sm">
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Present days</p>
                          <p className="text-xl font-semibold text-slate-900">{selectedSummary.presentDays}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Absences</p>
                          <p className="text-xl font-semibold text-slate-900">{selectedSummary.absentDays}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Current streak</p>
                          <p className="text-xl font-semibold text-slate-900">
                            {selectedSummary.currentPresentStreak} days present
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        )}
      </main>
    </div>
  );
}
