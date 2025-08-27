"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import { Card } from "@/components/ui/Card";
import JuzTestModal from "@/components/admin/JuzTestModal";
import AdminViewRecordsModal from "@/components/admin/AdminViewRecordsModal";
import JuzTestHistoryModal from "@/components/teacher/JuzTestHistoryModal";
import QuickReportModal from "@/components/teacher/QuickReportModal";
import ActivityTrendChart from "@/components/admin/ActivityTrendChart";
import TeacherPerformanceChart from "@/components/admin/TeacherPerformanceChart";
import JuzTestProgressLineChart from "@/components/teacher/JuzTestProgressLineChart";
import {
  StudentProgressData,
  calculateDaysSinceLastRead,
  formatAbsoluteDate,
  getInactivityRowClass,
  getActivityStatus,
  sortStudentsByActivity,
  filterStudentsBySearch,
  filterStudentsByTeacher,
  getUniqueTeachers,
  getSummaryStats
} from "@/lib/reportUtils";
import { formatMurajaahDisplay } from "@/lib/quranMapping";

type ViewMode = 'tasmik' | 'murajaah' | 'juz_tests';

// Helper function to format latest reading
function formatLatestReading(report: { type: string; surah?: string; ayat_from?: number; ayat_to?: number; page_from?: number; page_to?: number; juzuk_from?: number; juzuk_to?: number; juzuk?: number } | null) {
  if (!report) return "No reading recorded";
  
  if (report.type === 'Tasmi') {
    return `${report.surah} (${report.ayat_from}-${report.ayat_to})`;
  } else {
    // For murajaah reports, use page numbers if available, otherwise show juzuk
    if (report.page_from && report.page_to) {
      return formatMurajaahDisplay(report.page_from, report.page_to);
    } else if (report.juzuk_from && report.juzuk_to) {
      return `Juz ${report.juzuk_from}${report.juzuk_to !== report.juzuk_from ? ` - ${report.juzuk_to}` : ''}`;
    } else if (report.juzuk) {
      return `Juz ${report.juzuk}`;
    } else {
      return "Murajaah reading";
    }
  }
}

