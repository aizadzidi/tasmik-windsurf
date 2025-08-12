"use client";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { QuranProgressBar, ChartTabs } from "@/components/ReportCharts";
import Navbar from "@/components/Navbar";
import { Card } from "@/components/ui/Card";
import QuickReportModal from "@/components/teacher/QuickReportModal";
import EditReportModal from "./EditReportModal";
import FullRecordsModal from "@/components/teacher/FullRecordsModal";
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
import type { Student, Report, ViewMode } from "@/types/teacher";

const SURAHS = [
  "Al-Fatihah", "Al-Baqarah", "Aali Imran", "An-Nisa'", "Al-Ma'idah", "Al-An'am", "Al-A'raf", "Al-Anfal", "At-Tawbah", "Yunus", "Hud", "Yusuf", "Ar-Ra'd", "Ibrahim", "Al-Hijr", "An-Nahl", "Al-Isra'", "Al-Kahf", "Maryam", "Ta-Ha", "Al-Anbiya'", "Al-Hajj", "Al-Mu'minun", "An-Nur", "Al-Furqan", "Ash-Shu'ara'", "An-Naml", "Al-Qasas", "Al-Ankabut", "Ar-Rum", "Luqman", "As-Sajda", "Al-Ahzab", "Saba'", "Fatir", "Ya-Sin", "As-Saffat", "Sad", "Az-Zumar", "Ghafir", "Fussilat", "Ash-Shura", "Az-Zukhruf", "Ad-Dukhan", "Al-Jathiyah", "Al-Ahqaf", "Muhammad", "Al-Fath", "Al-Hujurat", "Qaf", "Adh-Dhariyat", "At-Tur", "An-Najm", "Al-Qamar", "Ar-Rahman", "Al-Waqi'ah", "Al-Hadid", "Al-Mujadila", "Al-Hashr", "Al-Mumtahanah", "As-Saff", "Al-Jumu'ah", "Al-Munafiqun", "At-Taghabun", "At-Talaq", "At-Tahrim", "Al-Mulk", "Al-Qalam", "Al-Haqqah", "Al-Ma'arij", "Nuh", "Al-Jinn", "Al-Muzzammil", "Al-Muddathir", "Al-Qiyamah", "Al-Insan", "Al-Mursalat", "An-Naba'", "An-Nazi'at", "Abasa", "At-Takwir", "Al-Infitar", "Al-Mutaffifin", "Al-Inshiqaq", "Al-Buruj", "At-Tariq", "Al-A'la", "Al-Ghashiyah", "Al-Fajr", "Al-Balad", "Ash-Shams", "Al-Layl", "Ad-Duhaa", "Ash-Sharh", "At-Tin", "Al-Alaq", "Al-Qadr", "Al-Bayyinah", "Az-Zalzalah", "Al-Adiyat", "Al-Qari'ah", "At-Takathur", "Al-Asr", "Al-Humazah", "Al-Fil", "Quraysh", "Al-Ma'un", "Al-Kawthar", "Al-Kafirun", "An-Nasr", "Al-Masad", "Al-Ikhlas", "Al-Falaq", "An-Nas"
];

const REPORT_TYPES = ["Tasmi", "Murajaah"];
const GRADES = ["mumtaz", "jayyid jiddan", "jayyid"];

