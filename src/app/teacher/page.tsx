"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import React from "react";
import { QuranProgressBar, ChartTabs } from "@/components/ReportCharts";
import Navbar from "@/components/Navbar";
import { Card } from "@/components/ui/Card";
import QuickReportModal from "@/components/teacher/QuickReportModal";
import EditReportModal from "./EditReportModal";
import FullRecordsModal from "@/components/teacher/FullRecordsModal";
import JuzTestProgressLineChart from "@/components/teacher/JuzTestProgressLineChart";
import JuzTestHistoryModalViewOnly from "@/components/teacher/JuzTestHistoryModalViewOnly";
import ScheduleTestModal from "@/components/teacher/ScheduleTestModal";
import { notificationService } from "@/lib/notificationService";
import {
  StudentProgressData,
  calculateDaysSinceLastRead,
  formatRelativeDate,
  formatAbsoluteDate,
  getInactivityRowClass,
  getActivityStatus,
  filterStudentsBySearch,
  getSummaryStats,
  SummaryStats
} from "@/lib/reportUtils";
import { formatMurajaahDisplay } from "@/lib/quranMapping";
import type { Student, Report, ViewMode } from "@/types/teacher";

const SURAHS = [
  "Al-Fatihah", "Al-Baqarah", "Aali Imran", "An-Nisa'", "Al-Ma'idah", "Al-An'am", "Al-A'raf", "Al-Anfal", "At-Tawbah", "Yunus", "Hud", "Yusuf", "Ar-Ra'd", "Ibrahim", "Al-Hijr", "An-Nahl", "Al-Isra'", "Al-Kahf", "Maryam", "Ta-Ha", "Al-Anbiya'", "Al-Hajj", "Al-Mu'minun", "An-Nur", "Al-Furqan", "Ash-Shu'ara'", "An-Naml", "Al-Qasas", "Al-Ankabut", "Ar-Rum", "Luqman", "As-Sajda", "Al-Ahzab", "Saba'", "Fatir", "Ya-Sin", "As-Saffat", "Sad", "Az-Zumar", "Ghafir", "Fussilat", "Ash-Shura", "Az-Zukhruf", "Ad-Dukhan", "Al-Jathiyah", "Al-Ahqaf", "Muhammad", "Al-Fath", "Al-Hujurat", "Qaf", "Adh-Dhariyat", "At-Tur", "An-Najm", "Al-Qamar", "Ar-Rahman", "Al-Waqi'ah", "Al-Hadid", "Al-Mujadila", "Al-Hashr", "Al-Mumtahanah", "As-Saff", "Al-Jumu'ah", "Al-Munafiqun", "At-Taghabun", "At-Talaq", "At-Tahrim", "Al-Mulk", "Al-Qalam", "Al-Haqqah", "Al-Ma'arij", "Nuh", "Al-Jinn", "Al-Muzzammil", "Al-Muddathir", "Al-Qiyamah", "Al-Insan", "Al-Mursalat", "An-Naba'", "An-Nazi'at", "Abasa", "At-Takwir", "Al-Infitar", "Al-Mutaffifin", "Al-Inshiqaq", "Al-Buruj", "At-Tariq", "Al-A'la", "Al-Ghashiyah", "Al-Fajr", "Al-Balad", "Ash-Shams", "Al-Layl", "Ad-Duhaa", "Ash-Sharh", "At-Tin", "Al-Alaq", "Al-Qadr", "Al-Bayyinah", "Az-Zalzalah", "Al-Adiyat", "Al-Qari'ah", "At-Takathur", "Al-Asr", "Al-Humazah", "Al-Fil", "Quraysh", "Al-Ma'un", "Al-Kawthar", "Al-Kafirun", "An-Nasr", "Al-Masad", "Al-Ikhlas", "Al-Falaq", "An-Nas"
];

const REPORT_TYPES = ["Tasmi", "Murajaah"];
const GRADES = ["mumtaz", "jayyid jiddan", "jayyid"];

type ActiveSession = {
  scheduled_date: string;
  slot_number: number | null;
  status: string | null;
};

type ActiveSessionMap = Record<string, ActiveSession>;

type SmartSuggestion = {
  surah: string;
  juzuk: number;
  ayatFrom: number;
  ayatTo: number;
  pageFrom: number | null;
  pageTo: number | null | undefined;
} | undefined;

type ReportRow = Report & { students?: { name?: string | null } | null };

const isActiveSessionMap = (value: unknown): value is ActiveSessionMap => {
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).every((session) => {
    if (!session || typeof session !== 'object') return false;
    const record = session as { scheduled_date?: unknown; slot_number?: unknown; status?: unknown };
    return (
      typeof record.scheduled_date === 'string' &&
      (record.slot_number === null || typeof record.slot_number === 'number') &&
      (record.status === null || typeof record.status === 'string')
    );
  });
};

const mapReportsWithStudentName = (rows: ReportRow[]): Report[] =>
  rows.map((row) => ({
    ...row,
    student_name: row.students?.name || "",
  }));

