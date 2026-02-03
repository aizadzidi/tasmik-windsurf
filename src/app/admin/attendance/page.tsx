"use client";

import React from "react";
import { Calendar, CalendarRange, LineChart, Plane, Trash2, X } from "lucide-react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import ClassAttendanceBarChart from "@/components/teacher/ClassAttendanceBarChart";
import {
  buildInitialAttendanceState,
  calculateOverallDailyStats,
  calculateStudentSummaries,
  getClassAnalyticsForRange,
} from "@/data/attendance";
import { listAttendanceRecords } from "@/lib/attendanceApi";
import { deleteHoliday, listHolidays, upsertHoliday } from "@/lib/holidaysApi";
import type { AttendanceRecord, AttendanceStatus, ClassAttendance, SchoolHoliday } from "@/types/attendance";
import { supabase } from "@/lib/supabaseClient";

type FormState = {
  id?: string | null;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  category: string;
};

const buildEmptyForm = (): FormState => ({
  id: null,
  title: "",
  description: "",
  start_date: "",
  end_date: "",
  category: "holiday",
});

const badgeStyles: Record<string, string> = {
  holiday: "bg-emerald-50 text-emerald-700 border-emerald-100",
  break: "bg-blue-50 text-blue-700 border-blue-100",
  closure: "bg-amber-50 text-amber-700 border-amber-100",
};

const ANALYTICS_RANGE_OPTIONS = [
  { id: "week", label: "7 days", days: 7 },
  { id: "month", label: "30 days", days: 30 },
  { id: "year", label: "365 days", days: 365 },
] as const;

type AnalyticsRange = (typeof ANALYTICS_RANGE_OPTIONS)[number]["id"];

const SUMMARY_RANGE_OPTIONS = [
  { id: "week", label: "7 days", days: 7 },
  { id: "month", label: "30 days", days: 30 },
  { id: "year", label: "365 days", days: 365 },
  { id: "lifetime", label: "Lifetime", days: null },
] as const;

type SummaryRange = (typeof SUMMARY_RANGE_OPTIONS)[number]["id"];

const toLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const todayIso = () => toLocalDateKey(new Date());

const normalizeAttendanceDate = (value: string) => {
  const raw = String(value);
  return raw.length >= 10 ? raw.slice(0, 10) : raw;
};

