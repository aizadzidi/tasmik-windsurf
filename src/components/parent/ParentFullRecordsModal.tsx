"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getWeekBoundaries } from "@/lib/gradeUtils";
import type { ViewMode } from "@/types/teacher";

interface Report {
  id: string;
  student_id: string;
  type: string;
  surah: string;
  juzuk: number | null;
  ayat_from: number;
  ayat_to: number;
  page_from: number | null;
  page_to: number | null;
  grade: string | null;
  date: string;
}

interface ParentFullRecordsModalProps {
  student: {
    id: string;
    name: string;
  };
  onClose: () => void;
  onRefresh: () => void;
  userId: string;
  viewMode?: ViewMode;
}

export default function ParentFullRecordsModal({ 
  student, 
  onClose, 
  onRefresh: _onRefresh,
  userId,
  viewMode = 'tasmik'
}: ParentFullRecordsModalProps) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    fetchStudentReports();
  }, [student.id, userId, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Memoize filtered reports to avoid unnecessary re-renders
  const filteredReports = useMemo(() => {
    if (viewMode === 'tasmik') {
      return reports.filter(r => r.type === 'Tasmi');
    } else if (viewMode === 'murajaah') {
      return reports.filter(r => ['Murajaah', 'Old Murajaah', 'New Murajaah'].includes(r.type));
    }
    return reports;
  }, [reports, viewMode]);

  const fetchStudentReports = async () => {
    // Only show loading spinner on initial load, not on view mode changes
    if (initialLoad) {
      setLoading(true);
    }
    
    try {
      // Fetch all reports for this student
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .eq("student_id", student.id)
        .order("date", { ascending: false });
      
      if (!error && data) {
        setReports(data);
      }
    } catch (err) {
      console.error("Failed to fetch student reports:", err);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  };

  const getGradeColor = (grade: string | null) => {
    if (!grade) return 'text-gray-400';
    switch (grade.toLowerCase()) {
      case 'mumtaz': return 'text-emerald-600';
      case 'jayyid jiddan': return 'text-blue-600';
      case 'jayyid': return 'text-amber-600';
      default: return 'text-gray-600';
    }
  };

  const getGradeBgColor = (grade: string | null) => {
    if (!grade) return 'bg-gray-100';
    switch (grade.toLowerCase()) {
      case 'mumtaz': return 'bg-emerald-50';
      case 'jayyid jiddan': return 'bg-blue-50';
      case 'jayyid': return 'bg-amber-50';
      default: return 'bg-gray-50';
    }
  };

  // Group reports by week
  const reportsByWeek = useMemo(() => {
    const grouped = filteredReports.reduce((acc, report) => {
      const { monday, friday } = getWeekBoundaries(report.date);
      const weekKey = monday;
      
      if (!acc[weekKey]) {
        acc[weekKey] = {
          weekStart: monday,
          weekEnd: friday,
          reports: []
        };
      }
      acc[weekKey].reports.push(report);
      return acc;
    }, {} as Record<string, { weekStart: string; weekEnd: string; reports: Report[] }>);
    
    // Sort by week (most recent first)
    return Object.values(grouped).sort((a, b) => 
      new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime()
    );
  }, [filteredReports]);

  if (!student) return null;

  const getViewModeTitle = () => {
    switch (viewMode) {
      case 'tasmik': return 'Tasmik Records';
      case 'murajaah': return 'Murajaah Records';
      case 'juz_tests': return 'Juz Test Records';
      default: return 'All Records';
    }
  };

  const formatPageRange = (pageFrom: number | null, pageTo: number | null) => {
    if (!pageFrom && !pageTo) return '';
    if (pageFrom && pageTo) {
      if (pageFrom === pageTo) return `Page ${pageFrom}`;
      return `Pages ${Math.min(pageFrom, pageTo)}-${Math.max(pageFrom, pageTo)}`;
    }
    return `Page ${pageFrom || pageTo}`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">{getViewModeTitle()}</h2>
              <p className="text-blue-100 text-sm">Child: {student.name}</p>
            </div>
            <button
              onClick={onClose}
              className="text-white/70 hover:text-white transition-colors rounded-lg p-2 hover:bg-white/10"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
          {loading ? (
            <div className="p-6">
              <div className="animate-pulse space-y-4">
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-16 bg-gray-200 rounded"></div>
                  ))}
                </div>
              </div>
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-gray-400 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-600 mb-2">No Records Found</h3>
              <p className="text-gray-500">No {viewMode} records available for {student.name}</p>
            </div>
          ) : (
            <div className="p-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-600">{filteredReports.length}</div>
                  <div className="text-blue-700 font-medium">Total Records</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-600">
                    {filteredReports.filter(r => r.grade === 'mumtaz').length}
                  </div>
                  <div className="text-green-700 font-medium">Mumtaz Grades</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-purple-600">{reportsByWeek.length}</div>
                  <div className="text-purple-700 font-medium">Active Weeks</div>
                </div>
              </div>

              {/* Records by Week */}
              <div className="space-y-6">
                {reportsByWeek.map(({ weekStart, weekEnd, reports: weekReports }) => (
                  <div key={weekStart} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                      <h3 className="font-semibold text-gray-800">
                        Week of {new Date(weekStart).toLocaleDateString()} - {new Date(weekEnd).toLocaleDateString()}
                      </h3>
                      <p className="text-sm text-gray-600">{weekReports.length} record{weekReports.length !== 1 ? 's' : ''}</p>
                    </div>
                    
                    <div className="divide-y divide-gray-100">
                      {weekReports.map((report) => (
                        <div key={report.id} className={`p-4 hover:bg-gray-50 transition-colors ${getGradeBgColor(report.grade)}`}>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3 mb-2">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  report.type === 'Tasmi' 
                                    ? 'bg-green-100 text-green-700' 
                                    : 'bg-blue-100 text-blue-700'
                                }`}>
                                  {report.type}
                                </span>
                                <span className="text-sm text-gray-600">
                                  {new Date(report.date).toLocaleDateString()}
                                </span>
                                {report.grade && (
                                  <span className={`text-sm font-medium ${getGradeColor(report.grade)}`}>
                                    {report.grade}
                                  </span>
                                )}
                              </div>
                              
                              <div className="text-gray-800 font-medium mb-1">{report.surah}</div>
                              
                              <div className="flex items-center space-x-4 text-sm text-gray-600">
                                <span>Ayat: {report.ayat_from}-{report.ayat_to}</span>
                                {report.juzuk && <span>Juz: {report.juzuk}</span>}
                                {(report.page_from || report.page_to) && (
                                  <span>{formatPageRange(report.page_from, report.page_to)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}