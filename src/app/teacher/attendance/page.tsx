"use client";

import React from "react";
import Navbar from "@/components/Navbar";
import ClassAttendanceBarChart from "@/components/teacher/ClassAttendanceBarChart";
import { cn } from "@/lib/utils";
import {
  createDefaultDailyRecord,
  calculateClassDailyStats,
  calculateStudentSummaries,
  getClassAnalyticsForRange,
} from "@/data/attendance";
import type { AttendanceRecord, AttendanceStatus, ClassAttendance, SchoolHoliday } from "@/types/attendance";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  Sparkles,
  Filter,
  Users,
  BarChart3,
  CheckCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { listAttendanceRecords, upsertAttendanceRecord } from "@/lib/attendanceApi";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";

const ANALYTICS_RANGE_OPTIONS = [
  { id: "today", label: "Today", days: 1 },
  { id: "week", label: "Week", days: 7 },
  { id: "month", label: "Month", days: 30 },
  { id: "year", label: "Year", days: 365 },
] as const;

type AnalyticsRange = (typeof ANALYTICS_RANGE_OPTIONS)[number]["id"];



const toLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const todayIso = () => toLocalDateKey(new Date());

// --- UI Components ---

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string; icon?: React.ElementType }[];
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div className="flex p-1 bg-slate-200/50 backdrop-blur-md rounded-full relative overflow-hidden">
      {options.map((option) => {
        const isActive = value === option.id;
        return (
          <button
            key={option.id}
            onClick={() => onChange(option.id)}
            className={cn(
              "relative flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition-colors z-10",
              isActive ? "text-slate-900" : "text-slate-500 hover:text-slate-700"
            )}
          >
            {isActive && (
              <motion.div
                layoutId="segmented-bg"
                className="absolute inset-0 bg-white rounded-full shadow-[0_2px_10px_-2px_rgba(0,0,0,0.1)]"
                transition={{ type: "spring", bounce: 0.2, duration: 0.3 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1 sm:gap-2">
              {option.icon && <option.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StatusToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: "present" | "absent";
  onChange: (val: "present" | "absent") => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative inline-flex h-9 items-center rounded-full bg-slate-100 p-1 ring-1 ring-slate-200/50">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("present")}
        className={cn(
          "relative z-10 flex h-full items-center rounded-full px-4 text-[13px] font-medium transition-all duration-300",
          value === "present" ? "text-emerald-700" : "text-slate-400 hover:text-slate-600",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <span className="relative z-10">Present</span>
        {value === "present" && (
          <motion.div
            layoutId="toggle-active"
            className="absolute inset-0 rounded-full bg-white shadow-[0_2px_8px_-2px_rgba(16,185,129,0.25)] ring-1 ring-emerald-100"
            transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
          />
        )}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("absent")}
        className={cn(
          "relative z-10 flex h-full items-center rounded-full px-4 text-[13px] font-medium transition-all duration-300",
          value === "absent" ? "text-rose-700" : "text-slate-400 hover:text-slate-600",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <span className="relative z-10">Absent</span>
        {value === "absent" && (
          <motion.div
            layoutId="toggle-active"
            className="absolute inset-0 rounded-full bg-white shadow-[0_2px_8px_-2px_rgba(244,63,94,0.25)] ring-1 ring-rose-100"
            transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
          />
        )}
      </button>
    </div>
  );
}

function CircularProgress({ percent, size = 120, strokeWidth = 8, color = "emerald" }: { percent: number; size?: number; strokeWidth?: number; color?: "emerald" | "amber" | "rose" }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percent / 100) * circumference;

  const colorClass =
    color === "emerald" ? "text-emerald-500" :
      color === "amber" ? "text-amber-500" :
        "text-rose-500";

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90 w-full h-full">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-slate-100"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn("transition-all duration-1000 ease-out", colorClass)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tracking-tight text-slate-900">{percent}%</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Present</span>
      </div>
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
  // State
  const [classes, setClasses] = React.useState<ClassAttendance[]>([]);
  const [selectedClassId, setSelectedClassId] = React.useState("");
  const [selectedDate, setSelectedDate] = React.useState(() => todayIso());
  const [activeTab, setActiveTab] = React.useState("rollcall");

  // Data State
  const [attendanceState, setAttendanceState] = React.useState<AttendanceRecord>({});
  const [holidays, setHolidays] = React.useState<SchoolHoliday[]>([]);

  // UI State
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [isDirty, setIsDirty] = React.useState(false);
  const [rollCallSearch, setRollCallSearch] = React.useState("");

  // Analytics State
  const [analyticsRange, setAnalyticsRange] = React.useState<AnalyticsRange>("week");
  const [searchTerm, setSearchTerm] = React.useState("");
  const [summaryClassFilter] = React.useState("all");

  const selectedClass = classes.find((c) => c.id === selectedClassId);

  // --- Derived State & Memorization ---

  const currentRangeMeta = React.useMemo(
    () => ANALYTICS_RANGE_OPTIONS.find((o) => o.id === analyticsRange) || ANALYTICS_RANGE_OPTIONS[0],
    [analyticsRange]
  );

  const analyticsDateRange = React.useMemo(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - (currentRangeMeta.days - 1));
    return {
      start: toLocalDateKey(start),
      end: toLocalDateKey(end),
    };
  }, [currentRangeMeta]);

  const attendanceLookbackStart = React.useMemo(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 60); // Optimize: fetch less initially
    return toLocalDateKey(start);
  }, []);

  // --- Data Fetching ---

  const fetchStudentRoster = React.useCallback(async () => {
    const allStudents: StudentRosterRow[] = [];
    let from = 0;
    const size = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("students")
        .select("id, name, class_id, parent_id")
        .neq("record_type", "prospect")
        .not("class_id", "is", null)
        .order("name")
        .range(from, from + size - 1);

      if (error) throw error;
      if (data) allStudents.push(...data);
      if (!data || data.length < size) break;
      from += size;
    }
    return allStudents;
  }, []);

  const initData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [classesRes, students, holidaysRes] = await Promise.all([
        supabase.from("classes").select("id, name").order("name"),
        fetchStudentRoster(),
        supabase.from("school_holidays").select("*").order("start_date")
      ]);

      if (classesRes.error) throw classesRes.error;
      if (holidaysRes.error) throw holidaysRes.error;

      // Process Classes
      const classMap = new Map<string, ClassAttendance>();
      classesRes.data?.forEach(c => {
        classMap.set(String(c.id), { id: String(c.id), name: c.name || "Unnamed", students: [], records: [] });
      });

      students.forEach(s => {
        if (!s.class_id) return;
        const cid = String(s.class_id);
        const cls = classMap.get(cid);
        if (cls) {
          cls.students.push({
            id: String(s.id),
            name: s.name || "Unknown",
            familyId: String(s.parent_id || s.id),
            classId: cid
          });
        }
      });

      const roster = Array.from(classMap.values())
        .map(c => ({ ...c, students: c.students.sort((a, b) => a.name.localeCompare(b.name)) }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setClasses(roster);
      setHolidays(holidaysRes.data || []);

      if (roster.length > 0) {
        setSelectedClassId(roster[0].id);
      }

      // Load Attendance History
      const historyRes = await listAttendanceRecords({
        classIds: roster.map(c => c.id),
        startDate: attendanceLookbackStart,
        endDate: todayIso()
      });

      if (!historyRes.error) {
        // Reconstruct State
        const newState: AttendanceRecord = {};

        // Group by Class -> Date
        const grouped = new Map<string, { classId: string; date: string; statuses: Record<string, AttendanceStatus>; submitted: boolean }>();

        historyRes.records.forEach(rec => {
          const key = `${rec.class_id}_${rec.attendance_date}`;
          if (!grouped.has(key)) {
            grouped.set(key, {
              classId: String(rec.class_id),
              date: String(rec.attendance_date),
              statuses: {},
              submitted: true
            });
          }
          const group = grouped.get(key)!;
          group.statuses[String(rec.student_id)] = rec.status || "present";
        });

        grouped.forEach(g => {
          newState[g.classId] = newState[g.classId] || {};
          newState[g.classId][g.date] = {
            statuses: g.statuses,
            submitted: true,
            note: ""
          };
        });

        setAttendanceState(newState);
      }

    } catch (err) {
      console.error("Data init failed", err);
    } finally {
      setLoading(false);
    }
  }, [fetchStudentRoster, attendanceLookbackStart]);

  React.useEffect(() => {
    initData();
  }, [initData]);

  // --- Handlers ---

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    if (!selectedClass) return;
    setIsDirty(true);
    setAttendanceState(prev => {
      const cls = prev[selectedClass.id] || {};
      const day = cls[selectedDate] || createDefaultDailyRecord(selectedClass.students);
      return {
        ...prev,
        [selectedClass.id]: {
          ...cls,
          [selectedDate]: {
            ...day,
            submitted: false, // Mark as dirty/unsubmitted logic
            statuses: { ...day.statuses, [studentId]: status }
          }
        }
      };
    });
  };

  const handleMarkAll = () => {
    if (!selectedClass) return;
    setIsDirty(true);
    setAttendanceState(prev => {
      const cls = prev[selectedClass.id] || {};
      const day = cls[selectedDate] || createDefaultDailyRecord(selectedClass.students);

      const newStatuses = { ...day.statuses };
      selectedClass.students.forEach(s => newStatuses[s.id] = "present");

      return {
        ...prev,
        [selectedClass.id]: {
          ...cls,
          [selectedDate]: { ...day, statuses: newStatuses, submitted: false }
        }
      };
    });
  };

  const handleSave = async () => {
    if (!selectedClass) return;
    setSaving(true);

    const clsState = attendanceState[selectedClass.id] || {};
    const dayState = clsState[selectedDate] || createDefaultDailyRecord(selectedClass.students);

    // Ensure all students have a status
    const finalStatuses: Record<string, AttendanceStatus> = {};
    selectedClass.students.forEach(s => {
      finalStatuses[s.id] = dayState.statuses?.[s.id] || "present";
    });

    const { error } = await upsertAttendanceRecord({
      classId: selectedClass.id,
      date: selectedDate,
      statuses: finalStatuses,
      recordedBy: null // Supabase auth context handles this usually
    });

    if (!error) {
      setAttendanceState(prev => ({
        ...prev,
        [selectedClass.id]: {
          ...clsState,
          [selectedDate]: { ...dayState, statuses: finalStatuses, submitted: true }
        }
      }));
      setIsDirty(false);
    }
    setSaving(false);
  };

  // --- derived views ---
  const currentStats = React.useMemo(() => {
    if (!selectedClass) return { present: 0, absent: 0, percent: 0, total: 0 };
    return calculateClassDailyStats(attendanceState, selectedClass.id, selectedClass.students, selectedDate);
  }, [attendanceState, selectedClass, selectedDate]);

  const activeHoliday = holidays.find(h => h.start_date <= selectedDate && selectedDate <= h.end_date);

  const studentSummaries = React.useMemo(() => {
    return calculateStudentSummaries(attendanceState, classes, { startDate: null });
  }, [attendanceState, classes]);

  const filteredSummaries = React.useMemo(() => {
    let res = studentSummaries;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      res = res.filter(s => s.name.toLowerCase().includes(q));
    }
    if (summaryClassFilter !== "all") {
      res = res.filter(s => s.classId === summaryClassFilter);
    }
    return res;
  }, [studentSummaries, searchTerm, summaryClassFilter]);

  const filteredRollCallStudents = React.useMemo(() => {
    if (!selectedClass) return [];
    if (!rollCallSearch) return selectedClass.students;
    const q = rollCallSearch.toLowerCase();
    return selectedClass.students.filter(s => s.name.toLowerCase().includes(q));
  }, [selectedClass, rollCallSearch]);

  // --- Render ---

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, ease: "linear", duration: 1 }}
        >
          <Loader2 className="w-8 h-8 text-slate-400" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F2F7] selection:bg-indigo-100 selection:text-indigo-900 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-[1100px] w-full mx-auto px-4 sm:px-6 py-8 flex flex-col min-h-0">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Attendance</h1>
            <p className="text-slate-500 mt-2 font-medium">Manage daily records and monitor student attendance.</p>
          </div>

          <div className="w-full md:w-auto">
            <SegmentedControl
              options={[
                { id: "rollcall", label: "Roll Call", icon: Users },
                { id: "analytics", label: "Analytics", icon: BarChart3 },
                { id: "student-summary", label: "Students", icon: Search },
              ]}
              value={activeTab}
              onChange={setActiveTab}
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "rollcall" && (
            <motion.div
              key="rollcall"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col-reverse lg:grid lg:grid-cols-[1fr_340px] gap-6 flex-1 min-h-0"
            >
              {/* Left Column: Controls & List */}
              <div className="flex flex-col gap-6 h-full min-h-0">

                {/* Control Bar */}
                <div className="bg-white/80 backdrop-blur-xl border border-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.04)] rounded-[24px] p-2 flex flex-col sm:flex-row items-stretch gap-2">
                  {/* Date Navigator */}
                  <div className="flex items-center justify-between bg-slate-50 rounded-2xl p-1 flex-1 relative group hover:bg-slate-100 transition-colors">
                    <button
                      onClick={() => {
                        const d = new Date(selectedDate);
                        d.setDate(d.getDate() - 1);
                        setSelectedDate(toLocalDateKey(d));
                      }}
                      className="p-3 text-slate-400 hover:text-slate-900 transition-colors"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>

                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Date</span>
                      <span className="text-sm font-semibold text-slate-900 relative">
                        {format(new Date(selectedDate), "EEE, d MMM yyyy")}
                        <input
                          type="date"
                          value={selectedDate}
                          onChange={e => setSelectedDate(e.target.value)}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                      </span>
                    </div>

                    <button
                      onClick={() => {
                        const d = new Date(selectedDate);
                        d.setDate(d.getDate() + 1);
                        setSelectedDate(toLocalDateKey(d));
                      }}
                      disabled={selectedDate >= todayIso()}
                      className="p-3 text-slate-400 hover:text-slate-900 disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Class Selector */}
                  <div className="relative flex-1 min-w-[200px]">
                    <div className="absolute inset-0 bg-slate-50 rounded-2xl pointer-events-none group-hover:bg-slate-100 transition-colors" />
                    <select
                      value={selectedClassId}
                      onChange={e => setSelectedClassId(e.target.value)}
                      className="relative w-full h-full bg-transparent border-none appearance-none px-4 text-center font-semibold text-slate-900 focus:ring-0 cursor-pointer"
                    >
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      <Filter className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>

                  {/* Mark All action */}
                  <button
                    onClick={handleMarkAll}
                    disabled={activeHoliday !== undefined}
                    className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-2xl hover:bg-indigo-700 active:scale-95 transition-all text-sm shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <CheckCheck className="w-5 h-5" />
                    Mark All Present
                  </button>
                </div>

                {/* Main List */}
                <div className="bg-white rounded-[32px] shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col border border-slate-100 max-h-[60vh] min-h-[300px]">
                  {/* List Header & Search */}
                  <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between shrink-0 bg-white z-10 shadow-sm gap-4">
                    <div className="flex-1">
                      {isDirty ? (
                        <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full text-xs font-semibold w-fit mb-2">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                          Unsaved Changes
                        </div>
                      ) : (
                        <div className="text-sm text-slate-400 mb-1 font-medium">{selectedClass?.students.length || 0} Students</div>
                      )}
                      <h2 className="text-xl font-bold text-slate-900">
                        {selectedClass?.name || "Select Class"}
                      </h2>
                    </div>

                    {/* Search Input */}
                    <div className="relative w-full max-w-[240px]">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-slate-400" />
                      </div>
                      <input
                        type="text"
                        value={rollCallSearch}
                        onChange={(e) => setRollCallSearch(e.target.value)}
                        className="block w-full pl-10 pr-3 py-2 border-none rounded-xl leading-5 bg-slate-50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 sm:text-sm transition-all"
                        placeholder="Search student..."
                      />
                    </div>
                  </div>

                  <div className="overflow-y-auto flex-1 divide-y divide-slate-50 relative scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                    {activeHoliday ? (
                      <div className="py-20 flex flex-col items-center justify-center text-center px-4">
                        <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
                          <Sparkles className="w-8 h-8" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900">{activeHoliday.title}</h3>
                        <p className="text-slate-500 max-w-sm mt-2">School holiday. No attendance needed.</p>
                      </div>
                    ) : !selectedClass ? (
                      <div className="py-20 text-center text-slate-400">Please select a class</div>
                    ) : (
                      filteredRollCallStudents.map((student, idx) => {
                        const currentStatus = attendanceState[selectedClass.id]?.[selectedDate]?.statuses?.[student.id] ?? "present";
                        return (
                          <motion.div
                            key={student.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.02 }}
                            className={cn(
                              "group flex items-center justify-between p-4 px-6 sm:px-8 hover:bg-slate-50/80 transition-colors",
                              currentStatus === "absent" && "bg-rose-50/30 hover:bg-rose-50/50"
                            )}
                          >
                            <div className="flex items-center gap-4">
                              <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-sm transition-colors",
                                currentStatus === "absent" ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-600"
                              )}>
                                {student.name?.substring(0, 2).toUpperCase()}
                              </div>
                              <div className="font-semibold text-slate-900 text-[15px]">{student.name}</div>
                            </div>

                            <div onClick={e => e.stopPropagation()}>
                              <StatusToggle
                                value={currentStatus}
                                onChange={(val) => handleStatusChange(student.id, val)}
                              />
                            </div>
                          </motion.div>
                        );
                      })
                    )}
                    {selectedClass && filteredRollCallStudents.length === 0 && (
                      <div className="py-20 text-center text-slate-400">No students found</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Sidebar */}
              <div className="space-y-6">
                {/* Stats Card */}
                <div className="bg-white rounded-[32px] shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] p-6 lg:p-8 flex flex-row lg:flex-col items-center justify-between lg:justify-center gap-6">
                  <div className="flex flex-col items-center">
                    <h3 className="hidden lg:block text-sm font-bold uppercase tracking-widest text-slate-400 mb-8">Daily Attendance</h3>
                    <div className="scale-75 lg:scale-100 origin-left lg:origin-center">
                      <CircularProgress
                        percent={currentStats.percent}
                        color={currentStats.percent >= 90 ? 'emerald' : currentStats.percent >= 70 ? 'amber' : 'rose'}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 lg:gap-4 w-full flex-1 lg:flex-none">
                    <div className="bg-slate-50 rounded-2xl p-3 lg:p-4 text-center">
                      <div className="text-2xl font-bold text-slate-900">{currentStats.present}</div>
                      <div className="text-[10px] font-bold uppercase text-slate-400 mt-1">Present</div>
                    </div>
                    <div className="bg-rose-50/50 rounded-2xl p-3 lg:p-4 text-center">
                      <div className="text-2xl font-bold text-rose-600">{currentStats.absent}</div>
                      <div className="text-[10px] font-bold uppercase text-rose-400/80 mt-1">Absent</div>
                    </div>
                  </div>
                </div>
              </div>

            </motion.div>
          )}

          {activeTab === "analytics" && (
            <motion.div
              key="analytics"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
            >
              <div className="bg-white rounded-[32px] shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] p-8">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-xl font-bold text-slate-900">Attendance Trends</h2>
                  <div className="flex bg-slate-100 p-1 rounded-full">
                    {ANALYTICS_RANGE_OPTIONS.map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setAnalyticsRange(opt.id)}
                        className={cn(
                          "px-4 py-1.5 rounded-full text-xs font-semibold transition-all",
                          analyticsRange === opt.id ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-800"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-[400px]">
                  <ClassAttendanceBarChart
                    data={getClassAnalyticsForRange(attendanceState, classes, analyticsDateRange.start, analyticsDateRange.end)}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "student-summary" && (
            <motion.div
              key="summary"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
            >
              <div className="bg-white rounded-[32px] shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] overflow-hidden">
                <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-900">Student Directory</h2>
                  <div className="flex gap-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        placeholder="Search by name..."
                        className="pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-slate-200 focus:outline-none w-[200px]"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50/50 text-slate-500 font-semibold border-b border-slate-100">
                      <tr>
                        <th className="px-8 py-4">Student</th>
                        <th className="px-8 py-4">Class</th>
                        <th className="px-8 py-4 text-center">Rate</th>
                        <th className="px-8 py-4 text-center">Present</th>
                        <th className="px-8 py-4 text-center">Absent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredSummaries.map(s => (
                        <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-8 py-4 font-bold text-slate-900">{s.name}</td>
                          <td className="px-8 py-4 text-slate-500">{s.className}</td>
                          <td className="px-8 py-4 text-center">
                            <span className={cn(
                              "px-3 py-1 rounded-full text-xs font-bold",
                              s.attendancePercent >= 90 ? "bg-emerald-50 text-emerald-600" :
                                s.attendancePercent >= 70 ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"
                            )}>
                              {s.attendancePercent}%
                            </span>
                          </td>
                          <td className="px-8 py-4 text-center font-medium text-emerald-600">{s.presentDays}</td>
                          <td className="px-8 py-4 text-center font-medium text-rose-600">{s.absentDays}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>

        {/* Floating Save Bar */}
        <AnimatePresence>
          {isDirty && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 backdrop-blur-md text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-6"
            >
              <span className="text-sm font-medium pl-2">You have unsaved changes</span>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-white text-slate-900 px-6 py-2 rounded-full text-sm font-bold hover:bg-slate-100 active:scale-95 transition-all flex items-center gap-2"
              >
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                {saving ? "Saving..." : "Save Now"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