function FetchActiveSchedules({ students, onData }: { students: string[]; onData: (map: ActiveSessionMap) => void }) {
  const studentParams = useMemo(() => {
    if (!Array.isArray(students) || students.length === 0) {
      return null;
    }
    return new URLSearchParams({ student_ids: students.join(',') }).toString();
  }, [students]);

  const fetchSchedules = useCallback(async () => {
    if (!studentParams) {
      onData({});
      return;
    }

    const res = await fetch(`/api/juz-test-schedule?${studentParams}`);
    const raw = await res.json();
    if (res.ok && raw && isActiveSessionMap(raw.activeByStudent)) {
      onData(raw.activeByStudent);
    } else {
      onData({});
    }
  }, [studentParams, onData]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);
  return null;
}

export default function TeacherPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [teacherName, setTeacherName] = useState<string>("");
  
  // Monitor state
  const [monitorStudents, setMonitorStudents] = useState<StudentProgressData[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('tasmik');
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<'activity' | 'name'>('activity');
  const [monitorLoading, setMonitorLoading] = useState(false);

  // Quick report modal
  const [showQuickModal, setShowQuickModal] = useState(false);
  const [quickModalData, setQuickModalData] = useState<{
    student: Student;
    reportType: "Tasmi" | "Murajaah";
    suggestions?: SmartSuggestion;
  } | null>(null);

  // Edit modal
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Full records modal
  const [showFullRecordsModal, setShowFullRecordsModal] = useState(false);
  const [fullRecordsStudent, setFullRecordsStudent] = useState<Student | null>(null);

  // Juz test history modal
const [showJuzTestHistoryModal, setShowJuzTestHistoryModal] = useState(false);
  // Schedule modal
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleStudent, setScheduleStudent] = useState<Student | null>(null);
  // Active test sessions (by student)
  const [activeSessionsByStudent, setActiveSessionsByStudent] = useState<ActiveSessionMap>({});

  // Refetch helper to immediately reflect schedule/cancel actions
  const refetchActiveSchedules = useCallback(async (ids: string[]) => {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        setActiveSessionsByStudent({});
        return;
      }
      const params = new URLSearchParams({ student_ids: ids.join(',') });
      const res = await fetch(`/api/juz-test-schedule?${params.toString()}`);
      const raw = await res.json();
      if (res.ok && raw && isActiveSessionMap(raw.activeByStudent)) {
        setActiveSessionsByStudent(raw.activeByStudent);
      } else {
        setActiveSessionsByStudent({});
      }
    } catch (error) {
      console.error('Failed to refresh active schedules', error);
      setActiveSessionsByStudent({});
    }
  }, []);
  const [juzTestHistoryStudent, setJuzTestHistoryStudent] = useState<Student | null>(null);

  // Auth check and fetch teacher name
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) {
          console.error('Authentication error:', userError);
          window.location.href = '/login';
          return;
        }
        
        if (userData.user) {
          setUserId(userData.user.id);
          
          // Fetch teacher name from users table
          const { data: teacherData, error: teacherError } = await supabase
            .from('users')
            .select('name')
            .eq('id', userData.user.id)
            .single();
            
          if (teacherError) {
            console.error('Error fetching teacher name:', teacherError);
          } else {
            setTeacherName(teacherData?.name || '');
          }
        }
      } catch (error) {
        console.error('Failed to get user:', error);
        window.location.href = '/login';
      }
    };
    
    fetchUserData();
  }, []);

  // Fetch students
  useEffect(() => {
    if (!userId) return;
    async function fetchStudents() {
      const { data, error } = await supabase
        .from("students")
        .select("id, name, memorization_completed, memorization_completed_date")
        .eq("assigned_teacher_id", userId);
      if (!error && data) setStudents(data);
    }
    fetchStudents();
  }, [userId]);

  // Fetch reports
  useEffect(() => {
    if (!userId) return;
    async function fetchReports() {
      const { data, error } = await supabase
        .from("reports")
        .select("*, students(name)")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (!error && data) {
        setReports(mapReportsWithStudentName(data as ReportRow[]));
      }
    }
    fetchReports();
  }, [userId]);

  // Smart suggestions for next progression
  const getSmartSuggestions = useCallback((studentId: string, reportType: "Tasmi" | "Murajaah"): SmartSuggestion => {
    const studentReports = reports.filter(r => r.student_id === studentId);
    
    if (reportType === "Tasmi") {
      // Find latest Tasmi report
      const latestTasmi = studentReports
        .filter(r => r.type === "Tasmi")
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      
      if (latestTasmi) {
        // Suggest next ayat range starting from where they left off
        const nextAyatFrom = latestTasmi.ayat_to + 1;
        const nextPageFrom = latestTasmi.page_to ? latestTasmi.page_to + 1 : null;
        
        // Continue in same surah with reasonable progression (10-20 ayats)
        const progressionSize = Math.min(20, Math.max(10, latestTasmi.ayat_to - latestTasmi.ayat_from + 1));
        
        return {
          surah: latestTasmi.surah,
          juzuk: latestTasmi.juzuk || 1,
          ayatFrom: nextAyatFrom,
          ayatTo: nextAyatFrom + progressionSize - 1,
          pageFrom: nextPageFrom,
          pageTo: nextPageFrom ? nextPageFrom + 1 : null
        };
      }
      
      // Default for new students
      return {
        surah: "Al-Fatihah",
        juzuk: 1,
        ayatFrom: 1,
        ayatTo: 7,
        pageFrom: null,
        pageTo: null
      };
    } else {
      // Murajaah - suggest continuing from latest murajaah or tasmi
      const latestMurajaah = studentReports
        .filter(r => r.type === "Murajaah" || r.type === "Old Murajaah" || r.type === "New Murajaah")
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      
      if (latestMurajaah) {
        // Continue from latest murajaah position
        const nextAyatFrom = latestMurajaah.ayat_to + 1;
        const nextPageFrom = latestMurajaah.page_to ? latestMurajaah.page_to + 1 : null;
        const progressionSize = Math.min(20, Math.max(10, latestMurajaah.ayat_to - latestMurajaah.ayat_from + 1));
        
        return {
          surah: latestMurajaah.surah,
          juzuk: latestMurajaah.juzuk || 1,
          ayatFrom: nextAyatFrom,
          ayatTo: nextAyatFrom + progressionSize - 1,
          pageFrom: nextPageFrom,
          pageTo: nextPageFrom ? nextPageFrom + 1 : null
        };
      }
      
      // If no murajaah, use latest Tasmi for review
      const latestTasmi = studentReports
        .filter(r => r.type === "Tasmi")
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      
      if (latestTasmi) {
        // Start murajaah from beginning of what they've memorized
        return {
          surah: latestTasmi.surah,
          juzuk: latestTasmi.juzuk || 1,
          ayatFrom: 1,
          ayatTo: Math.min(20, latestTasmi.ayat_to),
          pageFrom: 1,
          pageTo: latestTasmi.page_to ? Math.min(2, latestTasmi.page_to) : null
        };
      }
    }
    
    return undefined;
  }, [reports]);

  // Debounce search term
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // Fetch monitor data
  const fetchMonitorData = useCallback(async () => {
    if (!userId) return;
    setMonitorLoading(true);

    try {
      const { data: studentsData, error: studentsError } = await supabase
        .from("students")
        .select(`
          id,
          name,
          assigned_teacher_id,
          class_id,
          memorization_completed,
          memorization_completed_date,
          users!assigned_teacher_id (name),
          classes (name)
        `)
        .eq("assigned_teacher_id", userId);

      if (studentsError || !studentsData) {
        setMonitorStudents([]);
        return;
      }

      // Optimize: Batch fetch reports for all students instead of individual queries
      const allStudentIds = studentsData.map(s => s.id);
      
      // Fetch all reports for these students in one query
      // RLS policies will ensure teacher only sees reports for assigned students
      let reportsQuery = supabase
        .from("reports")
        .select("*")
        .in("student_id", allStudentIds);
      
      if (viewMode === 'tasmik') {
        reportsQuery = reportsQuery.eq("type", "Tasmi");
      } else if (viewMode === 'murajaah') {
        reportsQuery = reportsQuery.in("type", ["Murajaah", "Old Murajaah", "New Murajaah"]);
      }
      
      const { data: allReports } = await reportsQuery
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      
      // Group reports by student
      const reportRows = (allReports ?? []) as Report[];
      const reportsByStudent = reportRows.reduce<Record<string, Report[]>>((acc, report) => {
        if (!acc[report.student_id]) acc[report.student_id] = [];
        acc[report.student_id].push(report);
        return acc;
      }, {});

      const studentProgressPromises = studentsData.map(async (student) => {
        if (viewMode === 'juz_tests') {
          // For Juz Tests view, get memorization progress and test progress
          const [memorizationResult, latestByDateResult, highestTestedResult] = await Promise.all([
            // Get highest memorized juz from Tasmi reports
            supabase
              .from("reports")
              .select("juzuk")
              .eq("student_id", student.id)
              .eq("type", "Tasmi")
              .not("juzuk", "is", null)
              .order("juzuk", { ascending: false })
              .limit(1),
            
            // Latest test by date (for display in table)
            supabase
              .from("juz_tests")
              .select("juz_number, test_date, passed, total_percentage, examiner_name, test_hizb")
              .eq("student_id", student.id)
              .order("test_date", { ascending: false })
              .order("id", { ascending: false })
              .limit(1)
              .then(result => {
                if (result.error?.message?.includes('relation "public.juz_tests" does not exist')) {
                  return { data: [], error: null };
                }
                return result;
              }),

            // Highest tested juz by number (for gap calculation)
            supabase
              .from("juz_tests")
              .select("juz_number")
              .eq("student_id", student.id)
              .order("juz_number", { ascending: false })
              .limit(1)
              .then(result => {
                if (result.error?.message?.includes('relation "public.juz_tests" does not exist')) {
                  return { data: [], error: null };
                }
                return result;
              })
          ]);

          const highestMemorizedJuz = memorizationResult.data?.[0]?.juzuk || 0;
          const latestTest = latestByDateResult.data?.[0] || null;
          const highestTestedJuz = highestTestedResult.data?.[0]?.juz_number || 0;
          
          const gap = highestMemorizedJuz - highestTestedJuz;

          return {
            id: student.id,
            name: student.name,
            teacher_name: (student.users as { name?: string } | null)?.name || null,
            class_name: (student.classes as { name?: string } | null)?.name || null,
            latest_reading: `Memorized: Juz ${highestMemorizedJuz}`,
            last_read_date: latestTest?.test_date || null,
            days_since_last_read: gap,
            report_type: 'juz_test',
            memorization_completed: student.memorization_completed,
            memorization_completed_date: student.memorization_completed_date,
            highest_memorized_juz: highestMemorizedJuz,
            highest_passed_juz: highestTestedJuz,
            juz_test_gap: gap,
            latest_test_result: latestTest
          } as StudentProgressData & {
            highest_memorized_juz?: number;
            highest_passed_juz?: number;
            juz_test_gap?: number;
            latest_test_result?: {
              juz_number: number;
              test_date: string;
              passed: boolean;
              total_percentage: number;
              test_hizb?: boolean;
            };
          };
        } else {
          // Regular tasmik/murajaah logic - use pre-fetched reports
          const studentReports = reportsByStudent[student.id] || [];
          const latestReport = studentReports[0]; // Already sorted by date desc
          const daysSinceLastRead = latestReport 
            ? calculateDaysSinceLastRead(latestReport.date)
            : 999;

          let latestReading = null;
          if (latestReport) {
            if (viewMode === 'tasmik') {
              latestReading = `${latestReport.surah} (${latestReport.ayat_from}-${latestReport.ayat_to})`;
            } else {
              // Use formatMurajaahDisplay for Murajaah reports
              const pageFrom = latestReport.page_from ?? latestReport.page_to ?? null;
              const pageTo = latestReport.page_to ?? latestReport.page_from ?? undefined;
              const fallbackReading = latestReport.juzuk
                ? `Juz ${latestReport.juzuk}`
                : latestReport.surah;
              if (pageFrom !== null) {
                const formatted = formatMurajaahDisplay(pageFrom, pageTo);
                latestReading = formatted ?? fallbackReading;
              } else {
                latestReading = fallbackReading;
              }
            }
          }

          return {
            id: student.id,
            name: student.name,
            teacher_name: (student.users as { name?: string } | null)?.name || null,
            class_name: (student.classes as { name?: string } | null)?.name || null,
            latest_reading: latestReading,
            last_read_date: latestReport?.date || null,
            days_since_last_read: daysSinceLastRead,
            report_type: latestReport?.type || null,
            memorization_completed: student.memorization_completed,
            memorization_completed_date: student.memorization_completed_date
          } as StudentProgressData;
        }
      });

      const progressData = await Promise.all(studentProgressPromises);
      setMonitorStudents(progressData);
    } catch (err) {
      console.error("Failed to fetch monitor data:", err);
    } finally {
      setMonitorLoading(false);
    }
  }, [userId, viewMode]);

  useEffect(() => {
    if (userId) {
      fetchMonitorData();
    }
  }, [fetchMonitorData, userId]);

  // Filtered and sorted students (optimized with debounced search)
  const filteredMonitorStudents = useMemo(() => {
    let filtered = filterStudentsBySearch(monitorStudents, debouncedSearchTerm);
    
    if (viewMode === 'juz_tests') {
      // Sort by gap first (larger gaps first for priority), then by highest memorized juz
      filtered = [...filtered].sort((a, b) => {
        const extA = a as StudentProgressData & { highest_memorized_juz?: number; juz_test_gap?: number };
        const extB = b as StudentProgressData & { highest_memorized_juz?: number; juz_test_gap?: number };
        
        // First by gap (descending - larger gaps first for teacher priority)
        const gapDiff = (extB.juz_test_gap || 0) - (extA.juz_test_gap || 0);
        if (gapDiff !== 0) return gapDiff;
        
        // Then by highest memorized juz (descending - more advanced students first)
        return (extB.highest_memorized_juz || 0) - (extA.highest_memorized_juz || 0);
      });
    } else {
      // For tasmik/murajaah: sort by days since last read (descending - longest gaps first)
      filtered = [...filtered].sort((a, b) => {
        if (sortBy === 'activity') {
          return b.days_since_last_read - a.days_since_last_read;
        } else if (sortBy === 'name') {
          return a.name.localeCompare(b.name);
        }
        return 0;
      });
    }
    
    return filtered;
  }, [monitorStudents, debouncedSearchTerm, sortBy, viewMode]);

  const summaryStats: SummaryStats = useMemo(() => {
    if (viewMode === 'juz_tests') {
      // For Juz Tests, show gap-based stats instead of activity-based
      const studentsWithGaps = filteredMonitorStudents.filter(s => {
        const extS = s as StudentProgressData & { juz_test_gap?: number };
        return (extS.juz_test_gap || 0) > 0;
      });
      const studentsWithLargeGaps = filteredMonitorStudents.filter(s => {
        const extS = s as StudentProgressData & { juz_test_gap?: number };
        return (extS.juz_test_gap || 0) >= 3;
      });
      
      return {
        totalStudents: filteredMonitorStudents.length,
        inactive7Days: studentsWithGaps.length, // Students with any gap
        inactive14Days: studentsWithLargeGaps.length // Students with large gaps (3+)
      };
    }
    return getSummaryStats(filteredMonitorStudents);
  }, [filteredMonitorStudents, viewMode]);

  // Handle quick report (memoized to prevent re-renders)
  const handleQuickReport = useCallback((student: Student, reportType: "Tasmi" | "Murajaah") => {
    const suggestions = getSmartSuggestions(student.id, reportType);
    setQuickModalData({ student, reportType, suggestions });
    setShowQuickModal(true);
  }, [getSmartSuggestions]);

  // Handle edit report (memoized)
  const handleEditReport = useCallback((report: Report) => {
    setEditingReport(report);
    setShowEditModal(true);
  }, []);

  // Handle full records view (memoized)
  const handleFullRecords = useCallback((student: Student) => {
    setFullRecordsStudent(student);
    setShowFullRecordsModal(true);
  }, []);

  // Edit report function
  const editReport = async (updated: Report) => {
    if (!updated.id) return;
    await supabase.from("reports").update({
      type: updated.type,
      surah: updated.surah,
      juzuk: updated.juzuk,
      ayat_from: updated.ayat_from,
      ayat_to: updated.ayat_to,
      page_from: updated.page_from,
      page_to: updated.page_to,
      grade: updated.grade,
      date: updated.date,
    }).eq("id", updated.id);
    setShowEditModal(false);
    setEditingReport(null);
    
    // Refresh data
    if (userId) {
      const { data, error } = await supabase
        .from("reports")
        .select("*, students(name)")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (!error && data) {
        setReports(mapReportsWithStudentName(data as ReportRow[]));
      }
      fetchMonitorData();
    }
  };

  const refreshData = useCallback(() => {
    if (userId) {
      // Refresh reports
      supabase
        .from("reports")
        .select("*, students(name)")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) {
            setReports(mapReportsWithStudentName(data as ReportRow[]));
          }
        });
      
      // Refresh monitor data
      fetchMonitorData();
    }
  }, [userId, fetchMonitorData]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9]">
      <Navbar />
      <div className="relative p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <header className="mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Student Progress Monitor</h1>
              <p className="text-gray-600">Monitor and create reports for your students&apos; Quran memorization progress</p>
            </div>
          </header>

          {/* Summary Cards - Simplified */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold text-gray-900">{summaryStats.totalStudents}</div>
                  <div className="text-gray-600 font-medium">Total Students</div>
                </div>
                <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                  </svg>
                </div>
              </div>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold text-amber-600">{summaryStats.inactive7Days}</div>
                  <div className="text-gray-600 font-medium">Need Attention</div>
                </div>
                <div className="h-12 w-12 bg-amber-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.664-.833-2.464 0L4.34 16.5c-.77.833.192 2.5 1.732 2.5z"/>
                  </svg>
                </div>
              </div>
            </Card>
          </div>

          {/* Charts Section */}
          {viewMode !== 'juz_tests' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Student Progress Overview</h3>
                {filteredMonitorStudents.length > 0 && (
                  (() => {
                    const filterReportsFor = (ids: string[]) => reports.filter(r => {
                      const inSelection = ids.includes(r.student_id);
                      if (!inSelection) return false;
                      if (viewMode === 'tasmik') {
                        return r.type === 'Tasmi';
                      } else if (viewMode === 'murajaah') {
                        return r.type === 'Tasmi' || ['Murajaah', 'Old Murajaah', 'New Murajaah'].includes(r.type);
                      }
                      return true;
                    });
                    if (selectedStudentIds.length === 1) {
                      return (
                        <QuranProgressBar
                          reports={filterReportsFor(selectedStudentIds)}
                          viewMode={viewMode}
                        />
                      );
                    }
                    const ids = selectedStudentIds.length > 0
                      ? selectedStudentIds
                      : filteredMonitorStudents.map(s => s.id);
                    return (
                      <QuranProgressBar
                        reports={filterReportsFor(ids)}
                        viewMode={viewMode}
                      />
                    );
                  })()
                )}
              </Card>
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Class Analytics</h3>
                <ChartTabs 
                  selectedStudentId={selectedStudentIds.length === 1 ? selectedStudentIds[0] : null}
                  studentNamesMap={Object.fromEntries(filteredMonitorStudents.map(s => [s.id, s.name]))}
                  groupByStudentOverride={selectedStudentIds.length !== 1}
                  reports={reports.filter(r => {
                    const selection = selectedStudentIds.length > 0 ? selectedStudentIds : filteredMonitorStudents.map(s => s.id);
                    const isRelevantStudent = selection.includes(r.student_id);
                    if (!isRelevantStudent) return false;
                    if (viewMode === 'tasmik') {
                      return r.type === 'Tasmi';
                    } else if (viewMode === 'murajaah') {
                      return ['Murajaah', 'Old Murajaah', 'New Murajaah'].includes(r.type);
                    }
                    return true;
                  })} 
                />
              </Card>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 mb-6">
              <JuzTestProgressLineChart 
                className="col-span-1" 
                studentId={(selectedStudentIds.length === 1 ? selectedStudentIds[0] : null) || (filteredMonitorStudents.length === 1 ? filteredMonitorStudents[0].id : undefined)}
              />
            </div>
          )}

          {/* Main Content Card */}
          <Card className="p-4">
            {/* View Toggle */}
            <div className="flex items-center justify-center mb-6">
              <div className="bg-gray-100 rounded-full p-1">
                  <div className="flex">
                  <button
                    onClick={() => setViewMode('tasmik')}
                    className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                      viewMode === 'tasmik' 
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    Tasmik
                  </button>
                  <button
                    onClick={() => setViewMode('murajaah')}
                    className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                      viewMode === 'murajaah'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    Murajaah
                  </button>
                  <button
                    onClick={() => setViewMode('juz_tests')}
                    className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                      viewMode === 'juz_tests'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    Juz Tests
                  </button>
                </div>
              </div>
            </div>


            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {viewMode !== 'juz_tests' && (
                <div>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'activity' | 'name')}
                    className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
                  >
                    <option value="activity">Sort by Activity</option>
                    <option value="name">Sort by Name</option>
                  </select>
                </div>
              )}
              <div className={viewMode === 'juz_tests' ? 'md:col-span-3' : 'md:col-span-2'}>
                <input
                  type="text"
                  placeholder="Search students..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
                />
              </div>
            </div>

            {/* Loading */}
            {monitorLoading && (
              <div className="animate-pulse space-y-4">
                <div className="h-4 bg-gray-200 rounded w-1/3 mx-auto"></div>
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex space-x-4 p-4 border border-gray-200 rounded-lg">
                      <div className="h-10 bg-gray-200 rounded w-32"></div>
                      <div className="h-10 bg-gray-200 rounded flex-1"></div>
                      <div className="h-10 bg-gray-200 rounded w-24"></div>
                      <div className="h-10 bg-gray-200 rounded w-16"></div>
                      <div className="h-10 bg-gray-200 rounded w-24"></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fetch active schedules in juz_tests view */}
            {!monitorLoading && viewMode === 'juz_tests' && (
              <FetchActiveSchedules
                students={filteredMonitorStudents.map(s => s.id)}
                onData={(map) => setActiveSessionsByStudent(map)}
              />
            )}

            {/* Student Progress Table */}
            {!monitorLoading && (
              <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      {viewMode === 'juz_tests' ? (
                        <>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Progress</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Latest Test</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Gap</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </>
                      ) : (
                        <>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Latest Reading</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Last Read</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Days</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredMonitorStudents.map((student) => {
                      const extendedStudent = student as StudentProgressData & {
                        highest_memorized_juz?: number;
                        highest_passed_juz?: number;
                        juz_test_gap?: number;
                        latest_test_result?: {
                          juz_number: number;
                          test_date: string;
                          passed: boolean;
                          total_percentage: number;
                          examiner_name?: string;
                          test_hizb?: boolean;
                        };
                      };

                      const rowClass = viewMode === 'juz_tests' 
                        ? (extendedStudent.juz_test_gap && extendedStudent.juz_test_gap > 0 
                            ? extendedStudent.juz_test_gap >= 3 
                              ? 'bg-red-50/80' 
                              : extendedStudent.juz_test_gap >= 1 
                                ? 'bg-yellow-50/80' 
                                : ''
                            : '')
                        : getInactivityRowClass(student.days_since_last_read, student.memorization_completed);
                      
                      const activityStatus = getActivityStatus(student.days_since_last_read, student.memorization_completed);
                      const studentData = students.find(s => s.id === student.id);
                      
                      return (
                        <tr key={student.id} className={`${rowClass}`}>
                          <td className="px-4 py-3 font-medium text-gray-900">
                            <div className="flex items-start gap-2">
                              {selectedStudentIds.length > 0 && (
                                <input
                                  type="checkbox"
                                  checked={selectedStudentIds.includes(student.id)}
                                  onChange={() => {
                                    setSelectedStudentIds(prev => prev.includes(student.id)
                                      ? prev.filter(id => id !== student.id)
                                      : [...prev, student.id]
                                    );
                                  }}
                                  className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded"
                                  aria-label={`Select ${student.name}`}
                                />
                              )}
                              <div>
                                <button
                                  onClick={() => {
                                    setSelectedStudentIds(prev => prev.includes(student.id)
                                      ? prev.filter(id => id !== student.id)
                                      : [...prev, student.id]
                                    );
                                  }}
                                  className={`font-semibold underline-offset-2 ${selectedStudentIds.includes(student.id) ? 'text-blue-700 underline' : 'text-blue-600 hover:underline'}`}
                                  title={selectedStudentIds.includes(student.id) ? 'Selected for charts' : 'Select for charts'}
                                >
                                  {student.name}
                                </button>
                                {student.class_name && (
                                  <div className="text-xs text-gray-600">{student.class_name}</div>
                                )}
                              </div>
                            </div>
                          </td>
                              
                          {viewMode === 'juz_tests' ? (
                            <>
                              <td className="px-4 py-3 text-gray-600">
                                <div className="text-sm font-medium">
                                  {(() => {
                                    // Show Hizb if the latest passed test was a Hizb test
                                    const latestTest = extendedStudent.latest_test_result;
                                    if (latestTest && latestTest.passed && latestTest.test_hizb) {
                                      const hizbNumber = (latestTest.juz_number - 1) * 2 + 1;
                                      return `Hizb ${hizbNumber}`;
                                    }
                                    // Otherwise show Juz from memorization
                                    return `Juz ${extendedStudent.highest_memorized_juz || 0}`;
                                  })()}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {(() => {
                                    const latestTest = extendedStudent.latest_test_result;
                                    if (latestTest && latestTest.passed && latestTest.test_hizb) {
                                      return 'Passed Hizb Test';
                                    }
                                    return 'Memorized';
                                  })()}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center text-gray-600">
                                    <div className="text-sm">
                                      {extendedStudent.latest_test_result ? (
                                        <>
                                          <div className="font-medium">
                                            {extendedStudent.latest_test_result.test_hizb 
                                              ? `Hizb ${(extendedStudent.latest_test_result.juz_number - 1) * 2 + 1}`
                                              : `Juz ${extendedStudent.latest_test_result.juz_number}`
                                            }
                                          </div>
                                          <div className={`text-xs font-medium ${
                                            extendedStudent.latest_test_result.passed 
                                              ? 'text-green-600' 
                                              : 'text-red-600'
                                          }`}>
                                            {extendedStudent.latest_test_result.examiner_name === 'Historical Entry'
                                              ? (extendedStudent.latest_test_result.passed ? 'PASSED' : 'FAILED')
                                              : `${extendedStudent.latest_test_result.total_percentage}% (${extendedStudent.latest_test_result.passed ? 'PASSED' : 'FAILED'})`}
                                          </div>
                                          {extendedStudent.latest_test_result.examiner_name !== 'Historical Entry' && (
                                            <div className="text-xs text-gray-500">
                                              {formatAbsoluteDate(student.last_read_date)}
                                            </div>
                                          )}
                                        </>
                                      ) : (
                                        <div className="text-gray-400 italic">No tests</div>
                                      )}
                                    </div>
                              </td>
                              <td className="px-4 py-3 text-center ">
                                <div className="flex flex-col items-center">
                                  <span className={`text-lg font-bold ${
                                    (extendedStudent.juz_test_gap || 0) >= 3 
                                      ? 'text-red-600' 
                                      : (extendedStudent.juz_test_gap || 0) >= 1 
                                        ? 'text-yellow-600' 
                                        : 'text-green-600'
                                  }`}>
                                    {extendedStudent.juz_test_gap || 0}
                                  </span>
                                  <span className={`text-xs font-medium ${
                                    (extendedStudent.juz_test_gap || 0) >= 3 
                                      ? 'text-red-500' 
                                      : (extendedStudent.juz_test_gap || 0) >= 1 
                                        ? 'text-yellow-500' 
                                        : 'text-green-500'
                                  }`}>
                                    {(extendedStudent.juz_test_gap || 0) === 0 
                                      ? 'Up to date' 
                                      : `${extendedStudent.juz_test_gap} behind`
                                    }
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center ">
                                    <div className="flex flex-col gap-1">
                                      {/* Always allow scheduling/rescheduling in Juz Tests */}
                                      <button
                                          onClick={async () => {
                                            // Open scheduling modal instead of sending notification
                                            const s = students.find(s => s.id === student.id);
                                            if (s) {
                                              setScheduleStudent(s);
                                              setShowScheduleModal(true);
                                              return;
                                            }
                                            if (!userId || !teacherName) {
                                              alert('Error: Unable to identify teacher. Please try refreshing the page.');
                                              return;
                                            }
                                            
                                            const suggestedJuz = (extendedStudent.highest_passed_juz || 0) + 1;
                                            const currentMemorizedJuz = extendedStudent.highest_memorized_juz || 0;
                                            
                                            try {
                                              const result = await notificationService.createExaminerRequest(
                                                student.id,
                                                student.name,
                                                userId,
                                                teacherName,
                                                suggestedJuz,
                                                currentMemorizedJuz
                                              );
                                              
                                              if (result.success) {
                                                alert(`✅ Notification sent to admin successfully!\n\nStudent: ${student.name}\nRequested Juz: ${suggestedJuz}\nCurrent memorization: Juz ${currentMemorizedJuz}`);
                                              } else {
                                                alert(`❌ Failed to send notification: ${result.error}`);
                                              }
                                            } catch (error) {
                                              console.error('Error sending notification:', error);
                                              alert('❌ An error occurred while sending the notification. Please try again.');
                                            }
                                          }}
                                          className="px-3 py-1 rounded-lg text-xs font-medium transition-colors bg-purple-100 hover:bg-purple-200 text-purple-700"
                                        >
                                          {activeSessionsByStudent[student.id] ? 'Reschedule' : 'Schedule Test'}
                                        </button>
                                      
                                      {/* Scheduled badge */}
                                      {activeSessionsByStudent[student.id] && (
                                        <div className="inline-block mt-1 text-[11px] px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                                          Scheduled {activeSessionsByStudent[student.id].scheduled_date} • Slot {activeSessionsByStudent[student.id].slot_number}
                                        </div>
                                      )}
                                      <button
                                        onClick={() => {
                                          setJuzTestHistoryStudent(student);
                                          setShowJuzTestHistoryModal(true);
                                        }}
                                        className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                                      >
                                        View History
                                      </button>
                                    </div>
                                  </td>
                                </>
                          ) : (
                            <>
                              <td className="px-4 py-3 text-gray-800 ">
                                {student.latest_reading || <span className="italic text-gray-400">No records</span>}
                              </td>
                              <td className="px-4 py-3 text-center text-gray-700 ">
                                <div className="text-sm">
                                  <div>{formatAbsoluteDate(student.last_read_date)}</div>
                                  <div className="text-xs text-gray-500">
                                    {formatRelativeDate(student.last_read_date)}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center ">
                                <div className="flex flex-col items-center">
                                  <span className="text-lg font-bold text-gray-800">
                                    {student.days_since_last_read === 999 ? '∞' : student.days_since_last_read}
                                  </span>
                                  <span className={`text-xs font-medium ${activityStatus.color}`}>
                                    {activityStatus.text}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center ">
                                    <div className="flex flex-col gap-1">
                                      {viewMode === 'tasmik' && studentData && (
                                        <button
                                          onClick={() => handleQuickReport(studentData, "Tasmi")}
                                          className="bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                                        >
                                          Add Tasmi
                                        </button>
                                      )}
                                      {viewMode === 'murajaah' && studentData && (
                                        <button
                                          onClick={() => handleQuickReport(studentData, "Murajaah")}
                                          className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                                        >
                                          Add Murajaah
                                        </button>
                                      )}
                                      <button
                                        onClick={() => {
                                          if (studentData) {
                                            handleFullRecords(studentData);
                                          }
                                        }}
                                        className="bg-orange-100 hover:bg-orange-200 text-orange-700 px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                                      >
                                        Full Records
                                      </button>
                                    </div>
                                  </td>
                                </>
                          )}
                        </tr>
                      );
                    })}
                    {filteredMonitorStudents.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-gray-600">
                          <p>No students match the current filters.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
</div>
      </div>
        
        {/* Schedule Test Modal */}
        {showScheduleModal && scheduleStudent && (
          <ScheduleTestModal
            student={{ id: scheduleStudent.id, name: scheduleStudent.name }}
            onClose={() => { setShowScheduleModal(false); setScheduleStudent(null); }}
            onScheduled={() => { refetchActiveSchedules(filteredMonitorStudents.map(s => s.id)); }}
          />
        )}
        
        {/* Quick Report Modal */}
        {showQuickModal && quickModalData && userId && (
          <QuickReportModal
            student={quickModalData.student}
            reportType={quickModalData.reportType}
            onClose={() => {
              setShowQuickModal(false);
              setQuickModalData(null);
            }}
            onSuccess={refreshData}
            userId={userId}
            suggestions={quickModalData.suggestions}
          />
        )}

        {/* Edit Modal */}
        {showEditModal && editingReport && (
          <EditReportModal
            report={editingReport}
            onCancel={() => setShowEditModal(false)}
            onSave={editReport}
            surahs={SURAHS}
            grades={GRADES}
            reportTypes={REPORT_TYPES}
          />
        )}

        {/* Full Records Modal */}
        {showFullRecordsModal && fullRecordsStudent && userId && (
          <FullRecordsModal
            student={fullRecordsStudent}
            onClose={() => {
              setShowFullRecordsModal(false);
              setFullRecordsStudent(null);
            }}
            onEdit={handleEditReport}
            onRefresh={refreshData}
            userId={userId}
            viewMode={viewMode}
          />
        )}

        {/* Juz Test History Modal */}
        {showJuzTestHistoryModal && juzTestHistoryStudent && (
          <JuzTestHistoryModalViewOnly
            studentId={juzTestHistoryStudent.id}
            studentName={juzTestHistoryStudent.name}
            isOpen={showJuzTestHistoryModal}
            onClose={() => {
              setShowJuzTestHistoryModal(false);
              setJuzTestHistoryStudent(null);
              // In case any cancel occurred in history view, refresh badges
              refetchActiveSchedules(filteredMonitorStudents.map(s => s.id));
            }}
          />
        )}
    </div>
  );
}
