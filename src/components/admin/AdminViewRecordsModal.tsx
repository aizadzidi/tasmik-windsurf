"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { getWeekBoundaries } from "@/lib/gradeUtils";
import { authFetch } from "@/lib/authFetch";

interface Report {
  id: string;
  student_id: string;
  teacher_id: string;
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

interface AdminViewRecordsModalProps {
  student: {
    id: string;
    name: string;
  };
  onClose: () => void;
  viewMode?: 'tasmik' | 'murajaah' | 'all';
}

export default function AdminViewRecordsModal({ 
  student, 
  onClose, 
  viewMode = 'all'
}: AdminViewRecordsModalProps) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [murajaahTab, setMurajaahTab] = useState<'new' | 'old'>('new');
  const murajaahTabTouchedRef = useRef(false);

  const fetchStudentReports = useCallback(async () => {
    setLoading(true);
    try {
      // Use API route for secure admin access
      const response = await authFetch(
        `/api/admin/student-reports?studentId=${student.id}&viewMode=${viewMode}`
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error("API error:", errorData.error);
        setReports([]);
        return;
      }

      const data = await response.json();
      setReports(data || []);
    } catch (err) {
      console.error("Failed to fetch student reports:", err);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [student.id, viewMode]);

  useEffect(() => {
    fetchStudentReports();
  }, [fetchStudentReports]);

  const normalizeType = (type: string | null | undefined) => (type ?? '').trim().toLowerCase();
  const newMurajaahReports = reports.filter(r => normalizeType(r.type) === 'new murajaah');
  const oldMurajaahReports = reports.filter(r => {
    const normalized = normalizeType(r.type);
    return normalized === 'murajaah' || normalized === 'old murajaah';
  });
  useEffect(() => {
    if (viewMode !== 'murajaah') return;
    if (murajaahTabTouchedRef.current) return;
    if (murajaahTab === 'new' && newMurajaahReports.length === 0 && oldMurajaahReports.length > 0) {
      setMurajaahTab('old');
      murajaahTabTouchedRef.current = true;
    }
  }, [viewMode, murajaahTab, newMurajaahReports.length, oldMurajaahReports.length]);
  const filteredReports = viewMode === 'murajaah'
    ? (murajaahTab === 'new' ? newMurajaahReports : oldMurajaahReports)
    : reports;
  const murajaahTitle = murajaahTab === 'new' ? 'New Murajaah' : 'Old Murajaah';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white/95 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl p-6 max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">
            {viewMode === 'tasmik' ? 'Tasmi' : viewMode === 'murajaah' ? murajaahTitle : 'All'} Records for {student.name}
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

        {viewMode === 'murajaah' && !loading && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-full bg-gray-100 p-1">
              <button
                type="button"
                onClick={() => {
                  murajaahTabTouchedRef.current = true;
                  setMurajaahTab('new');
                }}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  murajaahTab === 'new' ? 'bg-emerald-600 text-white shadow-sm' : 'text-emerald-700 hover:text-emerald-800'
                }`}
              >
                New <span className="ml-1 text-[10px] opacity-80">({newMurajaahReports.length})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  murajaahTabTouchedRef.current = true;
                  setMurajaahTab('old');
                }}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  murajaahTab === 'old' ? 'bg-amber-600 text-white shadow-sm' : 'text-amber-700 hover:text-amber-800'
                }`}
              >
                Old <span className="ml-1 text-[10px] opacity-80">({oldMurajaahReports.length})</span>
              </button>
            </div>
            <div className="text-xs text-gray-500">Separate old vs new murajaah records</div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-gray-600">
            <p>Loading records...</p>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="text-center py-8 text-gray-600">
            <p>{viewMode === 'murajaah' ? `No ${murajaahTitle} records found for this student.` : 'No records found for this student.'}</p>
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
                    <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b text-sm">Teacher</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b text-sm">Date</th>
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
                      <td className="px-4 py-3 text-center text-gray-700 border-b border-gray-100 text-sm">
                        {(report as Report & { users?: { name: string } }).users?.name || 'Unknown'}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700 border-b border-gray-100">
                        <div className="text-xs">
                          <div className="font-medium">{report.date}</div>
                          <div className="text-gray-500">
                            {getWeekBoundaries(report.date).weekRange}
                          </div>
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
  );
}
