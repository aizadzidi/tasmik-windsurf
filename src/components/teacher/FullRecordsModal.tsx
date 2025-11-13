"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
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

interface FullRecordsModalProps {
  student: {
    id: string;
    name: string;
  };
  onClose: () => void;
  onEdit: (report: Report) => void;
  onRefresh: () => void;
  userId: string;
  viewMode?: ViewMode;
}

export default function FullRecordsModal({ 
  student, 
  onClose, 
  onEdit, 
  onRefresh,
  userId,
  viewMode = 'tasmik'
}: FullRecordsModalProps) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [deletingReport, setDeletingReport] = useState<Report | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fetchStudentReports = useCallback(async () => {
    // Only show loading spinner on initial load, not on view mode changes
    if (initialLoad) {
      setLoading(true);
    }
    
    try {
      // Fetch all reports for this student/teacher combo (no filtering by type)
      // We'll filter in memory for faster view mode switching
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .eq("student_id", student.id)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      
      if (!error && data) {
        setReports(data);
      }
    } catch (err) {
      console.error("Failed to fetch student reports:", err);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, [initialLoad, student.id]);

  useEffect(() => {
    fetchStudentReports();
  }, [fetchStudentReports, student.id, userId, viewMode]);

  // Memoize filtered reports to avoid unnecessary re-renders
  const filteredReports = useMemo(() => {
    if (viewMode === 'tasmik') {
      return reports.filter(r => r.type === 'Tasmi');
    } else if (viewMode === 'murajaah') {
      return reports.filter(r => ['Murajaah', 'Old Murajaah', 'New Murajaah'].includes(r.type));
    }
    return reports;
  }, [reports, viewMode]);

  const handleDelete = async (reportId: string) => {
    try {
      const { error } = await supabase
        .from("reports")
        .delete()
        .eq("id", reportId);
      
      if (!error) {
        setReports(reports.filter(r => r.id !== reportId));
        onRefresh(); // Refresh the main view
        setShowDeleteConfirm(false);
        setDeletingReport(null);
      }
    } catch (err) {
      console.error("Failed to delete report:", err);
    }
  };

  const confirmDelete = (report: Report) => {
    setDeletingReport(report);
    setShowDeleteConfirm(true);
  };

  const handleEdit = (report: Report) => {
    onEdit(report);
    onClose(); // Close this modal when opening edit modal
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
        <div className="bg-white/95 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-900">
              {viewMode === 'tasmik' ? 'Tasmi' : viewMode === 'murajaah' ? 'Murajaah' : 'All'} Records for {student.name}
            </h3>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="overflow-y-auto overscroll-contain max-h-[calc(90vh-120px)]">
            {loading ? (
              <div className="animate-pulse space-y-4">
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex space-x-4">
                      <div className="h-8 bg-gray-200 rounded w-16"></div>
                      <div className="h-8 bg-gray-200 rounded w-32"></div>
                      <div className="h-8 bg-gray-200 rounded w-12"></div>
                      <div className="h-8 bg-gray-200 rounded w-20"></div>
                      <div className="h-8 bg-gray-200 rounded w-16"></div>
                      <div className="h-8 bg-gray-200 rounded w-16"></div>
                      <div className="h-8 bg-gray-200 rounded w-20"></div>
                      <div className="h-8 bg-gray-200 rounded w-16"></div>
                    </div>
                  ))}
                </div>
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="text-center py-8 text-gray-600">
                <p>No {viewMode === 'tasmik' ? 'Tasmi' : viewMode === 'murajaah' ? 'Murajaah' : ''} records found for this student.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-200 shadow-lg">
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-800 border-b text-sm">Type</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-800 border-b text-sm">Surah</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b text-sm">Juz</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b text-sm">Ayat</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b text-sm">Page</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b text-sm">Grade</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b text-sm">Date</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b text-sm">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {filteredReports.map((report, index) => (
                        <tr key={report.id} className={`transition-colors hover:bg-gray-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-25'}`}>
                          <td className="px-4 py-3 text-gray-700 border-b border-gray-100">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {report.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-800 font-medium border-b border-gray-100 text-sm">{report.surah}</td>
                          <td className="px-4 py-3 text-center text-gray-700 border-b border-gray-100">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 text-purple-800 text-xs font-semibold">
                              {report.juzuk}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-700 border-b border-gray-100">
                            <span className="text-xs font-mono">{report.ayat_from}-{report.ayat_to}</span>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-700 border-b border-gray-100">
                            <span className="text-xs font-mono">
                              {report.page_from && report.page_to ? 
                                `${Math.min(report.page_from, report.page_to)}-${Math.max(report.page_from, report.page_to)}` : 
                                '-'
                              }
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center border-b border-gray-100">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              report.grade === 'mumtaz' ? 'bg-green-100 text-green-800' :
                              report.grade === 'jayyid jiddan' ? 'bg-yellow-100 text-yellow-800' :
                              report.grade === 'jayyid' ? 'bg-orange-100 text-orange-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {report.grade ? report.grade.charAt(0).toUpperCase() + report.grade.slice(1) : ""}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-700 border-b border-gray-100">
                            <div className="text-xs">
                              <div className="font-medium">{report.date}</div>
                              <div className="text-gray-500">
                                {getWeekBoundaries(report.date).weekRange}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center border-b border-gray-100">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleEdit(report)}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
                                title="Edit"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16.862 5.487a2.25 2.25 0 113.182 3.182l-8.25 8.25a2 2 0 01-.879.513l-4.25 1.25 1.25-4.25a2 2 0 01.513-.879l8.25-8.25z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => confirmDelete(report)}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                                title="Delete"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12zm3-9v6m4-6v6m5-8V5a2 2 0 00-2-2H8a2 2 0 00-2 2v2h14z" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end mt-6">
              <button
                onClick={onClose}
                className="px-6 py-2 rounded-lg text-gray-700 bg-gray-200 hover:bg-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deletingReport && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-60">
          <div className="bg-white p-6 rounded-xl shadow-xl max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4 text-gray-900">Confirm Deletion</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this {deletingReport.type} report for {deletingReport.surah}? 
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowDeleteConfirm(false)} 
                className="px-4 py-2 rounded-lg text-gray-700 bg-gray-200 hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleDelete(deletingReport.id)} 
                className="px-4 py-2 rounded-lg text-white bg-red-600 hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