export default function AdminReportsPage() {
  const [students, setStudents] = useState<StudentProgressData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // View and filter state
  const [viewMode, setViewMode] = useState<ViewMode>('tasmik');
  const [searchTerm, setSearchTerm] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [sortBy, setSortBy] = useState<'activity' | 'name' | 'teacher'>('activity');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  
  // Juz Test modal state
  const [showJuzTestModal, setShowJuzTestModal] = useState(false);
  const [selectedStudentForTest, setSelectedStudentForTest] = useState<{ id: string; name: string } | null>(null);
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

  // Simplified fetch function using secure API
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

      const studentsData = await response.json();


      if (!studentsData || studentsData.length === 0) {
        setStudents([]);
        return;
      }

      // Process the API data for display
      const studentProgressData = studentsData.map((student: { 
        id: string; 
        name: string; 
        teacher_name?: string; 
        class_name?: string; 
        memorized_juzuks?: number[]; 
        juz_tests?: { passed: boolean; juz_number: number; test_date: string; total_percentage?: number }[]; 
        latestTasmikReport?: any; 
        latestMurajaahReport?: any; 
        memorization_completed?: boolean; 
        memorization_completed_date?: string; 
      }) => {
        if (viewMode === 'juz_tests') {
          // For juz tests mode
          const highestCompletedJuz = (student.memorized_juzuks?.length ?? 0) > 0 
            ? Math.max(...(student.memorized_juzuks ?? [])) 
            : 0;

          // Latest Tasmik juz worked on (may be the current in-progress juz)
          const latestTasmiJuz = student.latestTasmikReport?.juzuk || highestCompletedJuz || 0;

          // Determine effective memorized juz to use for gap: exclude current in-progress juz
          // If latest tasmi juz isn't in the completed list, do not count it
          const latestIsCompleted = (student.memorized_juzuks || []).includes(latestTasmiJuz);
          const memorizedForGap = latestIsCompleted ? latestTasmiJuz : highestCompletedJuz;

          // Latest test (passed or failed)
          const latestTest = student.juz_tests?.[0] || null;
          const latestTestJuz = latestTest?.juz_number || 0;

          const gap = Math.max(0, (memorizedForGap || 0) - latestTestJuz);

          return {
            id: student.id,
            name: student.name,
            teacher_name: student.teacher_name,
            class_name: student.class_name,
            latest_reading: `Memorized: Juz ${latestTasmiJuz}`,
            last_read_date: latestTest?.test_date || null,
            days_since_last_read: gap, // reused field for convenience, but UI will treat as gap in juz_tests view
            report_type: 'juz_test',
            memorization_completed: student.memorization_completed,
            memorization_completed_date: student.memorization_completed_date,
            highest_memorized_juz: latestTasmiJuz,
            highest_completed_juz: highestCompletedJuz,
            latest_test_result: latestTest,
            juz_test_gap: gap
          };
        } else {
          // For tasmik/murajaah modes
          const latestReport = viewMode === 'tasmik' 
            ? student.latestTasmikReport 
            : student.latestMurajaahReport;

          return {
            id: student.id,
            name: student.name,
            teacher_name: student.teacher_name,
            class_name: student.class_name,
            latest_reading: latestReport ? formatLatestReading(latestReport) : "No reading recorded",
            last_read_date: latestReport?.date || null,
            days_since_last_read: latestReport?.date ? calculateDaysSinceLastRead(latestReport.date) : 999,
            report_type: viewMode,
            memorization_completed: student.memorization_completed,
            memorization_completed_date: student.memorization_completed_date,
            reports: latestReport ? [latestReport] : []
          };
        }
      });


      setStudents(studentProgressData);
    } catch (err) {
      setError("Failed to fetch data: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [viewMode]);

  useEffect(() => {
    fetchStudentProgress();
  }, [fetchStudentProgress]);

  // Get current user ID (for modals that need it)
  useEffect(() => {
    // Since we're using API routes, we don't need to fetch user ID from Supabase
    // Set a dummy ID or handle this in the modal components
    setCurrentUserId('admin-user');
  }, []);

  // Modal handler functions
  const handleOpenJuzTestModal = (student: { id: string; name: string }, juzNumber: number) => {
    setSelectedStudentForTest(student);
    setSelectedJuzNumber(juzNumber);
    setShowJuzTestModal(true);
  };

  const handleOpenViewRecordsModal = (student: { id: string; name: string }) => {
    setSelectedStudentForView(student);
    setShowViewRecordsModal(true);
  };

  const handleOpenJuzTestHistory = (student: { id: string; name: string }) => {
    setJuzTestHistoryStudent(student);
    setShowJuzTestHistory(true);
  };

  const handleOpenQuickModal = (student: { id: string; name: string }, reportType: "Tasmi" | "Murajaah") => {
    setQuickModalData({
      student,
      reportType,
      suggestions: undefined // You can add suggestions logic later
    });
    setShowQuickModal(true);
  };

  const refreshData = () => {
    fetchStudentProgress();
  };

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
        filtered = sortStudentsByActivity(filtered);
        break;
      case 'name':
        filtered = filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'teacher':
        filtered = filtered.sort((a, b) => (a.teacher_name || '').localeCompare(b.teacher_name || ''));
        break;
    }
    

    return filtered;
  }, [students, searchTerm, teacherFilter, sortBy]);

  // Summary statistics
  const summaryStats = useMemo(() => getSummaryStats(filteredStudents), [filteredStudents]);
  
  // Unique teachers for filter dropdown
  const uniqueTeachers = useMemo(() => getUniqueTeachers(students), [students]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9] flex items-center justify-center">
        <div className="text-xl text-gray-800">Loading student progress...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9] flex items-center justify-center">
        <div className="text-xl text-red-600">Error: {error}</div>
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
            <Card className="bg-white/80 backdrop-blur-sm border border-white/20 shadow-lg p-6">
              <div className="text-3xl font-bold text-blue-600">{summaryStats.totalStudents}</div>
              <div className="text-sm text-gray-600">Total Students</div>
            </Card>
            <Card className="bg-white/80 backdrop-blur-sm border border-white/20 shadow-lg p-6">
              <div className="text-3xl font-bold text-orange-600">{summaryStats.inactive7Days}</div>
              <div className="text-sm text-gray-600">Inactive &gt; 7 Days</div>
            </Card>
            <Card className="bg-white/80 backdrop-blur-sm border border-white/20 shadow-lg p-6">
              <div className="text-3xl font-bold text-red-600">{summaryStats.inactive14Days}</div>
              <div className="text-sm text-gray-600">Inactive &gt; 14 Days</div>
            </Card>
          </div>

          {/* Charts Section */}
          {viewMode !== 'juz_tests' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <Card className="bg-white/80 backdrop-blur-sm border border-white/20 shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Student Activity Trend</h3>
                <ActivityTrendChart students={selectedStudentId ? filteredStudents.filter(s => s.id === selectedStudentId) : filteredStudents} />
              </Card>
              <Card className="bg-white/80 backdrop-blur-sm border border-white/20 shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Teacher Performance</h3>
                <TeacherPerformanceChart students={selectedStudentId ? filteredStudents.filter(s => s.id === selectedStudentId) : filteredStudents} />
              </Card>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 mb-6">
              <Card className="bg-white/80 backdrop-blur-sm border border-white/20 shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Juz Test Progress Overview</h3>
                <JuzTestProgressLineChart 
                  className="col-span-1" 
                  studentId={selectedStudentId || (filteredStudents.length === 1 ? filteredStudents[0].id : undefined)}
                />
              </Card>
            </div>
          )}

          {/* View Mode Tabs */}
          <div className="flex space-x-2 mb-6">
            {(['tasmik', 'murajaah', 'juz_tests'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  viewMode === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/60 text-gray-700 hover:bg-white/80'
                }`}
              >
                {mode === 'tasmik' ? 'Tasmik' : mode === 'murajaah' ? 'Murajaah' : 'Juz Tests'}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Teacher</label>
              <select
                value={teacherFilter}
                onChange={(e) => setTeacherFilter(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg bg-white"
              >
                <option value="">All Teachers</option>
                {uniqueTeachers.map((teacher, index) => (
                  <option key={`teacher-${index}-${teacher}`} value={teacher}>
                    {teacher}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Sort by Activity</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'activity' | 'name' | 'teacher')}
                className="w-full p-2 border border-gray-300 rounded-lg bg-white"
              >
                <option value="activity">Sort by Activity</option>
                <option value="name">Sort by Name</option>
                <option value="teacher">Sort by Teacher</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
              <input
                type="text"
                placeholder="Search students, teachers, or classes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          {/* Students Table */}
          <Card className="bg-white/80 backdrop-blur-sm border border-white/20 shadow-lg">
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-medium text-gray-700">NAME</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-700">TEACHER</th>
                      {viewMode === 'juz_tests' ? (
                        <>
                          <th className="text-left py-3 px-4 font-medium text-gray-700">CURRENT PROGRESS</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-700">LATEST TEST</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-700">GAP</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-700">ACTIONS</th>
                        </>
                      ) : (
                        <>
                          <th className="text-left py-3 px-4 font-medium text-gray-700">LATEST READING</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-700">LAST READ</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-700">DAYS</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-700">ACTIONS</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-gray-500">
                          No students match the current filters.
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map((student) => {
                        const extended = student as StudentProgressData & {
                          highest_memorized_juz?: number;
                          highest_completed_juz?: number;
                          latest_test_result?: { juz_number: number; test_date: string; passed?: boolean; total_percentage?: number; examiner_name?: string } | null;
                          juz_test_gap?: number;
                        };
                        const rowClass = viewMode === 'juz_tests'
                          ? ((extended.juz_test_gap || 0) >= 3
                              ? 'bg-red-50/80'
                              : (extended.juz_test_gap || 0) >= 1
                                ? 'bg-yellow-50/80'
                                : '')
                          : getInactivityRowClass(student.days_since_last_read);
                        return (
                        <tr key={student.id} className={`border-b border-gray-100 ${rowClass}`}>
                          <td className="py-3 px-4">
                            <div className="flex items-start gap-2">
                              {selectedStudentId !== null && (
                                <input
                                  type="checkbox"
                                  checked={selectedStudentId === student.id}
                                  onChange={() => setSelectedStudentId(prev => prev === student.id ? null : student.id)}
                                  className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded"
                                  aria-label={`Select ${student.name}`}
                                />
                              )}
                              <div>
                                <button
                                  onClick={() => setSelectedStudentId(prev => prev === student.id ? null : student.id)}
                                  className={`font-medium underline-offset-2 ${selectedStudentId === student.id ? 'text-blue-700 underline' : 'text-blue-600 hover:underline'}`}
                                  title={selectedStudentId === student.id ? 'Showing charts for this student' : 'Show charts for this student'}
                                >
                                  {student.name}
                                </button>
                                {student.memorization_completed && (
                                  <div className="text-xs text-green-600 font-medium">✓ Completed</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-gray-700">
                            {student.teacher_name || '-'}
                          </td>
                          {viewMode === 'juz_tests' ? (
                            <>
                              <td className="py-3 px-4 text-gray-700">
                                Memorized: Juz {extended.highest_memorized_juz || 0}
                              </td>
                              <td className="py-3 px-4 text-gray-700">
                                {extended.latest_test_result ? (
                                  <div>
                                    <div className="font-medium">Juz {extended.latest_test_result.juz_number}</div>
                                    <div className={`text-xs font-medium ${extended.latest_test_result?.passed ? 'text-green-600' : 'text-red-600'}`}>
                                      {extended.latest_test_result.examiner_name === 'Historical Entry'
                                        ? (extended.latest_test_result.passed ? 'PASSED' : 'FAILED')
                                        : `${extended.latest_test_result.total_percentage}% (${extended.latest_test_result.passed ? 'PASSED' : 'FAILED'})`}
                                    </div>
                                    {extended.latest_test_result.examiner_name !== 'Historical Entry' && (
                                      <div className="text-xs text-gray-500">{formatAbsoluteDate(student.last_read_date)}</div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-gray-400 italic">No tests</span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${((extended.juz_test_gap || 0) >= 3) ? 'text-red-700 bg-red-100' : ((extended.juz_test_gap || 0) >= 1) ? 'text-amber-700 bg-amber-100' : 'text-green-700 bg-green-100'}`}>
                                  {extended.juz_test_gap || 0}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex space-x-2">
                                  <button 
                                    onClick={() => handleOpenJuzTestHistory({ id: student.id, name: student.name })}
                                    className="text-green-600 hover:text-green-800 text-sm font-medium"
                                  >
                                    History
                                  </button>
                                  <button 
                                    onClick={() => {
                                      const nextJuz = Math.min((extended.highest_memorized_juz || 1), 30);
                                      handleOpenJuzTestModal({ id: student.id, name: student.name }, nextJuz);
                                    }}
                                    className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                                  >
                                    Add Test
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="py-3 px-4 text-gray-700">
                                {student.latest_reading}
                              </td>
                              <td className="py-3 px-4 text-gray-700">
                                {student.last_read_date ? formatAbsoluteDate(student.last_read_date) : '-'}
                              </td>
                              <td className="py-3 px-4">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActivityStatus(student.days_since_last_read).color}`}>
                                  {student.days_since_last_read === 999 ? '∞' : student.days_since_last_read}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex space-x-2">
                                  <button 
                                    onClick={() => handleOpenViewRecordsModal({ id: student.id, name: student.name })}
                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                  >
                                    View
                                  </button>
                                  <button 
                                    onClick={() => handleOpenQuickModal(
                                      { id: student.id, name: student.name }, 
                                      viewMode === 'tasmik' ? 'Tasmi' : 'Murajaah'
                                    )}
                                    className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                                  >
                                    Add
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>

          {/* Modals */}
          {/* Juz Test Modal */}
          {showJuzTestModal && selectedStudentForTest && (
            <JuzTestModal
              isOpen={showJuzTestModal}
              onClose={() => {
                setShowJuzTestModal(false);
                setSelectedStudentForTest(null);
              }}
              studentId={selectedStudentForTest.id}
              studentName={selectedStudentForTest.name}
              juzNumber={selectedJuzNumber}
              onSubmit={() => {
                // Refresh the data after successful submission
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