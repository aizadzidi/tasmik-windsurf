"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface JuzTest {
  id: string;
  student_id: string;
  juz_number: number;
  test_date: string;
  examiner_name?: string;
  halaqah_name?: string;
  passed: boolean;
  total_percentage: number;
  tajweed_score?: number;
  recitation_score?: number;
  should_repeat?: boolean;
  remarks?: string;
  page_from?: number;
  page_to?: number;
  test_juz?: boolean;
  test_hizb?: boolean;
  section2_scores?: Record<string, Record<string, number>>;
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
  const [expandedTest, setExpandedTest] = useState<string | null>(null);

  // Fetch tests when modal opens
  useEffect(() => {
    if (isOpen && studentId) {
      fetchTests();
    }
  }, [isOpen, studentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTests = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('juz_tests')
        .select('*')
        .eq('student_id', studentId)
        .order('test_date', { ascending: false });

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
  };

  const renderDetailedScores = (test: JuzTest) => {
    if (!test.section2_scores) return null;

    const scores = test.section2_scores;
    const categories = ['memorization', 'tajweed', 'recitation', 'fluency', 'understanding'];

    return (
      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-medium text-gray-800 mb-3">Detailed Assessment Scores</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {categories.map((category) => {
            const categoryScores = scores[category];
            if (!categoryScores) return null;

            return (
              <div key={category} className="border border-gray-200 rounded p-3">
                <h5 className="font-medium text-sm text-gray-700 mb-2 capitalize">
                  {category}
                </h5>
                <div className="grid grid-cols-5 gap-2 text-xs">
                  {Object.entries(categoryScores).map(([item, score]) => (
                    <div key={item} className="text-center">
                      <div className="text-gray-600">Q{item}</div>
                      <div className={`font-medium ${
                        Number(score) >= 4 ? 'text-green-600' :
                        Number(score) >= 3 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
{String(score)}/5
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const getImprovementAreas = (test: JuzTest): string[] => {
    if (!test.section2_scores) return [];

    const areas: string[] = [];
    const scores = test.section2_scores;

    // Check each category for low scores
    Object.entries(scores).forEach(([category, categoryScores]: [string, Record<string, number>]) => {
      if (categoryScores && typeof categoryScores === 'object') {
        const lowScores = Object.entries(categoryScores).filter(([, score]) => Number(score) < 3);
        if (lowScores.length > 0) {
          areas.push(`${category.charAt(0).toUpperCase() + category.slice(1)}: Questions ${lowScores.map(([q]) => q).join(', ')}`);
        }
      }
    });

    return areas;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Juz Test History</h2>
              <p className="text-blue-100 mt-1">For {studentName}</p>
              <p className="text-blue-200 text-sm mt-1">View detailed test results and areas for improvement</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 text-2xl font-bold"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {loading ? (
            <div className="text-center py-8">
              <p className="text-gray-600">Loading test history...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={fetchTests}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Try Again
              </button>
            </div>
          ) : tests.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-2">No test records found.</p>
              <p className="text-sm text-gray-500">
                This student hasn&apos;t taken any Juz tests yet.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {tests.map((test) => {
                const improvementAreas = getImprovementAreas(test);
                const isExpanded = expandedTest === test.id;

                return (
                  <div
                    key={test.id}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-2">
                          <h3 className="text-lg font-semibold text-gray-800">
                            Juz {test.juz_number}
                          </h3>
                          <span
                            className={`px-3 py-1 rounded-full text-sm font-medium ${
                              test.passed
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {test.total_percentage}% ({test.passed ? 'PASSED' : 'FAILED'})
                          </span>
                          {test.should_repeat && (
                            <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">
                              Needs Repetition
                            </span>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600 mb-3">
                          <div>
                            <span className="font-medium">Date:</span> {new Date(test.test_date).toLocaleDateString()}
                          </div>
                          <div>
                            <span className="font-medium">Examiner:</span> {test.examiner_name || 'Unknown'}
                          </div>
                          <div>
                            <span className="font-medium">Tajweed:</span> {test.tajweed_score || 0}/5
                          </div>
                          <div>
                            <span className="font-medium">Recitation:</span> {test.recitation_score || 0}/5
                          </div>
                        </div>

                        {test.halaqah_name && (
                          <div className="text-sm text-gray-600 mb-2">
                            <span className="font-medium">Halaqah:</span> {test.halaqah_name}
                          </div>
                        )}

                        {/* Areas for Improvement */}
                        {improvementAreas.length > 0 && (
                          <div className="mb-3">
                            <h4 className="text-sm font-medium text-orange-700 mb-2">Areas for Improvement:</h4>
                            <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                              {improvementAreas.map((area, index) => (
                                <li key={index}>{area}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {test.remarks && (
                          <div className="text-sm text-gray-600 mb-2">
                            <span className="font-medium">Examiner Remarks:</span> 
                            <p className="mt-1 p-2 bg-yellow-50 rounded text-gray-700">
                              {test.remarks}
                            </p>
                          </div>
                        )}

                        {(test.page_from && test.page_to) && (
                          <div className="text-sm text-gray-600 mb-2">
                            <span className="font-medium">Pages:</span> {test.page_from} - {test.page_to}
                          </div>
                        )}

                        <div className="flex gap-2 mt-2">
                          {test.test_juz && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                              Juz Test
                            </span>
                          )}
                          {test.test_hizb && (
                            <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                              Hizb Test
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 ml-4">
                        <button
                          onClick={() => setExpandedTest(isExpanded ? null : test.id)}
                          className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                        >
                          {isExpanded ? 'Hide Details' : 'Show Details'}
                        </button>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && renderDetailedScores(test)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}