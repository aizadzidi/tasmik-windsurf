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
}

interface EditJuzTestFormData {
  juz_number: number;
  test_date: string;
  examiner_name: string;
  halaqah_name: string;
  tajweed_score: number;
  recitation_score: number;
  remarks: string;
  page_from?: number;
  page_to?: number;
  test_juz: boolean;
  test_hizb: boolean;
}

interface JuzTestHistoryModalProps {
  studentId: string;
  studentName: string;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

export default function JuzTestHistoryModal({ 
  studentId, 
  studentName, 
  isOpen, 
  onClose,
  onRefresh 
}: JuzTestHistoryModalProps) {
  const [tests, setTests] = useState<JuzTest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingTest, setEditingTest] = useState<JuzTest | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
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

  const calculateTotalPercentage = (tajweedScore: number, recitationScore: number): number => {
    const total = tajweedScore + recitationScore;
    return Math.round((total / 10) * 100);
  };

  const handleEdit = (test: JuzTest) => {
    setEditingTest(test);
    setShowEditForm(true);
  };

  const handleDelete = async (testId: string) => {
    if (deleteConfirm !== testId) {
      setDeleteConfirm(testId);
      return;
    }

    try {
      const { error } = await supabase
        .from('juz_tests')
        .delete()
        .eq('id', testId);

      if (error) throw error;

      setTests(tests.filter(test => test.id !== testId));
      setDeleteConfirm(null);
      onRefresh?.();
    } catch (error) {
      console.error('Error deleting test:', error);
      alert('Failed to delete test record. Please try again.');
    }
  };

  const handleSaveEdit = async (formData: EditJuzTestFormData) => {
    if (!editingTest) return;

    try {
      const totalPercentage = calculateTotalPercentage(formData.tajweed_score, formData.recitation_score);
      const passed = totalPercentage >= 60;

      const updateData = {
        juz_number: formData.juz_number,
        test_date: formData.test_date,
        examiner_name: formData.examiner_name || undefined,
        halaqah_name: formData.halaqah_name || undefined,
        tajweed_score: formData.tajweed_score,
        recitation_score: formData.recitation_score,
        total_percentage: totalPercentage,
        passed: passed,
        remarks: formData.remarks || undefined,
        page_from: formData.page_from || undefined,
        page_to: formData.page_to || undefined,
        test_juz: formData.test_juz,
        test_hizb: formData.test_hizb
      };

      const { error } = await supabase
        .from('juz_tests')
        .update(updateData)
        .eq('id', editingTest.id);

      if (error) throw error;

      setTests(tests.map(test => 
        test.id === editingTest.id 
          ? { ...test, ...updateData } as JuzTest
          : test
      ));

      setShowEditForm(false);
      setEditingTest(null);
      onRefresh?.();
    } catch (error) {
      console.error('Error updating test:', error);
      alert('Failed to update test record. Please try again.');
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-hidden">
        
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
                    <div className="flex items-center gap-2">
                      <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                        test.passed 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {test.total_percentage}%
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleEdit(test)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit test"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(test.id)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            deleteConfirm === test.id
                              ? 'text-white bg-red-600 hover:bg-red-700'
                              : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                          }`}
                          title={deleteConfirm === test.id ? 'Click again to confirm' : 'Delete test'}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
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

                  {test.should_repeat && (
                    <div className="mt-2">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                        Needs Repetition
                      </span>
                    </div>
                  )}

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

      {/* Edit Form Modal */}
      {showEditForm && editingTest && (
        <EditJuzTestForm
          test={editingTest}
          onSave={handleSaveEdit}
          onCancel={() => {
            setShowEditForm(false);
            setEditingTest(null);
          }}
        />
      )}
    </div>
  );
}

// Edit Form Component - Simplified
interface EditJuzTestFormProps {
  test: JuzTest;
  onSave: (formData: EditJuzTestFormData) => void;
  onCancel: () => void;
}

function EditJuzTestForm({ test, onSave, onCancel }: EditJuzTestFormProps) {
  const [formData, setFormData] = useState<EditJuzTestFormData>({
    juz_number: test.juz_number,
    test_date: test.test_date,
    examiner_name: test.examiner_name || '',
    halaqah_name: test.halaqah_name || '',
    tajweed_score: test.tajweed_score || 0,
    recitation_score: test.recitation_score || 0,
    remarks: test.remarks || '',
    page_from: test.page_from,
    page_to: test.page_to,
    test_juz: test.test_juz || true,
    test_hizb: test.test_hizb || false
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const totalPercentage = Math.round(((formData.tajweed_score + formData.recitation_score) / 10) * 100);
  const willPass = totalPercentage >= 60;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Edit Test Record</h3>
          <p className="text-gray-500 text-sm">Juz {test.juz_number}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Juz Number</label>
              <select
                value={formData.juz_number}
                onChange={(e) => setFormData({ ...formData, juz_number: parseInt(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                {Array.from({ length: 30 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>Juz {i + 1}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Test Date</label>
              <input
                type="date"
                value={formData.test_date}
                onChange={(e) => setFormData({ ...formData, test_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Examiner Name</label>
            <input
              type="text"
              value={formData.examiner_name}
              onChange={(e) => setFormData({ ...formData, examiner_name: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter examiner name"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tajweed Score</label>
              <input
                type="number"
                min="0"
                max="5"
                value={formData.tajweed_score}
                onChange={(e) => setFormData({ ...formData, tajweed_score: parseInt(e.target.value) || 0 })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Recitation Score</label>
              <input
                type="number"
                min="0"
                max="5"
                value={formData.recitation_score}
                onChange={(e) => setFormData({ ...formData, recitation_score: parseInt(e.target.value) || 0 })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {/* Score Preview */}
          <div className={`p-3 rounded-lg ${willPass ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="text-sm text-gray-600 mb-1">Total Score:</div>
            <div className={`font-semibold ${willPass ? 'text-green-700' : 'text-red-700'}`}>
              {totalPercentage}% - {willPass ? 'PASS' : 'FAIL'}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
            <textarea
              value={formData.remarks}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Optional remarks or notes..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}