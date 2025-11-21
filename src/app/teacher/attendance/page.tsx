"use client";

import React from "react";
import Navbar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { cn } from "@/lib/utils";
import {
  buildInitialAttendanceState,
  createDefaultDailyRecord,
  calculateClassDailyStats,
  calculateOverallDailyStats,
  calculateStudentSummaries,
  getClassAnalyticsForDate,
} from "@/data/attendance";
import type { AttendanceRecord, AttendanceStatus, ClassAttendance } from "@/types/attendance";
import { Calendar, CheckCircle2, GraduationCap } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const tabs = [
  { id: "rollcall", label: "Daily Roll Call" },
  { id: "analytics", label: "Class Analytics" },
  { id: "student-summary", label: "Student Summary" },
];

const formatDisplayDate = (date: string) => {
  try {
    return new Date(date).toLocaleDateString("en-MY", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return date;
  }
};

const todayIso = () => new Date().toISOString().split("T")[0];

const getRateColor = (percent: number) => {
  if (percent >= 90) return "bg-emerald-50 text-emerald-700";
  if (percent >= 75) return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
};

type StatusValue = "present" | "absent";

function StatusToggle({ value, onChange }: { value: StatusValue; onChange: (val: StatusValue) => void }) {
  const options: { id: StatusValue; label: string }[] = [
    { id: "present", label: "Present" },
    { id: "absent", label: "Absent" },
  ];
  return (
    <div
      role="radiogroup"
      className="inline-flex items-center rounded-full bg-slate-100 p-0.5 text-[12px] font-medium transition-all duration-150"
    >
      {options.map((option) => {
        const isActive = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-500",
              isActive ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
            )}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

type StudentRosterRow = {
  id: string;
  name: string | null;
  class_id: string | null;
  parent_id: string | null;
};

export default function TeacherAttendancePage() {
  const [classes, setClasses] = React.useState<ClassAttendance[]>([]);
  const [selectedClassId, setSelectedClassId] = React.useState("");
  const [selectedDate, setSelectedDate] = React.useState(() => todayIso());
  const [saving, setSaving] = React.useState(false);
  const [isDirty, setIsDirty] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState("Saved just now");
  const [searchTerm, setSearchTerm] = React.useState("");
  const [sortBy, setSortBy] = React.useState<"name" | "absent" | "rate">("name");
  const [analyticsRange, setAnalyticsRange] = React.useState<"7" | "30">("7");
  const [attendanceState, setAttendanceState] = React.useState<AttendanceRecord>({});
  const [loadingClasses, setLoadingClasses] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  const selectedClass = classes.find((item) => item.id === selectedClassId);
  const formattedSelectedDate = formatDisplayDate(selectedDate);

  const fetchStudentRoster = React.useCallback(async () => {
    const pageSize = 1000;
    let from = 0;
    const allStudents: StudentRosterRow[] = [];
    // Paginate to avoid hitting row limits when the school grows
    while (true) {
      const { data, error } = await supabase
        .from("students")
        .select("id, name, class_id, parent_id")
        .not("class_id", "is", null)
        .order("name", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) {
        throw error;
      }
      if (data && data.length > 0) {
        allStudents.push(...data);
      }
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
    return allStudents;
  }, []);

  const fetchClassRosters = React.useCallback(async () => {
    setLoadingClasses(true);
    setFetchError(null);
    try {
      const [{ data: classData, error: classError }, studentRows] = await Promise.all([
        supabase.from("classes").select("id, name").order("name"),
        fetchStudentRoster(),
      ]);
      if (classError) {
        throw classError;
      }
      const classMap = new Map<string, ClassAttendance>();
      (classData ?? []).forEach((cls) => {
        if (!cls?.id) return;
        classMap.set(String(cls.id), {
          id: String(cls.id),
          name: cls.name ?? "Unnamed class",
          students: [],
          records: [],
        });
      });
      studentRows.forEach((student) => {
        if (!student.class_id) return;
        const classId = String(student.class_id);
        if (!classMap.has(classId)) {
          classMap.set(classId, {
            id: classId,
            name: "Unnamed class",
            students: [],
            records: [],
          });
        }
        classMap.get(classId)!.students.push({
          id: String(student.id),
          name: student.name ?? "Unnamed student",
          familyId: String(student.parent_id ?? student.id),
          classId,
        });
      });
      const roster = Array.from(classMap.values())
        .map((classItem) => ({
          ...classItem,
          students: [...classItem.students].sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setClasses(roster);
      setAttendanceState(buildInitialAttendanceState(roster));
      setSelectedClassId((current) => (current || roster[0]?.id) ?? "");
      setIsDirty(false);
      setStatusMessage("Saved just now");
    } catch (error) {
      console.error("Failed to load class roster", error);
      setClasses([]);
      setAttendanceState({});
      setSelectedClassId("");
      setFetchError("Unable to load the latest class roster. Please try again.");
    } finally {
      setLoadingClasses(false);
    }
  }, [fetchStudentRoster]);

  React.useEffect(() => {
    fetchClassRosters();
  }, [fetchClassRosters]);

  React.useEffect(() => {
    if (classes.length === 0) return;
    setSelectedClassId((current) => {
      if (current && classes.some((cls) => cls.id === current)) {
        return current;
      }
      return classes[0]?.id ?? "";
    });
  }, [classes]);

  React.useEffect(() => {
    if (!selectedClass) return;
    setAttendanceState((prev) => {
      const classState = prev[selectedClass.id] ?? {};
      if (classState[selectedDate]) return prev;
      return {
        ...prev,
        [selectedClass.id]: {
          ...classState,
          [selectedDate]: createDefaultDailyRecord(selectedClass.students),
        },
      };
    });
    setIsDirty(false);
    setStatusMessage("Saved just now");
  }, [selectedDate, selectedClass]);

  const updateStudentStatus = (studentId: string, status: AttendanceStatus) => {
    if (!selectedClass) return;
    setAttendanceState((prev) => {
      const classState = prev[selectedClass.id] ?? {};
      const record = classState[selectedDate] ?? createDefaultDailyRecord(selectedClass.students);
      if (record[studentId] === status) return prev;
      setIsDirty(true);
      setStatusMessage("Unsaved changes");
      return {
        ...prev,
        [selectedClass.id]: {
          ...classState,
          [selectedDate]: {
            ...record,
            [studentId]: status,
          },
        },
      };
    });
  };

  const handleMarkAllPresent = () => {
    if (!selectedClass) return;
    setAttendanceState((prev) => {
      const classState = prev[selectedClass.id] ?? {};
      const record = classState[selectedDate] ?? createDefaultDailyRecord(selectedClass.students);
      const updated = { ...record };
      selectedClass.students.forEach((student) => {
        updated[student.id] = "present";
      });
      return {
        ...prev,
        [selectedClass.id]: {
          ...classState,
          [selectedDate]: updated,
        },
      };
    });
    setIsDirty(true);
    setStatusMessage("Unsaved changes");
  };

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setIsDirty(false);
      setStatusMessage("Saved just now");
    }, 1000);
  };

  const classStats = selectedClass
    ? calculateClassDailyStats(attendanceState, selectedClass.id, selectedClass.students, selectedDate)
    : { present: 0, absent: 0, percent: 0, total: 0, record: {} };

  const perClassAnalytics = React.useMemo(
    () => getClassAnalyticsForDate(attendanceState, classes, selectedDate),
    [attendanceState, classes, selectedDate],
  );

  const overallStats = React.useMemo(
    () => calculateOverallDailyStats(attendanceState, classes, selectedDate),
    [attendanceState, classes, selectedDate],
  );

  const studentSummaries = React.useMemo(
    () => calculateStudentSummaries(attendanceState, classes),
    [attendanceState, classes],
  );

  const filteredSummaries = React.useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    let filtered = studentSummaries;
    if (query) {
      filtered = filtered.filter(
        (summary) =>
          summary.name.toLowerCase().includes(query) || summary.className.toLowerCase().includes(query),
      );
    }
    const sorted = [...filtered];
    switch (sortBy) {
      case "absent":
        sorted.sort((a, b) => b.absentDays - a.absentDays);
        break;
      case "rate":
        sorted.sort((a, b) => b.attendancePercent - a.attendancePercent);
        break;
      default:
        sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
    return sorted;
  }, [studentSummaries, searchTerm, sortBy]);

  const statusTone = saving ? "text-slate-500" : isDirty ? "text-amber-500" : "text-emerald-500";
  const statusLabel = saving ? "Saving..." : statusMessage;

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 pt-10 pb-16">
        <Tabs defaultValue="rollcall">
          <div className="mb-8">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Attendance</p>
            <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-slate-900 leading-tight">
              Class attendance
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-500 leading-relaxed">
              Mark daily presence, track class health, and review student trends.
            </p>
            <div className="mt-2">
              <TabsList className="inline-flex items-center gap-1 rounded-full bg-slate-100 p-1">
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-[13px] font-medium text-slate-500 transition-all duration-150 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/10",
                      "data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm",
                    )}
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </div>

          <TabsContent value="rollcall">
            {loadingClasses ? (
              <Card className="rounded-3xl border border-slate-200 bg-white shadow-none">
                <CardContent className="py-10 text-center">
                  <p className="text-sm font-semibold text-slate-900">Loading class roster…</p>
                  <p className="mt-2 text-sm text-slate-500">
                    Fetching the latest class assignments from the admin dashboard.
                  </p>
                </CardContent>
              </Card>
            ) : fetchError ? (
              <Card className="rounded-3xl border border-rose-100 bg-white shadow-none">
                <CardContent className="py-10 text-center">
                  <p className="text-sm font-semibold text-slate-900">We couldn&apos;t load the class list.</p>
                  <p className="mt-2 text-sm text-slate-500">{fetchError}</p>
                  <Button className="mt-4" onClick={fetchClassRosters}>
                    Try again
                  </Button>
                </CardContent>
              </Card>
            ) : classes.length === 0 ? (
              <Card className="rounded-3xl border border-slate-200 bg-white shadow-none">
                <CardContent className="py-10 text-center">
                  <p className="text-sm font-semibold text-slate-900">No classes found.</p>
                  <p className="mt-2 text-sm text-slate-500">
                    Once the admin assigns students to classes, they will appear here automatically.
                  </p>
                </CardContent>
              </Card>
            ) : !selectedClass ? (
              <Card className="rounded-3xl border border-slate-200 bg-white shadow-none">
                <CardContent className="py-10 text-center">
                  <p className="text-sm font-semibold text-slate-900">Select a class to get started.</p>
                  <p className="mt-2 text-sm text-slate-500">
                    Choose one of the available classes from the dropdown above.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <Card className="relative flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
                  <div className="sticky top-0 z-10 -mx-6 border-b border-slate-100 bg-white/95 px-6 pb-4 pt-5 backdrop-blur">
                    <div className="space-y-2">
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                        Daily roll call
                      </p>
                      <p className="text-[14px] font-medium text-slate-900 leading-tight">
                        {selectedClass.name} · {formattedSelectedDate}
                      </p>
                      <p className="text-[13px] text-slate-500 leading-relaxed">
                        All students are marked present by default. Change to Absent where needed.
                      </p>
                    </div>
                    <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3.5 py-1.5 text-[13px] text-slate-600 transition-all duration-150 focus-within:ring-2 focus-within:ring-slate-900/10">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <Input
                            type="date"
                            value={selectedDate}
                            onChange={(event) => setSelectedDate(event.target.value)}
                            className="h-6 border-0 bg-transparent p-0 text-[13px] font-medium text-slate-900 focus-visible:ring-0"
                          />
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3.5 py-1.5 text-[13px] text-slate-600 transition-all duration-150 focus-within:ring-2 focus-within:ring-slate-900/10">
                          <GraduationCap className="h-3.5 w-3.5 text-slate-400" />
                          <select
                            value={selectedClassId}
                            onChange={(event) => setSelectedClassId(event.target.value)}
                            className="bg-transparent text-[13px] font-medium text-slate-900 focus:outline-none"
                          >
                            {classes.map((classItem) => (
                              <option key={classItem.id} value={classItem.id}>
                                {classItem.name} ({classItem.students.length})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleMarkAllPresent}
                        className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Mark all present
                      </button>
                    </div>
                  </div>

                  <CardContent className="flex-1 space-y-6 p-6">
                    <div className="-mx-2 space-y-2">
                      {selectedClass.students.map((student) => {
                        const studentStatus =
                          attendanceState[selectedClass.id]?.[selectedDate]?.[student.id] ?? "present";
                        return (
                          <div
                            key={student.id}
                            className={cn(
                              "flex items-center justify-between rounded-2xl px-3 py-3 transition-colors duration-150",
                              studentStatus === "absent" ? "bg-rose-50/80" : "bg-slate-50",
                            )}
                          >
                            <div>
                              <p className="text-[14px] font-medium text-slate-900 leading-tight">{student.name}</p>
                              <p className="mt-0.5 text-[12px] text-slate-500">{selectedClass.name}</p>
                            </div>
                            <StatusToggle value={studentStatus} onChange={(value) => updateStudentStatus(student.id, value)} />
                          </div>
                        );
                      })}
                    </div>
                    <div className="sticky bottom-0 -mx-6 border-t border-slate-100 bg-white/95 px-6 py-3 backdrop-blur">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-slate-500">
                          <span className={`font-semibold ${statusTone}`}>{statusLabel}</span>
                          <span className="ml-2">· {selectedClass.students.length} students</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Button
                            variant="outline"
                            className="rounded-full border border-slate-200 text-[13px] font-medium text-slate-600 hover:bg-slate-100"
                            onClick={handleSave}
                            disabled={saving || !isDirty}
                          >
                            {saving ? "Saving..." : "Save changes"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Selected day</p>
                    <p className="mt-2 text-[32px] font-semibold tracking-tight text-slate-900 leading-none">
                      {classStats.percent}%
                    </p>
                    <p className="mt-1 text-[12px] text-slate-500 leading-relaxed">
                      {classStats.present} of {classStats.total} present · {formattedSelectedDate}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Class breakdown</p>
                    <div className="mt-3 space-y-3">
                      {perClassAnalytics.map((classItem) => (
                        <div key={classItem.classId} className="space-y-1.5">
                          <div className="flex items-center justify-between text-[13px] text-slate-600">
                            <span>{classItem.className}</span>
                            <span className="font-medium text-slate-900">{classItem.percent}%</span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-slate-900 transition-[width] duration-300"
                              style={{ width: `${classItem.percent}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                      Attendance coverage
                    </p>
                    <div className="mt-3 space-y-3">
                      <div className="flex items-center justify-between text-[13px] text-slate-500">
                        <span>Total students</span>
                        <span className="font-medium text-slate-900">{overallStats.total}</span>
                      </div>
                      <div className="flex items-center justify-between text-[13px] text-slate-500">
                        <span>Overall present</span>
                        <span className="font-medium text-slate-900">
                          {overallStats.present} ({overallStats.percent}%)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="analytics">
            <Card className="rounded-3xl border border-slate-200 bg-white shadow-none">
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Class analytics</p>
                  <CardTitle className="text-2xl text-slate-900">Class attendance trends</CardTitle>
                  <p className="text-sm text-slate-500">Snapshot for {formattedSelectedDate}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <span>Range</span>
                  <select
                    value={analyticsRange}
                    onChange={(event) => setAnalyticsRange(event.target.value as "7" | "30")}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-700 shadow-inner focus:outline-none"
                  >
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                  </select>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {perClassAnalytics.map((classItem) => (
                    <div key={classItem.classId} className="rounded-2xl border border-slate-100 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{classItem.className}</p>
                          <p className="text-3xl font-semibold text-slate-900">{classItem.percent}%</p>
                        </div>
                        <span className="text-sm text-slate-500">
                          {classItem.present}/{classItem.total} present
                        </span>
                      </div>
                      <div className="mt-3 h-2 rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-slate-900"
                          style={{ width: `${classItem.percent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="student-summary">
            <Card className="rounded-3xl border border-slate-200 bg-white shadow-none">
              <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Student summary</p>
                  <CardTitle className="text-2xl text-slate-900">30-day attendance overview</CardTitle>
                </div>
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                  <Input
                    placeholder="Search by name or class"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="w-full sm:w-64"
                  />
                  <select
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value as "name" | "absent" | "rate")}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-inner focus:outline-none"
                  >
                    <option value="name">Sort: Name</option>
                    <option value="absent">Sort: Highest absence</option>
                    <option value="rate">Sort: Attendance rate</option>
                  </select>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <div className="min-w-[640px]">
                  <div className="grid grid-cols-[2fr_repeat(4,minmax(0,1fr))] gap-4 border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    <span>Student</span>
                    <span>Class</span>
                    <span className="text-center">Present</span>
                    <span className="text-center">Absent</span>
                    <span className="text-center">Rate</span>
                  </div>
                  {filteredSummaries.map((summary, index) => (
                    <div
                      key={summary.id}
                      className={cn(
                        "grid grid-cols-[2fr_repeat(4,minmax(0,1fr))] items-center gap-4 px-4 py-4 text-sm",
                        index % 2 === 0 ? "bg-white" : "bg-slate-50",
                      )}
                    >
                      <div>
                        <p className="font-semibold text-slate-900">{summary.name}</p>
                        <p className="text-xs text-slate-500">
                          {summary.presentDays} / {summary.totalDays || 1} days tracked
                        </p>
                      </div>
                      <div>
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                          {summary.className}
                        </span>
                      </div>
                      <p className="text-center font-semibold text-emerald-600">{summary.presentDays}</p>
                      <p className="text-center font-semibold text-rose-500">{summary.absentDays}</p>
                      <div className="text-center">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                            getRateColor(summary.attendancePercent),
                          )}
                        >
                          {summary.attendancePercent}%
                        </span>
                      </div>
                    </div>
                  ))}
                  {!filteredSummaries.length && (
                    <p className="px-4 py-10 text-center text-sm text-slate-500">No students match your search.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
