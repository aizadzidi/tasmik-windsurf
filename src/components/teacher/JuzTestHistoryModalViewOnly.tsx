"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

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

  // Fetch tests when modal opens
  useEffect(() => {
    if (isOpen && studentId) {
      fetchTests();
    }
  }, [isOpen, studentId]);

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

  // Simple filter by search term
  const filteredTests = tests.filter(test => 
    test.juz_number.toString().includes(searchTerm) ||
    (test.examiner_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const passedCount = tests.filter(t => t.passed).length;
  const totalTests = tests.length;

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
        <div className="overflow-y-auto max-h-[calc(85vh-140px)] p-6">
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
                  <p className="text-gray-500 text-sm">This student hasn't taken any Juz tests yet</p>
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
            <div className="space-y-3">
              {filteredTests.map((test) => (
                <div
                  key={test.id}
                  className="border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium ${
                        test.passed ? 'bg-green-500' : 'bg-red-500'
                      }`}>
                        {test.juz_number}
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">Juz {test.juz_number}</h3>
                        <p className="text-sm text-gray-500">
                          {new Date(test.test_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                        test.passed 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {test.total_percentage}%
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Examiner:</span>
                      <p className="font-medium">{test.examiner_name || 'Not specified'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Scores:</span>
                      <p className="font-medium">
                        T: {test.tajweed_score || 0}/5 • R: {test.recitation_score || 0}/5
                      </p>
                    </div>
                  </div>

                  {test.remarks && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-sm text-gray-600 italic">"{test.remarks}"</p>
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