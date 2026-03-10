"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatGradeLabel, summarizeReportsByWeek } from "@/lib/parentReportUtils";
import { formatJuzTestLabel, formatJuzTestPageRange } from "@/lib/juzTestUtils";
import type { Report, ViewMode } from "@/types/teacher";
import {
  canExportOldMurajaahTestPdf,
  downloadOldMurajaahTestSnapshotPdf
} from "@/lib/oldMurajaahPdf";
import {
  getMurajaahModeFromReport,
  getMurajaahModeLabel,
  getMurajaahTestAssessmentFromReport,
  getMurajaahTestResultBadge
} from "@/lib/murajaahMode";
import { getWeekBoundaries } from "@/lib/gradeUtils";
import {
  type NormalModeMeta,
  buildNormalModeMeta,
  calculateNormalModeScore,
  getJuzTestModeLabel,
  getJuzTestPageRange,
  getNormalQuestionCount,
  getPmmmQuestionConfig,
  normalizeJuzTestMode
} from "@/lib/juzTestScoring";

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
  hizb_number?: number | null;
  test_mode?: string | null;
  page_from?: number | null;
  page_to?: number | null;
  section2_scores?: {
    memorization?: { [key: string]: number };
    middle_verse?: { [key: string]: number };
    last_words?: { [key: string]: number };
    reversal_reading?: { [key: string]: number };
    verse_position?: { [key: string]: number };
    read_verse_no?: { [key: string]: number };
    understanding?: { [key: string]: number };
    normal_meta?: Partial<NormalModeMeta>;
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
  const murajaahTabTouchedRef = useRef(false);
  const [murajaahTab, setMurajaahTab] = useState<'new' | 'old'>('new');
  const [downloadingReportId, setDownloadingReportId] = useState<string | null>(null);

  const normalizeType = (type: string | null | undefined) => (type ?? '').trim().toLowerCase();
  const newMurajaahReports = useMemo(() => (
    reports.filter(r => normalizeType(r.type) === 'new murajaah')
  ), [reports]);
  const oldMurajaahReports = useMemo(() => (
    reports.filter(r => {
      const normalized = normalizeType(r.type);
      return normalized === 'murajaah' || normalized === 'old murajaah';
    })
  ), [reports]);

  useEffect(() => {
    if (viewMode !== 'murajaah') return;
    if (murajaahTabTouchedRef.current) return;
    if (murajaahTab === 'new' && newMurajaahReports.length === 0 && oldMurajaahReports.length > 0) {
      setMurajaahTab('old');
      murajaahTabTouchedRef.current = true;
    }
  }, [viewMode, murajaahTab, newMurajaahReports.length, oldMurajaahReports.length]);

  // Memoize filtered reports to avoid unnecessary re-renders
  const filteredReports = useMemo(() => {
    if (viewMode === 'tasmik') {
      return reports.filter(r => r.type === 'Tasmi');
    } else if (viewMode === 'murajaah') {
      return murajaahTab === 'new' ? newMurajaahReports : oldMurajaahReports;
    }
    return reports;
  }, [reports, viewMode, murajaahTab, newMurajaahReports, oldMurajaahReports]);

  const murajaahTitle = murajaahTab === 'new' ? 'New Murajaah' : 'Old Murajaah';
  const weeklySummaries = useMemo(() => {
    if (viewMode === 'juz_tests') return [];
    const typeLabel = viewMode === 'tasmik' ? 'Tasmi' : murajaahTitle;
    return summarizeReportsByWeek(filteredReports, typeLabel);
  }, [filteredReports, murajaahTitle, viewMode]);

  const handleDownloadOldTestPdf = useCallback(async (report: Report) => {
    if (!canExportOldMurajaahTestPdf(report)) return;
    try {
      setDownloadingReportId(report.id);
      await downloadOldMurajaahTestSnapshotPdf(
        report,
        student.name,
        reports
      );
    } catch (error) {
      console.error("Failed to download old murajaah test snapshot:", error);
    } finally {
      setDownloadingReportId(null);
    }
  }, [reports, student.name]);

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


  // Function to render detailed scores
  const renderDetailedScores = (test: JuzTestRecord) => {
    if (!test.section2_scores) return null;

    const mode = normalizeJuzTestMode(test.test_mode);
    const isHizbTest = test.test_hizb || false;
    const fallbackRange = getJuzTestPageRange(test.juz_number, isHizbTest, test.hizb_number ?? 1);
    const pageFrom = test.page_from ?? fallbackRange.from;
    const pageTo = test.page_to ?? fallbackRange.to;

    if (mode === 'normal_memorization') {
      const normalMeta = buildNormalModeMeta({
        pageFrom,
        pageTo,
        isHizbTest,
        existingMeta: test.section2_scores.normal_meta
      });
      const score = calculateNormalModeScore(isHizbTest, normalMeta.breakdown);
      const count = getNormalQuestionCount(isHizbTest);

      return (
        <div className="mt-3 grid grid-cols-1 gap-2 text-xs">
          {Array.from({ length: count }, (_, index) => index + 1).map((question) => {
            const key = String(question);
            const questionMap = normalMeta.question_map[key];
            const breakdown = score.breakdown[key];
            const timer = normalMeta.timer[key];

            return (
              <div key={key} className="bg-white/70 rounded p-2 border border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-700">
                    Soalan {question} • {questionMap?.block_from}-{questionMap?.block_to}
                  </span>
                  <span className="font-semibold text-indigo-700">{breakdown?.question_total ?? 0}/5</span>
                </div>
                <div className="text-gray-600">
                  Hafazan: {breakdown?.hafazan ?? 0} • Quality: {breakdown?.quality ?? 0} • Page:{' '}
                  {questionMap?.selected_page ?? '-'}
                </div>
                <div className="text-gray-500">
                  Timer {timer?.elapsed_seconds ?? 0}s • Ext {timer?.extensions ?? 0} • Pause{' '}
                  {timer?.pause_count ?? 0}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    const config = getPmmmQuestionConfig(isHizbTest);
    
    return (
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        {Object.entries(config).map(([categoryKey, categoryConfig]) => {
          const categoryScores = (test.section2_scores?.[
            categoryKey as keyof typeof test.section2_scores
          ] || {}) as Record<string, number>;
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

  const headerTitle =
    viewMode === 'tasmik'
      ? 'Tasmi'
      : viewMode === 'murajaah'
      ? murajaahTitle
      : viewMode === 'juz_tests'
      ? 'Juz Test'
      : 'All';


  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-white/95 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">
            {headerTitle} Records for {student.name}
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

        {viewMode === 'murajaah' && (
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
                              {formatJuzTestLabel(test)}
                            </div>
                            {formatJuzTestPageRange(test) && (
                              <div className="text-xs text-gray-500">
                                {formatJuzTestPageRange(test)}
                              </div>
                            )}
                            <div className="mt-1">
                              <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                                {getJuzTestModeLabel(test.test_mode)}
                              </span>
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
          ) : viewMode === 'murajaah' && murajaahTab === 'old' ? (
            filteredReports.length === 0 ? (
              <div className="text-center py-8 text-gray-600">
                <p>No Old Murajaah records found for this student.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-200 shadow-lg">
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-800 border-b text-sm">Type</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b text-sm">Mode</th>
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
                      {filteredReports.map((report, index) => {
                        const mode = getMurajaahModeFromReport(report);
                        const modeLabel = getMurajaahModeLabel(mode);
                        const testAssessment = getMurajaahTestAssessmentFromReport(report);
                        const isTestRecord = mode === "test";
                        const testResultBadge = getMurajaahTestResultBadge(testAssessment);
                        const canDownloadOldTestPdf = canExportOldMurajaahTestPdf(report);
                        const isDownloadingPdf = downloadingReportId === report.id;

                        return (
                          <tr
                            key={report.id}
                            className={`transition-colors hover:bg-gray-50 ${
                              index % 2 === 0 ? 'bg-white' : 'bg-gray-25'
                            }`}
                          >
                            <td className="px-4 py-3 text-gray-700 border-b border-gray-100">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {report.type}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center text-gray-700 border-b border-gray-100">
                              <div className="text-xs">
                                <div className="font-semibold">{modeLabel}</div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-800 font-medium border-b border-gray-100 text-sm">
                              {isTestRecord ? '-' : (report.surah || '-')}
                            </td>
                            <td className="px-4 py-3 text-center text-gray-700 border-b border-gray-100">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 text-purple-800 text-xs font-semibold">
                                {report.juzuk}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center text-gray-700 border-b border-gray-100">
                              <span className="text-xs font-mono">
                                {isTestRecord ? '-' : `${report.ayat_from}-${report.ayat_to}`}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center text-gray-700 border-b border-gray-100">
                              <span className="text-xs font-mono">
                                {report.page_from && report.page_to
                                  ? `${Math.min(report.page_from, report.page_to)}-${Math.max(report.page_from, report.page_to)}`
                                  : '-'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center border-b border-gray-100">
                              {isTestRecord ? (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  testResultBadge.className
                                }`}>
                                  {testResultBadge.label}
                                </span>
                              ) : (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  report.grade === 'mumtaz' ? 'bg-green-100 text-green-800' :
                                  report.grade === 'jayyid jiddan' ? 'bg-yellow-100 text-yellow-800' :
                                  report.grade === 'jayyid' ? 'bg-orange-100 text-orange-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {formatGradeLabel(report.grade)}
                                </span>
                              )}
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
                                {canDownloadOldTestPdf && (
                                  <button
                                    onClick={() => handleDownloadOldTestPdf(report)}
                                    className={`inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors ${
                                      isDownloadingPdf ? "opacity-60 cursor-not-allowed" : ""
                                    }`}
                                    title="Download Old Test PDF"
                                    aria-label="Download Old Test PDF"
                                    disabled={isDownloadingPdf}
                                  >
                                    {isDownloadingPdf ? (
                                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <circle
                                          className="opacity-25"
                                          cx="12"
                                          cy="12"
                                          r="10"
                                          stroke="currentColor"
                                          strokeWidth="3"
                                        />
                                        <path
                                          className="opacity-75"
                                          fill="currentColor"
                                          d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
                                        />
                                      </svg>
                                    ) : (
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth="2"
                                          d="M12 16V4m0 12l-4-4m4 4l4-4M4 20h16"
                                        />
                                      </svg>
                                    )}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ) : weeklySummaries.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              <p>No {viewMode === 'murajaah' ? murajaahTitle : viewMode} records found for this student.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 shadow-lg">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-800 border-b text-sm">Type</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b text-sm">Mode</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-800 border-b text-sm">Surah</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b text-sm">Juz</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b text-sm">Ayat</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b text-sm">Page</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b text-sm">Grade</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b text-sm">Week</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {weeklySummaries.map((summary, index) => (
                      <tr key={summary.weekKey} className={`transition-colors hover:bg-gray-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-25'}`}>
                        <td className="px-4 py-3 text-gray-700 border-b border-gray-100">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {summary.typeLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-700 border-b border-gray-100 text-xs font-medium">
                          {summary.modeDisplay}
                        </td>
                        <td className="px-4 py-3 text-gray-800 font-medium border-b border-gray-100 text-sm">{summary.surahDisplay}</td>
                        <td className="px-4 py-3 text-center text-gray-700 border-b border-gray-100">
                          <span className="inline-flex items-center justify-center rounded-full bg-purple-100 text-purple-800 text-xs font-semibold px-2 py-0.5">
                            {summary.juzDisplay}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-700 border-b border-gray-100">
                          <span className="text-xs font-mono">{summary.ayatDisplay}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-700 border-b border-gray-100">
                          <span className="text-xs font-mono">
                            {summary.pageDisplay}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center border-b border-gray-100">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            summary.grade === 'mumtaz' ? 'bg-green-100 text-green-800' :
                            summary.grade === 'jayyid jiddan' ? 'bg-yellow-100 text-yellow-800' :
                            summary.grade === 'jayyid' ? 'bg-orange-100 text-orange-800' :
                            summary.grade?.includes('PASS') ? 'bg-green-100 text-green-800' :
                            summary.grade?.includes('FAIL') ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {formatGradeLabel(summary.grade)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-700 border-b border-gray-100">
                          <div className="text-xs">
                            <div className="font-medium">{summary.weekLabel}</div>
                            <div className="text-gray-500">{summary.weekRange}</div>
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
  );
}