const humanDate = (value: string) =>
  value
    ? new Date(value).toLocaleDateString("en-MY", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "-";

const getRateColor = (percent: number) => {
  if (percent >= 90) return "bg-emerald-50 text-emerald-700";
  if (percent >= 75) return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
};

type StudentRosterRow = {
  id: string;
  name: string | null;
  class_id: string | null;
  parent_id: string | null;
};

export default function AdminAttendancePage() {
  const [classes, setClasses] = React.useState<ClassAttendance[]>([]);
  const [attendanceState, setAttendanceState] = React.useState<AttendanceRecord>({});
  const [selectedDate, setSelectedDate] = React.useState(() => todayIso());
  const [analyticsRange, setAnalyticsRange] = React.useState<AnalyticsRange>("week");
  const [summaryRange, setSummaryRange] = React.useState<SummaryRange>("month");
  const [searchTerm, setSearchTerm] = React.useState("");
  const [summaryClassFilter, setSummaryClassFilter] = React.useState<string>("all");
  const [, setLoadingClasses] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  const [holidays, setHolidays] = React.useState<SchoolHoliday[]>([]);
  const [loadingHolidays, setLoadingHolidays] = React.useState(true);
  const [holidayError, setHolidayError] = React.useState<string | null>(null);
  const [showBreakModal, setShowBreakModal] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(buildEmptyForm());
  const [savingHoliday, setSavingHoliday] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const currentRangeMeta = React.useMemo(
    () => ANALYTICS_RANGE_OPTIONS.find((option) => option.id === analyticsRange) ?? ANALYTICS_RANGE_OPTIONS[0],
    [analyticsRange],
  );
  const analyticsDateRange = React.useMemo(() => {
    const end = new Date(`${selectedDate}T00:00:00`);
    const start = new Date(end);
    start.setDate(start.getDate() - (currentRangeMeta.days - 1));
    return {
      start: toLocalDateKey(start),
      end: toLocalDateKey(end),
    };
  }, [selectedDate, currentRangeMeta]);

  const summaryRangeMeta = React.useMemo(
    () => SUMMARY_RANGE_OPTIONS.find((option) => option.id === summaryRange) ?? SUMMARY_RANGE_OPTIONS[0],
    [summaryRange],
  );
  const summaryStartDate = React.useMemo(() => {
    if (!summaryRangeMeta?.days) return null;
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - (summaryRangeMeta.days - 1));
    return toLocalDateKey(start);
  }, [summaryRangeMeta]);

  const attendanceLookbackStart = React.useMemo(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 365);
    return toLocalDateKey(start);
  }, []);

  const fetchStudentRoster = React.useCallback(async () => {
    const pageSize = 1000;
    let from = 0;
    const allStudents: StudentRosterRow[] = [];
    while (true) {
      const { data, error } = await supabase
        .from("students")
        .select("id, name, class_id, parent_id")
        .neq("record_type", "prospect")
        .not("class_id", "is", null)
        .order("name", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
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

      const historyRes = await listAttendanceRecords({
        classIds: roster.map((c) => c.id),
        startDate: attendanceLookbackStart,
        endDate: todayIso(),
      });

      if (historyRes.error) {
        setAttendanceState(buildInitialAttendanceState(roster));
        setFetchError("Unable to load attendance history. Please try again.");
        return;
      }

      const newState: AttendanceRecord = {};
      const grouped = new Map<
        string,
        { classId: string; date: string; statuses: Record<string, AttendanceStatus>; submitted: boolean }
      >();

      historyRes.records.forEach((rec) => {
        const dateKey = normalizeAttendanceDate(String(rec.attendance_date));
        const key = `${rec.class_id}_${dateKey}`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            classId: String(rec.class_id),
            date: dateKey,
            statuses: {},
            submitted: true,
          });
        }
        const group = grouped.get(key);
        if (group) {
          group.statuses[String(rec.student_id)] = rec.status || "present";
        }
      });

      grouped.forEach((g) => {
        newState[g.classId] = newState[g.classId] || {};
        newState[g.classId][g.date] = {
          statuses: g.statuses,
          submitted: true,
          note: "",
        };
      });

      setAttendanceState(Object.keys(newState).length ? newState : buildInitialAttendanceState(roster));
    } catch (error) {
      console.error("Failed to load class roster", error);
      setClasses([]);
      setAttendanceState({});
      setFetchError("Unable to load the latest class roster. Please try again.");
    } finally {
      setLoadingClasses(false);
    }
  }, [fetchStudentRoster, attendanceLookbackStart]);

  const fetchHolidays = React.useCallback(async () => {
    setLoadingHolidays(true);
    setHolidayError(null);
    const res = await listHolidays();
    if (res.error) {
      setHolidayError(res.error);
      setHolidays([]);
    } else {
      setHolidays(res.holidays);
    }
    setLoadingHolidays(false);
  }, []);

  React.useEffect(() => {
    fetchClassRosters();
    fetchHolidays();
  }, [fetchClassRosters, fetchHolidays]);

  const perClassAnalytics = React.useMemo(
    () => getClassAnalyticsForRange(attendanceState, classes, analyticsDateRange.start, analyticsDateRange.end),
    [attendanceState, classes, analyticsDateRange.start, analyticsDateRange.end],
  );

  const overallStats = React.useMemo(
    () => calculateOverallDailyStats(attendanceState, classes, selectedDate),
    [attendanceState, classes, selectedDate],
  );

  const studentSummaries = React.useMemo(
    () => calculateStudentSummaries(attendanceState, classes, { startDate: summaryStartDate }),
    [attendanceState, classes, summaryStartDate],
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
    if (summaryClassFilter !== "all") {
      filtered = filtered.filter(
        (summary) => summary.classId === summaryClassFilter || summary.className === summaryClassFilter,
      );
    }
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [studentSummaries, searchTerm, summaryClassFilter]);

  const handleHolidaySubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title || !form.start_date || !form.end_date) return;
    setSavingHoliday(true);
    setHolidayError(null);
    const payload = {
      ...form,
      description: form.description || undefined,
      id: form.id || undefined,
    };
    const res = await upsertHoliday(payload);
    if (res.error) {
      setHolidayError(res.error);
    } else if (res.holiday) {
      const next = form.id
        ? holidays.map((item) => (item.id === res.holiday?.id ? res.holiday : item))
        : [...holidays, res.holiday];
      setHolidays(next.sort((a, b) => b.start_date.localeCompare(a.start_date)));
      setForm(buildEmptyForm());
      setShowBreakModal(false);
    }
    setSavingHoliday(false);
  };

  const handleHolidayDelete = async (id: string) => {
    setDeletingId(id);
    const res = await deleteHoliday(id);
    if (res.error) {
      setHolidayError(res.error);
    } else {
      setHolidays((prev) => prev.filter((item) => item.id !== id));
    }
    setDeletingId(null);
  };

  const startEditHoliday = (holiday: SchoolHoliday) => {
    setForm({
      id: holiday.id,
      title: holiday.title,
      description: holiday.description || "",
      start_date: holiday.start_date,
      end_date: holiday.end_date,
      category: holiday.category || "holiday",
    });
    setShowBreakModal(true);
  };

  const resetHolidayForm = () => {
    setForm(buildEmptyForm());
    setHolidayError(null);
  };

  const configuredCount = holidays.length;

  const summaryAggregates = React.useMemo(() => {
    const totalStudents = filteredSummaries.length;
    const totalPresent = filteredSummaries.reduce((sum, item) => sum + item.presentDays, 0);
    const totalAbsent = filteredSummaries.reduce((sum, item) => sum + item.absentDays, 0);
    return { totalStudents, totalPresent, totalAbsent };
  }, [filteredSummaries]);

  return (
    <div className="min-h-screen bg-[#f6f7fb] text-slate-900">
      <AdminNavbar />
      <main className="mx-auto max-w-7xl px-6 pb-14 pt-8 space-y-5">
        <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Attendance</p>
            <h1 className="mt-1 text-[24px] font-semibold tracking-tight text-slate-900 leading-tight">
              Attendance overview
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              className="rounded-full bg-slate-900 text-white hover:bg-slate-800"
              onClick={() => {
                resetHolidayForm();
                setShowBreakModal(true);
              }}
            >
              Add school breaks
            </Button>
          </div>
        </header>

        {fetchError && (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {fetchError}
          </div>
        )}

        <section className="space-y-3">
          <Card className="rounded-3xl border border-slate-200 shadow-sm">
            <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Analytics</p>
                <CardTitle className="text-xl text-slate-900">Attendance trends</CardTitle>
                <p className="text-sm text-slate-500">
                  {currentRangeMeta.label} ending {humanDate(analyticsDateRange.end)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3.5 py-1.5 text-[13px] text-slate-600 transition-all duration-150 focus-within:ring-2 focus-within:ring-slate-900/10">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    className="h-6 border-0 bg-transparent p-0 text-[13px] font-medium text-slate-900 focus-visible:ring-0"
                  />
                </div>
                <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 p-1">
                  {ANALYTICS_RANGE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setAnalyticsRange(option.id)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-sm font-medium text-slate-500 transition-all duration-150 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/10",
                        analyticsRange === option.id ? "bg-white text-slate-900 shadow-sm" : "",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-slate-900 text-white flex items-center justify-center text-sm font-semibold">
                    {overallStats.percent || 0}%
                  </div>
                  <div>
                    <p className="text-[12px] uppercase tracking-[0.18em] text-slate-500">Today</p>
                    <p className="text-[15px] font-semibold text-slate-900 leading-tight">
                      {overallStats.present} of {overallStats.total} present
                    </p>
                    
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center text-sm font-semibold">
                    {classes.length}
                  </div>
                  <div>
                    <p className="text-[12px] uppercase tracking-[0.18em] text-slate-500">Classes</p>
                    <p className="text-[15px] font-semibold text-slate-900 leading-tight">Active classes</p>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center text-sm font-semibold">
                    {currentRangeMeta.days}
                  </div>
                  <div>
                    <p className="text-[12px] uppercase tracking-[0.18em] text-slate-500">Range</p>
                    <p className="text-[15px] font-semibold text-slate-900 leading-tight">
                      {humanDate(analyticsDateRange.start)} – {humanDate(analyticsDateRange.end)}
                    </p>
                    
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <ClassAttendanceBarChart data={perClassAnalytics} />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
                <LineChart className="h-5 w-5 text-slate-500" />
                Breaks
              </CardTitle>
              <p className="text-sm text-slate-500">{configuredCount} configured</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {holidayError && (
                <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {holidayError}
                </div>
              )}
              {!holidays.length && !loadingHolidays && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center">
                  <p className="text-sm font-semibold text-slate-900">No breaks yet.</p>
                  <p className="mt-1 text-sm text-slate-500">Add dates to pause attendance.</p>
                </div>
              )}
              {loadingHolidays && (
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600">
                  Loading breaks…
                </div>
              )}
              <div className="space-y-2">
                {holidays.map((holiday) => (
                  <div
                    key={holiday.id}
                    className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{holiday.title}</span>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold",
                          badgeStyles[holiday.category] ?? "bg-slate-100 text-slate-700 border border-slate-200",
                        )}
                      >
                        {holiday.category}
                      </span>
                      <span className="text-xs text-slate-500">
                        {humanDate(holiday.start_date)} – {humanDate(holiday.end_date)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        className="rounded-full border-slate-200 text-slate-700 hover:bg-slate-100"
                        onClick={() => startEditHoliday(holiday)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        className="rounded-full text-rose-600 hover:bg-rose-50"
                        onClick={() => handleHolidayDelete(holiday.id)}
                        disabled={deletingId === holiday.id}
                      >
                        {deletingId === holiday.id ? "Deleting..." : (
                          <>
                            <Trash2 className="h-4 w-4" />
                            Remove
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700 flex items-start gap-3">
                <Plane className="h-4 w-4 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-800">Attendance paused</p>
                  <p>Dates in this range are skipped.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <CardHeader className="space-y-3 sticky top-4 bg-white/90 backdrop-blur z-10">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Students</p>
                <CardTitle className="text-xl text-slate-900">Student attendance</CardTitle>
              </div>
              <div className="inline-flex flex-wrap items-center gap-1 rounded-full bg-slate-100 p-1">
                {SUMMARY_RANGE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSummaryRange(option.id)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm font-medium text-slate-500 transition-all duration-150 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/10",
                      summaryRange === option.id ? "bg-white text-slate-900 shadow-sm" : "",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Search student or class"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full sm:w-64"
              />
              <select
                value={summaryClassFilter}
                onChange={(event) => setSummaryClassFilter(event.target.value)}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-inner focus:outline-none"
              >
                <option value="all">All classes</option>
                {classes.map((classItem) => (
                  <option key={classItem.id} value={classItem.id}>
                    {classItem.name}
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <div className="flex flex-wrap gap-2 px-4 pb-3 text-sm text-slate-700">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="font-semibold text-slate-900">{summaryAggregates.totalStudents}</span> students
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="font-semibold text-emerald-600">{summaryAggregates.totalPresent}</span> total present days
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="font-semibold text-rose-600">{summaryAggregates.totalAbsent}</span> total absent days
              </div>
            </div>
            <div className="min-w-[640px] max-h-[520px] overflow-y-auto rounded-2xl border border-slate-100">
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
                      {summary.presentDays} / {summary.totalDays || 1} days
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
                <p className="px-4 py-10 text-center text-sm text-slate-500">No matches.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      {showBreakModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="relative w-full max-w-2xl rounded-[28px] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <CalendarRange className="h-5 w-5 text-slate-500" />
                <h2 className="text-lg text-slate-900">
                  {form.id ? "Edit break" : "Add break"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetHolidayForm();
                  setShowBreakModal(false);
                }}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form className="space-y-4 px-6 py-6" onSubmit={handleHolidaySubmit}>
              {holidayError && (
                <div className="rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700">
                  {holidayError}
                </div>
              )}
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-4">
                  <div className="grid gap-3">
                    <label className="text-sm font-semibold text-slate-800">Name</label>
                    <Input
                      placeholder="e.g. Hari Raya"
                      value={form.title}
                      onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="grid gap-3">
                    <label className="text-sm font-semibold text-slate-800">Notes</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                      rows={3}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-inner focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <label className="text-sm font-semibold text-slate-800">Start</label>
                      <Input
                        type="date"
                        value={form.start_date}
                        onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm font-semibold text-slate-800">End</label>
                      <Input
                        type="date"
                        value={form.end_date}
                        onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-semibold text-slate-800">Type</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-inner focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    >
                      <option value="holiday">Holiday</option>
                      <option value="break">School break</option>
                      <option value="closure">School closure</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="submit"
                      disabled={savingHoliday}
                      className="rounded-full bg-slate-900 text-white hover:bg-slate-800"
                    >
                      {savingHoliday ? "Saving..." : form.id ? "Update" : "Add break"}
                    </Button>
                    {form.id && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={resetHolidayForm}
                        className="rounded-full border-slate-200 text-slate-700 hover:bg-slate-100"
                      >
                        Cancel edit
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
