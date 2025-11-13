"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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

interface JuzTestRecord {
  id: string;
  student_id: string;
  juz_number: number;
  test_date: string;
  total_percentage: number;
  passed: boolean;
  examiner_name?: string;
  remarks?: string;
  test_hizb?: boolean;
  section2_scores?: {
    memorization?: { [key: string]: number };
    middle_verse?: { [key: string]: number };
    last_words?: { [key: string]: number };
    reversal_reading?: { [key: string]: number };
    verse_position?: { [key: string]: number };
    read_verse_no?: { [key: string]: number };
    understanding?: { [key: string]: number };
  };
  tajweed_score?: number;
  recitation_score?: number;
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
  userId: _userId,
  viewMode = 'tasmik'
}: ParentFullRecordsModalProps) {
  // onRefresh is not used in this component but kept for interface compatibility
  const [reports, setReports] = useState<Report[]>([]);
  const [juzTests, setJuzTests] = useState<JuzTestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoadRef = useRef(true);

  // Memoize filtered reports to avoid unnecessary re-renders
  const filteredReports = useMemo(() => {
    if (viewMode === 'tasmik') {
      return reports.filter(r => r.type === 'Tasmi');
    } else if (viewMode === 'murajaah') {
      return reports.filter(r => ['Murajaah', 'Old Murajaah', 'New Murajaah'].includes(r.type));
    }
    return reports;
  }, [reports, viewMode]);

  const fetchStudentReports = useCallback(async () => {
    if (initialLoadRef.current) {
      setLoading(true);
    }

    try {
      if (viewMode === 'juz_tests') {
        const { data, error } = await supabase
          .from('juz_tests')
          .select('*')
          .eq('student_id', student.id)
          .order('test_date', { ascending: false })
          .order('id', { ascending: false });
        if (!error && data) {
          setJuzTests(data as JuzTestRecord[]);
        } else {
          setJuzTests([]);
        }
      } else {
        const { data, error } = await supabase
          .from("reports")
          .select("*")
          .eq("student_id", student.id)
          .order("date", { ascending: false })
          .order("created_at", { ascending: false });

        if (!error && data) {
          setReports(data);
        }
      }
    } catch (error: unknown) {
      console.error("Failed to fetch student reports:", error);
    } finally {
      setLoading(false);
      initialLoadRef.current = false;
    }
  }, [student.id, viewMode]);

  useEffect(() => {
    fetchStudentReports();
  }, [fetchStudentReports]);


  // Function to get question category configuration
  const getQuestionConfig = (isHizbTest: boolean = false) => {
    if (isHizbTest) {
      return {
        memorization: { title: "Repeat and Continue / الإعادة والمتابعة", questionNumbers: [1, 2, 3] },
        middle_verse: { title: "Middle of the verse / وسط الآية", questionNumbers: [1] },
        last_words: { title: "Last of the verse / آخر الآية", questionNumbers: [1] },
        reversal_reading: { title: "Reversal reading / القراءة بالعكس", questionNumbers: [1, 2] },
        verse_position: { title: "Position of the verse / موضع الآية", questionNumbers: [1, 2] },
        read_verse_no: { title: "Read verse number / قراءة رقم الآية", questionNumbers: [1] },
        understanding: { title: "Understanding of the verse / فهم الآية", questionNumbers: [1] }
      };
    } else {
      return {
        memorization: { title: "Repeat and Continue / الإعادة والمتابعة", questionNumbers: [1, 2, 3, 4, 5] },
        middle_verse: { title: "Middle of the verse / وسط الآية", questionNumbers: [1, 2] },
        last_words: { title: "Last of the verse / آخر الآية", questionNumbers: [1, 2] },
        reversal_reading: { title: "Reversal reading / القراءة بالعكس", questionNumbers: [1, 2, 3] },
        verse_position: { title: "Position of the verse / موضع الآية", questionNumbers: [1, 2, 3] },
        read_verse_no: { title: "Read verse number / قراءة رقم الآية", questionNumbers: [1, 2, 3] },
        understanding: { title: "Understanding of the verse / فهم الآية", questionNumbers: [1, 2, 3] }
      };
    }
  };

  // Function to render detailed scores
  const renderDetailedScores = (test: JuzTestRecord) => {
    if (!test.section2_scores) return null;

    const config = getQuestionConfig(test.test_hizb || false);
    
    return (
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        {Object.entries(config).map(([categoryKey, categoryConfig]) => {
          const categoryScores = test.section2_scores?.[categoryKey as keyof typeof test.section2_scores] || {};
          const totalScore = Object.values(categoryScores).reduce((sum, score) => sum + (score || 0), 0);
          const maxScore = categoryConfig.questionNumbers.length * 5;
          const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
          
          return (
            <div key={categoryKey} className="bg-white/70 rounded p-2 border border-gray-200">
              <div className="font-medium text-gray-700 mb-1">{categoryConfig.title}</div>
              <div className="flex justify-between items-center">
                <div className="flex gap-1">
                  {categoryConfig.questionNumbers.map(questionNum => {
                    const score = categoryScores[String(questionNum)] || 0;
                    return (
                      <span key={questionNum} className={`inline-flex items-center justify-center w-5 h-5 rounded text-xs font-medium ${
                        score >= 4 ? 'bg-green-100 text-green-700' :
                        score >= 3 ? 'bg-yellow-100 text-yellow-700' :
                        score >= 1 ? 'bg-orange-100 text-orange-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {score}
                      </span>
                    );
                  })}
                </div>
                <div className={`font-semibold ${
                  percentage >= 80 ? 'text-green-600' :
                  percentage >= 60 ? 'text-yellow-600' :
                  'text-red-600'
                }`}>
                  {percentage}%
                </div>
              </div>
            </div>
          );
        })}
        
        {/* Tajweed and Recitation scores */}
        <div className="bg-white/70 rounded p-2 border border-gray-200">
          <div className="font-medium text-gray-700 mb-1">Tajweed / التجويد</div>
          <div className="flex justify-between items-center">
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-xs font-medium ${
              (test.tajweed_score || 0) >= 4 ? 'bg-green-100 text-green-700' :
              (test.tajweed_score || 0) >= 3 ? 'bg-yellow-100 text-yellow-700' :
              (test.tajweed_score || 0) >= 1 ? 'bg-orange-100 text-orange-700' :
              'bg-red-100 text-red-700'
            }`}>
              {test.tajweed_score || 0}
            </span>
            <div className="font-semibold text-gray-600">{test.tajweed_score || 0}/5</div>
          </div>
        </div>
        
        <div className="bg-white/70 rounded p-2 border border-gray-200">
          <div className="font-medium text-gray-700 mb-1">Good recitation / حسن الأداء</div>
          <div className="flex justify-between items-center">
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-xs font-medium ${
              (test.recitation_score || 0) >= 4 ? 'bg-green-100 text-green-700' :
              (test.recitation_score || 0) >= 3 ? 'bg-yellow-100 text-yellow-700' :
              (test.recitation_score || 0) >= 1 ? 'bg-orange-100 text-orange-700' :
              'bg-red-100 text-red-700'
            }`}>
              {test.recitation_score || 0}
            </span>
            <div className="font-semibold text-gray-600">{test.recitation_score || 0}/5</div>
          </div>
        </div>
      </div>
    );
  };


  if (!student) return null;

  const getViewModeTitle = () => {
    switch (viewMode) {
      case 'tasmik': return 'Tasmik Records';
      case 'murajaah': return 'Murajaah Records';
      case 'juz_tests': return 'Juz Test Records';
      default: return 'All Records';
    }
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
        <div className="overflow-y-auto overscroll-contain max-h-[calc(90vh-120px)]">
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
          ) : viewMode === 'juz_tests' ? (
            <div className="p-6">
              {juzTests.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="text-gray-400 mb-4">
                    <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-600 mb-2">No Records Found</h3>
                  <p className="text-gray-500">No Juz test records available for {student.name}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {juzTests.map((test) => (
                    <div key={test.id} className={`p-4 rounded-lg border ${test.passed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${test.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {test.passed ? 'PASSED' : 'FAILED'}
                          </span>
                          <div>
                            <div className="text-lg font-bold text-gray-800">
                              {test.test_hizb ? `Hizb ${(test.juz_number - 1) * 2 + 1}` : `Juz ${test.juz_number}`}
                            </div>
                            <div className="text-sm text-gray-600">
                              {test.examiner_name === 'Historical Entry' 
                                ? (test.passed ? 'Historical Pass' : 'Historical Fail')
                                : `Total Score: ${test.total_percentage}%`
                              }
                            </div>
                          </div>
                        </div>
                        {test.examiner_name !== 'Historical Entry' && (
                          <div className="text-right">
                            <div className="text-sm text-gray-600">{new Date(test.test_date).toLocaleDateString()}</div>
                            {test.examiner_name && (
                              <div className="text-xs text-gray-500">By: {test.examiner_name}</div>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {/* Detailed Scores Section */}
                      {test.section2_scores && (
                        <div>
                          <div className="text-sm font-semibold text-gray-700 mb-2 border-b border-gray-300 pb-1">
                            Detailed Category Breakdown:
                          </div>
                          {renderDetailedScores(test)}
                        </div>
                      )}
                      
                      {test.remarks && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <div className="text-sm text-gray-700">
                            <span className="font-medium">Remarks:</span> <em>&quot;{test.remarks}&quot;</em>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
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
              {filteredReports.length === 0 ? (
                <div className="p-8 text-center text-gray-600">No records available.</div>
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
                                {report.grade ? report.grade.charAt(0).toUpperCase() + report.grade.slice(1) : ''}
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
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
