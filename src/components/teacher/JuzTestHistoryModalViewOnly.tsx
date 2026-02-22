"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { formatJuzTestLabel, formatJuzTestPageRange, getDisplayHizbNumber } from '@/lib/juzTestUtils';
import {
  type NormalModeMeta,
  buildNormalModeMeta,
  calculateNormalModeScore,
  getJuzTestModeLabel,
  getJuzTestPageRange,
  getNormalQuestionCount,
  getPmmmQuestionConfig,
  normalizeJuzTestMode
} from '@/lib/juzTestScoring';

interface JuzTest {
  id: string;
  student_id: string;
  juz_number: number;
  test_date: string;
  examiner_name?: string;
  passed: boolean;
  total_percentage: number;
  tajweed_score?: number;
  recitation_score?: number;
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
}

interface JuzTestHistoryModalViewOnlyProps {
  studentId: string;
  studentName: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function JuzTestHistoryModalViewOnly({ 
  studentId, 
  studentName, 
  isOpen, 
  onClose
}: JuzTestHistoryModalViewOnlyProps) {
  const [tests, setTests] = useState<JuzTest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchTests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('juz_tests')
        .select('*')
        .eq('student_id', studentId)
        .order('test_date', { ascending: false })
        .order('id', { ascending: false });

      if (error) {
        if (error.message?.includes('relation "public.juz_tests" does not exist')) {
          setError('Juz testing system is not set up yet.');
          setTests([]);
        } else {
          throw error;
        }
      } else {
        setTests(data || []);
      }
    } catch (err) {
      console.error('Error fetching test history:', err);
      setError('Failed to load test history. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  // Fetch tests when modal opens
  useEffect(() => {
    if (isOpen && studentId) {
      fetchTests();
    }
  }, [fetchTests, isOpen, studentId]);

  // Simple filter by search term
  const filteredTests = tests.filter(test => 
    (test.test_hizb
      ? (getDisplayHizbNumber(test) ?? test.juz_number).toString().includes(searchTerm)
      : test.juz_number.toString().includes(searchTerm)) ||
    (test.examiner_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const passedCount = tests.filter(t => t.passed).length;
  const totalTests = tests.length;

  // Function to render detailed scores
  const renderDetailedScores = (test: JuzTest) => {
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
                  Elapsed {timer?.elapsed_seconds ?? 0}s • Ext {timer?.extensions ?? 0} • Pause{' '}
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden">
        
        {/* Header */}
        <div className="bg-white border-b border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{studentName}</h2>
              <p className="text-gray-500 text-sm">Juz Test History</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {totalTests > 0 && (
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>{totalTests} tests completed</span>
              <span>•</span>
              <span>{passedCount} passed</span>
            </div>
          )}

          {/* Simple Search */}
          {totalTests > 0 && (
            <div className="mt-4">
              <input
                type="text"
                placeholder="Search by Juz number or examiner..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="overflow-y-auto overscroll-contain max-h-[calc(85vh-140px)] p-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-600 mt-3">Loading tests...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-red-500 mb-3">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={fetchTests}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : filteredTests.length === 0 ? (
            <div className="text-center py-12">
              {tests.length === 0 ? (
                <>
                  <div className="text-gray-300 mb-4">
                    <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="text-gray-600 mb-2">No test records found</p>
                  <p className="text-gray-500 text-sm">This student hasn&apos;t taken any Juz tests yet</p>
                </>
              ) : (
                <>
                  <p className="text-gray-600 mb-2">No tests match your search</p>
                  <button
                    onClick={() => setSearchTerm('')}
                    className="text-blue-500 hover:text-blue-600 text-sm"
                  >
                    Clear search
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTests.map((test) => (
                <div
                  key={test.id}
                  className="border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                        test.passed ? 'bg-green-500' : 'bg-red-500'
                      }`}>
                        {test.test_hizb ? (getDisplayHizbNumber(test) ?? test.juz_number) : test.juz_number}
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-gray-900">
                          {formatJuzTestLabel(test)}
                        </h3>
                        <div className="mt-1">
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                            {getJuzTestModeLabel(test.test_mode)}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1">
                          {formatJuzTestPageRange(test) && (
                            <p className="text-xs text-gray-500">
                              {formatJuzTestPageRange(test)}
                            </p>
                          )}
                          {test.examiner_name !== 'Historical Entry' && (
                            <p className="text-sm text-gray-500">
                              {new Date(test.test_date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </p>
                          )}
                          <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium w-fit ${
                            test.passed 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {test.examiner_name === 'Historical Entry' 
                              ? (test.passed ? 'Historical Pass' : 'Historical Fail') 
                              : `${test.total_percentage}% ${test.passed ? 'PASSED' : 'FAILED'}`}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {test.examiner_name !== 'Historical Entry' && (
                    <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                      <div>
                        <span className="text-gray-500">Examiner:</span>
                        <p className="font-medium">{test.examiner_name || 'Not specified'}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Summary Scores:</span>
                        <p className="font-medium">
                          Tajweed: {test.tajweed_score || 0}/5 • Recitation: {test.recitation_score || 0}/5
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Detailed Scores Section */}
                  {test.section2_scores && (
                    <div>
                      <div className="text-sm font-semibold text-gray-700 mb-2 border-b border-gray-200 pb-1">
                        Detailed Category Breakdown:
                      </div>
                      {renderDetailedScores(test)}
                    </div>
                  )}

                  {test.examiner_name !== 'Historical Entry' && test.remarks && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Remarks:</span> <em>&quot;{test.remarks}&quot;</em>
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
