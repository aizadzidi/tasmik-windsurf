"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import AdminNavbar from "@/components/admin/AdminNavbar";
import { Card } from "@/components/ui/Card";
import JuzTestModal from "@/components/admin/JuzTestModal";
import AdminViewRecordsModal from "@/components/admin/AdminViewRecordsModal";
import JuzTestHistoryModal from "@/components/teacher/JuzTestHistoryModal";
import QuickReportModal from "@/components/teacher/QuickReportModal";
import ActivityTrendChart from "@/components/admin/ActivityTrendChart";
import TeacherPerformanceChart from "@/components/admin/TeacherPerformanceChart";
import JuzTestProgressChart from "@/components/admin/JuzTestProgressChart";
import {
  StudentProgressData,
  calculateDaysSinceLastRead,
  formatRelativeDate,
  formatAbsoluteDate,
  getInactivityRowClass,
  getActivityStatus,
  sortStudentsByActivity,
  filterStudentsBySearch,
  filterStudentsByTeacher,
  getUniqueTeachers,
  getSummaryStats,
  SummaryStats
} from "@/lib/reportUtils";
import { formatMurajaahDisplay } from "@/lib/quranMapping";

type ViewMode = 'tasmik' | 'murajaah' | 'juz_tests';

export default function AdminReportsPage() {
  const [students, setStudents] = useState<StudentProgressData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // View and filter state
  const [viewMode, setViewMode] = useState<ViewMode>('tasmik');
  const [searchTerm, setSearchTerm] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [sortBy, setSortBy] = useState<'activity' | 'name' | 'teacher'>('activity');
  
  // Juz Test modal state
  const [showJuzTestModal, setShowJuzTestModal] = useState(false);
  const [selectedStudentForTest, setSelectedStudentForTest] = useState<string | null>(null);
  const [selectedJuzNumber, setSelectedJuzNumber] = useState<number>(1);
  
  // View Records modal state
  const [showViewRecordsModal, setShowViewRecordsModal] = useState(false);
  const [selectedStudentForView, setSelectedStudentForView] = useState<{ id: string; name: string } | null>(null);

  // Juz test history modal state
  const [showJuzTestHistory, setShowJuzTestHistory] = useState(false);
  const [juzTestHistoryStudent, setJuzTestHistoryStudent] = useState<{ id: string; name: string } | null>(null);

  // Quick report modal state
  const [showQuickModal, setShowQuickModal] = useState(false);
  const [quickModalData, setQuickModalData] = useState<{
    student: { id: string; name: string };
    reportType: "Tasmi" | "Murajaah";
    suggestions?: {
      surah: string;
      juzuk: number;
      ayatFrom: number;
      ayatTo: number;
      pageFrom?: number | null;
      pageTo?: number | null;
    };
  } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Optimized fetch function using secure API
  const fetchStudentProgress = useCallback(async () => {
      setLoading(true);
      setError("");

      try {
        // Fetch student progress data via secure API
        const response = await fetch(`/api/admin/reports?viewMode=${viewMode}`);
        
        if (!response.ok) {
          const errorData = await response.json();
          setError(errorData.error || 'Failed to fetch student data');
          return;
        }

        const studentsData: Array<{
          id: string;
          name: string;
          users?: { name?: string | null } | null;
          classes?: { name?: string | null } | null;
          memorization_completed?: boolean;
          memorization_completed_date?: string | null;
        }> = await response.json();

        if (!studentsData || studentsData.length === 0) {
          setStudents([]);
          return;
        }

        // Collect student IDs once for batched queries below
        const studentIds = studentsData.map((s) => s.id);

        if (viewMode === 'juz_tests') {
          // Batch fetch all memorization data and juz tests
          const [memorizationResults, passedJuzTestResults, allJuzTestResults] = await Promise.all([
            // Get all memorization data in one query
            supabase
              .from("reports")
              .select("student_id, juzuk")
              .in("student_id", studentIds)
              .eq("type", "Tasmi")
              .not("juzuk", "is", null)
              .order("juzuk", { ascending: false }),
            
            // Get all PASSED juz test data in one query
            supabase
              .from("juz_tests")
              .select("student_id, juz_number, test_date, passed, total_percentage")
              .in("student_id", studentIds)
              .eq("passed", true)
              .order("juz_number", { ascending: false })
              .then(result => {
                if (result.error?.message?.includes('relation "public.juz_tests" does not exist')) {
                  return { data: [], error: null };
                }
                return result;
              }),

            // Get all juz test data for display purposes
            supabase
              .from("juz_tests")
              .select("student_id, juz_number, test_date, passed, total_percentage")
              .in("student_id", studentIds)
              .order("test_date", { ascending: false })
              .then(result => {
                if (result.error?.message?.includes('relation "public.juz_tests" does not exist')) {
                  return { data: [], error: null };
                }
                return result;
              })
          ]);

          // Process the batched data
          const studentProgressData = studentsData.map((student) => {
            // Find highest memorized juz for this student
            const studentMemorization = memorizationResults.data?.filter(r => r.student_id === student.id) || [];
            const highestMemorizedJuz = studentMemorization.length > 0 
              ? Math.max(...studentMemorization.map(r => r.juzuk || 0))
              : 0;

            // Find highest PASSED test for this student
            const studentPassedTests = passedJuzTestResults.data?.filter(r => r.student_id === student.id) || [];
            const latestPassedTest = studentPassedTests.length > 0 ? studentPassedTests[0] : null;
            const highestPassedJuz = latestPassedTest?.juz_number || 0;

            // Find latest test for display purposes
            const allStudentTests = allJuzTestResults.data?.filter(r => r.student_id === student.id) || [];
            const latestTest = allStudentTests.length > 0 ? allStudentTests[0] : null;
            
            const gap = highestMemorizedJuz - highestPassedJuz;

            return {
              id: student.id,
              name: student.name,
              teacher_name: (student.users as { name?: string })?.name || null,
              class_name: (student.classes as { name?: string })?.name || null,
              latest_reading: `Memorized: Juz ${highestMemorizedJuz}`,
              last_read_date: latestTest?.test_date || null,
              days_since_last_read: latestTest?.test_date ? calculateDaysSinceLastRead(latestTest.test_date) : 999,
              report_type: 'juz_test',
              memorization_completed: student.memorization_completed,
              memorization_completed_date: student.memorization_completed_date,
              highest_memorized_juz: highestMemorizedJuz,
              highest_passed_juz: highestPassedJuz,
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
          });

          setStudents(studentProgressData);
        } else {
          // Batch fetch for Tasmik and Murajaah
          const reportType = viewMode === 'tasmik' ? 'Tasmi' : 
                           viewMode === 'murajaah' ? ['Old Murajaah', 'New Murajaah'] : 'Tasmi';

          let query = supabase
            .from("reports")
            .select("*")
            .in("student_id", studentIds);

          if (Array.isArray(reportType)) {
            query = query.in("type", reportType);
          } else {
            query = query.eq("type", reportType);
          }

          const { data: allReports } = await query.order("date", { ascending: false });

          // Process the batched data
          const studentProgressData = studentsData.map((student) => {
            // Find latest report for this student
            const studentReports = allReports?.filter(r => r.student_id === student.id) || [];
            const latestReport = studentReports.length > 0 ? studentReports[0] : null;
            
            const daysSinceLastRead = latestReport 
              ? calculateDaysSinceLastRead(latestReport.date)
              : 999;

            // Format latest reading
            let latestReading = null;
            if (latestReport) {
              if (viewMode === 'tasmik') {
                latestReading = `${latestReport.surah} (${latestReport.ayat_from}-${latestReport.ayat_to})`;
              } else {
                // Use formatMurajaahDisplay for Murajaah reports
                const fallbackReading = latestReport.juzuk
                  ? `Juz ${latestReport.juzuk}`
                  : latestReport.surah;
                const pageFrom = latestReport.page_from ?? latestReport.page_to ?? null;
                const pageTo = latestReport.page_to ?? latestReport.page_from ?? undefined;

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
              teacher_name: (student.users as { name?: string })?.name || null,
              class_name: (student.classes as { name?: string })?.name || null,
              latest_reading: latestReading,
              last_read_date: latestReport?.date || null,
              days_since_last_read: daysSinceLastRead,
              report_type: latestReport?.type || null,
              memorization_completed: student.memorization_completed,
              memorization_completed_date: student.memorization_completed_date
            } as StudentProgressData;
          });

          setStudents(studentProgressData);
        }
      } catch (err) {
        setError("Failed to fetch data: " + (err as Error).message);
      } finally {
        setLoading(false);
      }
    }, [viewMode]);

  useEffect(() => {
    fetchStudentProgress();
  }, [fetchStudentProgress]);

  // Get current user ID
  useEffect(() => {
    supabase.auth.getUser().then(({ data, error }) => {
      if (error) {
        console.error("Failed to get user:", error);
        setCurrentUserId(null);
      } else {
        setCurrentUserId(data.user?.id ?? null);
      }
    });
  }, []);

  // Filtered and sorted students
  const filteredStudents = useMemo(() => {
    let filtered = students;
    
    // Apply search filter
    filtered = filterStudentsBySearch(filtered, searchTerm);
    
    // Apply teacher filter
    filtered = filterStudentsByTeacher(filtered, teacherFilter);
    
    // Apply sorting
    switch (sortBy) {
      case 'activity':
        if (viewMode === 'juz_tests') {
          // For juz tests: prioritize by gap (highest gap first), then by highest memorized juz
          filtered = [...filtered].sort((a, b) => {
            const extA = a as StudentProgressData & { highest_memorized_juz?: number; juz_test_gap?: number };
            const extB = b as StudentProgressData & { highest_memorized_juz?: number; juz_test_gap?: number };
            
            // First by gap (descending - larger gaps first for priority)
            const gapDiff = (extB.juz_test_gap || 0) - (extA.juz_test_gap || 0);
            if (gapDiff !== 0) return gapDiff;
            
            // Then by highest memorized juz (descending)
            return (extB.highest_memorized_juz || 0) - (extA.highest_memorized_juz || 0);
          });
        } else {
          // For tasmik/murajaah: use existing activity sorting (most inactive first)
          filtered = sortStudentsByActivity(filtered);
        }
        break;
      case 'name':
        filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'teacher':
        filtered = [...filtered].sort((a, b) => 
          (a.teacher_name || '').localeCompare(b.teacher_name || ''));
        break;
      default:
        if (viewMode === 'juz_tests') {
          // For juz tests: prioritize by gap (highest gap first), then by highest memorized juz
          filtered = [...filtered].sort((a, b) => {
            const extA = a as StudentProgressData & { highest_memorized_juz?: number; juz_test_gap?: number };
            const extB = b as StudentProgressData & { highest_memorized_juz?: number; juz_test_gap?: number };
            
            // First by gap (descending - larger gaps first for priority)
            const gapDiff = (extB.juz_test_gap || 0) - (extA.juz_test_gap || 0);
            if (gapDiff !== 0) return gapDiff;
            
            // Then by highest memorized juz (descending)
            return (extB.highest_memorized_juz || 0) - (extA.highest_memorized_juz || 0);
          });
        } else {
          filtered = sortStudentsByActivity(filtered);
        }
    }
    
    return filtered;
  }, [students, searchTerm, teacherFilter, sortBy, viewMode]);

  // Summary statistics
  const summaryStats: SummaryStats = useMemo(() => 
    getSummaryStats(filteredStudents), [filteredStudents]);

  // Unique teachers for filter dropdown
  const uniqueTeachers = useMemo(() => 
    getUniqueTeachers(students), [students]);

  const handleViewRecord = async (studentId: string) => {
    if (viewMode === 'juz_tests') {
      // Show Juz Test history modal
      const student = students.find(s => s.id === studentId);
      if (student) {
        setJuzTestHistoryStudent({ id: student.id, name: student.name });
        setShowJuzTestHistory(true);
      }
    } else {
      // Show records modal for Tasmik/Murajaah
      const student = students.find(s => s.id === studentId);
      if (student) {
        setSelectedStudentForView({ id: student.id, name: student.name });
        setShowViewRecordsModal(true);
      }
    }
  };

  const handleQuickMurajaah = (student: { id: string; name: string }) => {
    setQuickModalData({ 
      student: student, 
      reportType: "Murajaah",
      suggestions: undefined 
    });
    setShowQuickModal(true);
  };

  const refreshData = () => {
    fetchStudentProgress();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9] flex items-center justify-center">
        <div className="text-xl text-gray-800">Loading student progress...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9]">
      <AdminNavbar />
      <div className="relative p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <header className="mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Student Progress Reports</h1>
              <p className="text-gray-600">Monitor tasmik, murajaah and juz tests activity across all students</p>
            </div>
          </header>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-4">
            <div className="text-2xl font-bold">{summaryStats.totalStudents}</div>
            <div className="text-sm text-gray-600">Total Students</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-orange-600">{summaryStats.inactive7Days}</div>
            <div className="text-sm text-gray-600">Inactive &gt; 7 Days</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-red-600">{summaryStats.inactive14Days}</div>
            <div className="text-sm text-gray-600">Inactive &gt; 14 Days</div>
          </Card>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Student Activity Trend</h3>
            <ActivityTrendChart students={filteredStudents} />
          </Card>
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Teacher Performance</h3>
            <TeacherPerformanceChart students={filteredStudents} />
          </Card>
          {viewMode === 'juz_tests' && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Juz Test Progress</h3>
              <JuzTestProgressChart students={filteredStudents} />
            </Card>
          )}
        </div>

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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div>
              <select
                value={teacherFilter}
                onChange={(e) => setTeacherFilter(e.target.value)}
                className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
              >
                <option value="">Filter by Teacher</option>
                {uniqueTeachers.map(teacher => (
                  <option key={teacher} value={teacher}>{teacher}</option>
                ))}
              </select>
            </div>
            <div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'activity' | 'name' | 'teacher')}
                className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
              >
                <option value="activity">Sort by Activity</option>
                <option value="name">Sort by Name</option>
                <option value="teacher">Sort by Teacher</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <input
                type="text"
                placeholder="Search students, teachers, or classes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
              {error}
            </div>
          )}

          {/* Student Progress Table */}
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Teacher</th>
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
                  {filteredStudents.map((student) => {
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
                      : getInactivityRowClass(student.days_since_last_read, student.memorization_completed);
                    
                    const activityStatus = getActivityStatus(student.days_since_last_read, student.memorization_completed);
                    
                    return (
                      <tr key={student.id} className={`${rowClass}`}>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <div>
                            <div className="font-semibold">{student.name}</div>
                            {student.class_name && (
                              <div className="text-xs text-gray-600">{student.class_name}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {student.teacher_name || <span className="italic text-gray-400">Unassigned</span>}
                        </td>
                        
                        {viewMode === 'juz_tests' ? (
                          <>
                            <td className="px-4 py-3 text-gray-600">
                              <div className="text-sm font-medium">
                                Juz {extendedStudent.highest_memorized_juz || 0}
                              </div>
                              <div className="text-xs text-gray-500">Memorized</div>
                            </td>
                            <td className="px-4 py-3 text-center text-gray-600">
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
                                {/* Show button if there's a gap OR if last test failed */}
                                {((extendedStudent.juz_test_gap || 0) > 0 || 
                                  (extendedStudent.latest_test_result && !extendedStudent.latest_test_result.passed)) && (
                                  <button
                                    onClick={() => {
                                      setSelectedStudentForTest(student.id);
                                      // If last test failed, repeat same juz; otherwise test next juz
                                      const nextJuz = (extendedStudent.latest_test_result && !extendedStudent.latest_test_result.passed)
                                        ? extendedStudent.latest_test_result.juz_number
                                        : (extendedStudent.highest_passed_juz || 0) + 1;
                                      setSelectedJuzNumber(nextJuz);
                                      setShowJuzTestModal(true);
                                    }}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                                      (extendedStudent.latest_test_result && !extendedStudent.latest_test_result.passed)
                                        ? 'bg-orange-100 hover:bg-orange-200 text-orange-700'
                                        : 'bg-green-100 hover:bg-green-200 text-green-700'
                                    }`}
                                  >
                                    {(extendedStudent.latest_test_result && !extendedStudent.latest_test_result.passed)
                                      ? `Repeat Juz ${extendedStudent.latest_test_result.juz_number}`
                                      : `Test Juz ${(extendedStudent.highest_passed_juz || 0) + 1}`
                                    }
                                  </button>
                                )}
                                <button
                                  onClick={() => handleViewRecord(student.id)}
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
                                {viewMode === 'murajaah' && (
                                  <button
                                    onClick={() => handleQuickMurajaah({ id: student.id, name: student.name })}
                                    className="bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                                  >
                                    Add Murajaah
                                  </button>
                                )}
                                <button
                                  onClick={() => handleViewRecord(student.id)}
                                  className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded-lg text-sm font-medium transition-colors"
                                >
                                  View Record
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                  {filteredStudents.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-gray-600">
                        <p>No students match the current filters.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
          </div>
        </Card>
        
        {/* Juz Test Modal */}
        {showJuzTestModal && selectedStudentForTest && (
          <JuzTestModal
            isOpen={showJuzTestModal}
            onClose={() => {
              setShowJuzTestModal(false);
              setSelectedStudentForTest(null);
            }}
            studentId={selectedStudentForTest}
            studentName="Student" 
            defaultJuzNumber={selectedJuzNumber}
            onSubmit={() => {
              // Refresh the data after successful submission
              // Force re-fetch by updating a dependency
              fetchStudentProgress();
            }}
          />
        )}

        {/* View Records Modal */}
        {showViewRecordsModal && selectedStudentForView && (
          <AdminViewRecordsModal
            student={selectedStudentForView}
            onClose={() => {
              setShowViewRecordsModal(false);
              setSelectedStudentForView(null);
            }}
            viewMode={viewMode === 'tasmik' ? 'tasmik' : viewMode === 'murajaah' ? 'murajaah' : 'all'}
          />
        )}

        {/* Juz Test History Modal */}
        {showJuzTestHistory && juzTestHistoryStudent && (
          <JuzTestHistoryModal
            studentId={juzTestHistoryStudent.id}
            studentName={juzTestHistoryStudent.name}
            isOpen={showJuzTestHistory}
            onClose={() => {
              setShowJuzTestHistory(false);
              setJuzTestHistoryStudent(null);
            }}
            onRefresh={fetchStudentProgress}
          />
        )}

        {/* Quick Report Modal */}
        {showQuickModal && quickModalData && currentUserId && (
          <QuickReportModal
            student={quickModalData.student}
            reportType={quickModalData.reportType}
            onClose={() => {
              setShowQuickModal(false);
              setQuickModalData(null);
            }}
            onSuccess={refreshData}
            userId={currentUserId}
            suggestions={quickModalData.suggestions}
          />
        )}
        </div>
      </div>
    </div>
  );
}