export default function TeacherPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Monitor state
  const [monitorStudents, setMonitorStudents] = useState<StudentProgressData[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('tasmik');
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<'activity' | 'name'>('activity');
  const [monitorLoading, setMonitorLoading] = useState(false);

  // Quick report modal
  const [showQuickModal, setShowQuickModal] = useState(false);
  const [quickModalData, setQuickModalData] = useState<{
    student: Student;
    reportType: "Tasmi" | "Murajaah";
    suggestions?: any;
  } | null>(null);

  // Edit modal
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Full records modal
  const [showFullRecordsModal, setShowFullRecordsModal] = useState(false);
  const [fullRecordsStudent, setFullRecordsStudent] = useState<Student | null>(null);

  // Auth check
  useEffect(() => {
    supabase.auth.getUser().then(({ data, error }) => {
      if (error) {
        console.error('Authentication error:', error);
        window.location.href = '/login';
        return;
      }
      setUserId(data.user?.id ?? null);
    }).catch((error) => {
      console.error('Failed to get user:', error);
      window.location.href = '/login';
    });
  }, []);

  // Fetch students
  useEffect(() => {
    if (!userId) return;
    async function fetchStudents() {
      const { data, error } = await supabase
        .from("students")
        .select("id, name")
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
        .eq("teacher_id", userId)
        .order("date", { ascending: false });
      if (!error && data) {
        setReports(data.map((r: any) => ({ ...r, student_name: r.students?.name || "" })));
      }
    }
    fetchReports();
  }, [userId]);

  // Smart suggestions for next progression
  const getSmartSuggestions = (studentId: string, reportType: "Tasmi" | "Murajaah") => {
    const studentReports = reports.filter(r => r.student_id === studentId);
    
    if (reportType === "Tasmi") {
      // Find latest Tasmi report
      const latestTasmi = studentReports
        .filter(r => r.type === "Tasmi")
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      
      if (latestTasmi) {
        // Suggest next ayat range in same surah or next surah
        const currentSurahIndex = SURAHS.indexOf(latestTasmi.surah);
        const nextAyatFrom = latestTasmi.ayat_to + 1;
        const nextPageFrom = latestTasmi.page_to ? latestTasmi.page_to + 1 : null;
        
        // Simple progression logic - suggest next 50 ayats or next surah
        if (nextAyatFrom <= 200) { // arbitrary limit for surah length
          return {
            surah: latestTasmi.surah,
            juzuk: latestTasmi.juzuk || 1,
            ayatFrom: nextAyatFrom,
            ayatTo: nextAyatFrom + 49,
            pageFrom: nextPageFrom,
            pageTo: nextPageFrom ? nextPageFrom + 1 : null
          };
        } else if (currentSurahIndex < SURAHS.length - 1) {
          return {
            surah: SURAHS[currentSurahIndex + 1],
            juzuk: (latestTasmi.juzuk || 1) + 1,
            ayatFrom: 1,
            ayatTo: 50,
            pageFrom: nextPageFrom,
            pageTo: nextPageFrom ? nextPageFrom + 1 : null
          };
        }
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
      // Murajaah - suggest reviewing previous content
      const latestMurajaah = studentReports
        .filter(r => r.type === "Murajaah" || r.type === "Old Murajaah" || r.type === "New Murajaah")
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      
      // If no murajaah, use latest Tasmi for review
      const referenceReport = latestMurajaah || studentReports
        .filter(r => r.type === "Tasmi")
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      
      if (referenceReport) {
        return {
          surah: referenceReport.surah,
          juzuk: referenceReport.juzuk || 1,
          ayatFrom: referenceReport.ayat_from,
          ayatTo: referenceReport.ayat_to,
          pageFrom: referenceReport.page_from,
          pageTo: referenceReport.page_to
        };
      }
    }
    
    return undefined;
  };

  // Fetch monitor data
  const fetchMonitorData = async () => {
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
          users!assigned_teacher_id (name),
          classes (name)
        `)
        .eq("assigned_teacher_id", userId);

      if (studentsError || !studentsData) {
        setMonitorStudents([]);
        return;
      }

      const studentProgressPromises = studentsData.map(async (student) => {
        if (viewMode === 'juz_tests') {
          // For Juz Tests view, get memorization progress and test progress
          const [memorizationResult, juzTestsResult] = await Promise.all([
            // Get highest memorized juz from Tasmi reports
            supabase
              .from("reports")
              .select("juzuk")
              .eq("student_id", student.id)
              .eq("type", "Tasmi")
              .not("juzuk", "is", null)
              .order("juzuk", { ascending: false })
              .limit(1),
            
            // Get highest tested juz (passed or failed)
            supabase
              .from("juz_tests")
              .select("juz_number, test_date, passed, total_percentage")
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
          const latestTest = juzTestsResult.data?.[0] || null;
          const highestTestedJuz = latestTest?.juz_number || 0;
          
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
            };
          };
        } else {
          // Regular tasmik/murajaah logic
          const reportType = viewMode === 'tasmik' ? 'Tasmi' : 
                           viewMode === 'murajaah' ? ['Murajaah', 'Old Murajaah', 'New Murajaah'] : 'Tasmi';

          let query = supabase
            .from("reports")
            .select("*")
            .eq("student_id", student.id)
            .eq("teacher_id", userId);

          // Apply type filter
          if (Array.isArray(reportType)) {
            query = query.in("type", reportType);
          } else {
            query = query.eq("type", reportType);
          }

          const { data: reports } = await query
            .order("date", { ascending: false })
            .limit(1);

          const latestReport = reports?.[0];
          const daysSinceLastRead = latestReport 
            ? calculateDaysSinceLastRead(latestReport.date)
            : 999;

          let latestReading = null;
          if (latestReport) {
            if (viewMode === 'tasmik') {
              latestReading = `${latestReport.surah} (${latestReport.ayat_from}-${latestReport.ayat_to})`;
            } else {
              latestReading = latestReport.juzuk ? `Juz ${latestReport.juzuk}` : latestReport.surah;
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
            report_type: latestReport?.type || null
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
  };

  useEffect(() => {
    if (userId) {
      fetchMonitorData();
    }
  }, [viewMode, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtered and sorted students
  const filteredMonitorStudents = useMemo(() => {
    let filtered = filterStudentsBySearch(monitorStudents, searchTerm);
    
    if (viewMode === 'juz_tests') {
      // Sort by highest memorized juz first, then by gap
      filtered = [...filtered].sort((a, b) => {
        const extA = a as StudentProgressData & { highest_memorized_juz?: number; juz_test_gap?: number };
        const extB = b as StudentProgressData & { highest_memorized_juz?: number; juz_test_gap?: number };
        
        // First by highest memorized juz (descending)
        const juzDiff = (extB.highest_memorized_juz || 0) - (extA.highest_memorized_juz || 0);
        if (juzDiff !== 0) return juzDiff;
        
        // Then by gap (descending - larger gaps first)
        return (extB.juz_test_gap || 0) - (extA.juz_test_gap || 0);
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
  }, [monitorStudents, searchTerm, sortBy, viewMode]);

  const summaryStats: SummaryStats = useMemo(() => 
    getSummaryStats(filteredMonitorStudents), [filteredMonitorStudents]);

  // Handle quick report
  const handleQuickReport = (student: Student, reportType: "Tasmi" | "Murajaah") => {
    const suggestions = getSmartSuggestions(student.id, reportType);
    setQuickModalData({ student, reportType, suggestions });
    setShowQuickModal(true);
  };

  // Handle edit report
  const handleEditReport = (report: Report) => {
    setEditingReport(report);
    setShowEditModal(true);
  };

  // Handle full records view
  const handleFullRecords = (student: Student) => {
    setFullRecordsStudent(student);
    setShowFullRecordsModal(true);
  };

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
        .eq("teacher_id", userId)
        .order("date", { ascending: false });
      if (!error && data) {
        setReports(data.map((r: any) => ({ ...r, student_name: r.students?.name || "" })));
      }
      fetchMonitorData();
    }
  };

  const refreshData = () => {
    if (userId) {
      // Refresh reports
      supabase
        .from("reports")
        .select("*, students(name)")
        .eq("teacher_id", userId)
        .order("date", { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) {
            setReports(data.map((r: any) => ({ ...r, student_name: r.students?.name || "" })));
          }
        });
      
      // Refresh monitor data
      fetchMonitorData();
    }
  };

  return (
    <>
      <Navbar />
      <main className="relative min-h-screen bg-gradient-to-br from-[#b1c7f9] via-[#e0e7ff] to-[#b1f9e6] animate-gradient-move p-4 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          {/* Animated Background Blobs */}
          <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-gradient-to-tr from-blue-300 via-purple-200 to-blue-100 rounded-full opacity-40 blur-3xl animate-pulse-slow -z-10" />
          <div className="absolute -bottom-32 right-0 w-[400px] h-[400px] bg-gradient-to-br from-blue-200 via-blue-100 to-purple-200 rounded-full opacity-30 blur-2xl animate-pulse-slow -z-10" />
          
          <div className="relative z-20">
            {/* Header */}
            <header className="mb-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-800">Student Progress Monitor</h1>
                <p className="text-gray-600 mt-1">Monitor and create reports for your students&apos; Quran memorization progress</p>
              </div>
            </header>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card className="bg-white/30 backdrop-blur-xl border border-white/40 p-6">
                <div className="text-3xl font-bold text-gray-900">{summaryStats.totalStudents}</div>
                <div className="text-sm text-gray-600">Your Students</div>
              </Card>
              <Card className="bg-white/30 backdrop-blur-xl border border-white/40 p-6">
                <div className="text-3xl font-bold text-orange-600">{summaryStats.inactive7Days}</div>
                <div className="text-sm text-gray-600">Inactive &gt; 7 Days</div>
              </Card>
              <Card className="bg-white/30 backdrop-blur-xl border border-white/40 p-6">
                <div className="text-3xl font-bold text-red-600">{summaryStats.inactive14Days}</div>
                <div className="text-sm text-gray-600">Inactive &gt; 14 Days</div>
              </Card>
            </div>

            {/* Main Content Card */}
            <Card className="bg-white/30 backdrop-blur-xl border border-white/40 p-6">
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

              {/* Progress Charts */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-4 text-gray-800">Progress Analytics</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white/50 backdrop-blur-sm rounded-xl p-4">
                    <h4 className="text-md font-medium mb-3 text-gray-700">Student Progress Overview</h4>
                    {viewMode !== 'juz_tests' && filteredMonitorStudents.length > 0 && (
                      <QuranProgressBar reports={reports.filter(r => filteredMonitorStudents.some(s => s.id === r.student_id))} />
                    )}
                  </div>
                  <div className="bg-white/50 backdrop-blur-sm rounded-xl p-4">
                    <h4 className="text-md font-medium mb-3 text-gray-700">Class Analytics</h4>
                    {viewMode !== 'juz_tests' && (
                      <ChartTabs reports={reports.filter(r => filteredMonitorStudents.some(s => s.id === r.student_id))} />
                    )}
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
                      className="w-full border-gray-300 rounded-lg px-3 py-2 bg-white/80 backdrop-blur-sm focus:ring-2 focus:ring-blue-400"
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
                    className="w-full border-gray-300 rounded-lg px-3 py-2 bg-white/80 backdrop-blur-sm focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>

              {/* Loading */}
              {monitorLoading && (
                <div className="text-center py-8 text-gray-600">
                  <p>Loading student progress...</p>
                </div>
              )}

              {/* Student Progress Table */}
              {!monitorLoading && (
                <div className="overflow-hidden rounded-xl border border-white/20 shadow-lg">
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead className="bg-gradient-to-r from-blue-50/80 to-purple-50/80 backdrop-blur-sm">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-gray-800 border-b border-white/30">Name</th>
                          {viewMode === 'juz_tests' ? (
                            <>
                              <th className="px-4 py-3 text-left font-semibold text-gray-800 border-b border-white/30">Current Progress</th>
                              <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b border-white/30">Latest Test</th>
                              <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b border-white/30">Gap</th>
                              <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b border-white/30">Actions</th>
                            </>
                          ) : (
                            <>
                              <th className="px-4 py-3 text-left font-semibold text-gray-800 border-b border-white/30">Latest Reading</th>
                              <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b border-white/30">Last Read</th>
                              <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b border-white/30">Days</th>
                              <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b border-white/30">Actions</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-white/5">
                        {filteredMonitorStudents.map((student, index) => {
                          const extendedStudent = student as StudentProgressData & {
                            highest_memorized_juz?: number;
                            highest_passed_juz?: number;
                            juz_test_gap?: number;
                            latest_test_result?: {
                              juz_number: number;
                              test_date: string;
                              passed: boolean;
                              total_percentage: number;
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
                            : getInactivityRowClass(student.days_since_last_read);
                          
                          const activityStatus = getActivityStatus(student.days_since_last_read);
                          const studentData = students.find(s => s.id === student.id);
                          
                          return (
                            <tr key={student.id} className={`transition-colors hover:bg-white/20 ${index % 2 === 0 ? 'bg-white/5' : 'bg-white/10'} ${rowClass}`}>
                              <td className="px-4 py-3 text-gray-800 font-medium border-b border-white/10">
                                <div>
                                  <div className="font-semibold">{student.name}</div>
                                  {student.class_name && (
                                    <div className="text-xs text-gray-600">{student.class_name}</div>
                                  )}
                                </div>
                              </td>
                              
                              {viewMode === 'juz_tests' ? (
                                <>
                                  <td className="px-4 py-3 text-gray-800 border-b border-white/10">
                                    <div className="text-sm font-medium">
                                      Juz {extendedStudent.highest_memorized_juz || 0}
                                    </div>
                                    <div className="text-xs text-gray-500">Memorized</div>
                                  </td>
                                  <td className="px-4 py-3 text-center text-gray-700 border-b border-white/10">
                                    <div className="text-sm">
                                      {extendedStudent.latest_test_result ? (
                                        <>
                                          <div className="font-medium">
                                            Juz {extendedStudent.latest_test_result.juz_number}
                                          </div>
                                          <div className={`text-xs font-medium ${
                                            extendedStudent.latest_test_result.passed 
                                              ? 'text-green-600' 
                                              : 'text-red-600'
                                          }`}>
                                            {extendedStudent.latest_test_result.total_percentage}% 
                                            ({extendedStudent.latest_test_result.passed ? 'PASSED' : 'FAILED'})
                                          </div>
                                          <div className="text-xs text-gray-500">
                                            {formatAbsoluteDate(student.last_read_date)}
                                          </div>
                                        </>
                                      ) : (
                                        <div className="text-gray-400 italic">No tests</div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-center border-b border-white/10">
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
                                  <td className="px-4 py-3 text-center border-b border-white/10">
                                    <div className="flex flex-col gap-1">
                                      {(extendedStudent.juz_test_gap || 0) > 0 && (
                                        <button
                                          onClick={() => {
                                            const suggestedJuz = (extendedStudent.highest_passed_juz || 0) + 1;
                                            const notes = `Student ready for Juz ${suggestedJuz} test. Current memorization: Juz ${extendedStudent.highest_memorized_juz || 0}`;
                                            alert(`Notification feature will be implemented: ${notes}`);
                                          }}
                                          className="px-3 py-1 rounded-lg text-xs font-medium transition-colors bg-purple-100 hover:bg-purple-200 text-purple-700"
                                        >
                                          Ready to Test
                                        </button>
                                      )}
                                      <button
                                        onClick={async () => {
                                          try {
                                            const { data: tests, error } = await supabase
                                              .from("juz_tests")
                                              .select("*")
                                              .eq("student_id", student.id)
                                              .order("test_date", { ascending: false });

                                            if (error) {
                                              if (error.message?.includes('relation "public.juz_tests" does not exist')) {
                                                alert(`Juz test history for ${student.name}:\n\nNo test records found. The Juz testing system may not be set up yet.`);
                                              } else {
                                                throw error;
                                              }
                                              return;
                                            }

                                            if (tests && tests.length > 0) {
                                              const historyText = tests.map(test => 
                                                `Juz ${test.juz_number} - ${test.total_percentage}% (${test.passed ? 'PASSED' : 'FAILED'}) - ${test.test_date} - ${test.examiner_name || 'Unknown Examiner'}`
                                              ).join('\n');
                                              
                                              alert(`📋 Juz Test History for ${student.name}\n\n${historyText}\n\n💡 Note: View only access - Contact examiner to schedule new tests`);
                                            } else {
                                              alert(`📋 Juz Test History for ${student.name}\n\n❌ This student has not taken any Juz tests yet.\n\n📝 Current Status:\n• Student has memorized up to Juz ${extendedStudent.highest_memorized_juz || 0}\n• No formal Juz tests completed\n• Ready for testing if memorization gap exists\n\n💡 Next Steps:\n• Use "Notify Examiner" button if student is ready\n• Contact examiner to schedule first Juz test`);
                                            }
                                          } catch (error) {
                                            console.error("Error fetching test history:", error);
                                            alert(`Error loading test history for ${student.name}. Please try again later.`);
                                          }
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
                                  <td className="px-4 py-3 text-gray-800 border-b border-white/10">
                                    {student.latest_reading || <span className="italic text-gray-400">No records</span>}
                                  </td>
                                  <td className="px-4 py-3 text-center text-gray-700 border-b border-white/10">
                                    <div className="text-sm">
                                      <div>{formatAbsoluteDate(student.last_read_date)}</div>
                                      <div className="text-xs text-gray-500">
                                        {formatRelativeDate(student.last_read_date)}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-center border-b border-white/10">
                                    <div className="flex flex-col items-center">
                                      <span className="text-lg font-bold text-gray-800">
                                        {student.days_since_last_read === 999 ? '∞' : student.days_since_last_read}
                                      </span>
                                      <span className={`text-xs font-medium ${activityStatus.color}`}>
                                        {activityStatus.text}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-center border-b border-white/10">
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
                </div>
              )}
            </Card>
          </div>
        </div>
        
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

        {/* Animations */}
        <style jsx global>{`
          @keyframes gradient-move {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
          }
          .animate-gradient-move {
            background-size: 200% 200%;
            animation: gradient-move 10s ease-in-out infinite;
          }
          .animate-pulse-slow {
            animation: pulse 8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          }
        `}</style>
      </main>
    </>
  );
}