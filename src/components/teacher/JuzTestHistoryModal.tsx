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

  const calculateTotalPercentage = (tajweedScore: number, recitationScore: number): number => {
    // Assuming each score is out of 5, total out of 10, convert to percentage
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
      const passed = totalPercentage >= 60; // Assuming 60% is passing grade

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

      // Update local state
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Juz Test History</h2>
              <p className="text-blue-100 mt-1">For {studentName}</p>
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
              {tests.map((test) => (
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

                      {test.remarks && (
                        <div className="text-sm text-gray-600 mb-2">
                          <span className="font-medium">Remarks:</span> {test.remarks}
                        </div>
                      )}

                      {(test.page_from && test.page_to) && (
                        <div className="text-sm text-gray-600">
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
                        {test.should_repeat && (
                          <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">
                            Should Repeat
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 ml-4">
                      <button
                        onClick={() => handleEdit(test)}
                        className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(test.id)}
                        className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                          deleteConfirm === test.id
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : 'bg-red-100 hover:bg-red-200 text-red-700'
                        }`}
                      >
                        {deleteConfirm === test.id ? 'Confirm' : 'Delete'}
                      </button>
                      {deleteConfirm === test.id && (
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
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

// Edit Form Component
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
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-6">
          <h3 className="text-xl font-bold">Edit Juz Test Record</h3>
          <p className="text-green-100 mt-1">Juz {test.juz_number}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Juz Number
              </label>
              <select
                value={formData.juz_number}
                onChange={(e) => setFormData({ ...formData, juz_number: parseInt(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400"
                required
              >
                {Array.from({ length: 30 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Juz {i + 1}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Test Date
              </label>
              <input
                type="date"
                value={formData.test_date}
                onChange={(e) => setFormData({ ...formData, test_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Examiner Name
              </label>
              <input
                type="text"
                value={formData.examiner_name}
                onChange={(e) => setFormData({ ...formData, examiner_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400"
                placeholder="Enter examiner name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Halaqah Name
              </label>
              <input
                type="text"
                value={formData.halaqah_name}
                onChange={(e) => setFormData({ ...formData, halaqah_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400"
                placeholder="Enter halaqah name"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tajweed Score (0-5)
              </label>
              <input
                type="number"
                min="0"
                max="5"
                value={formData.tajweed_score}
                onChange={(e) => setFormData({ ...formData, tajweed_score: parseInt(e.target.value) || 0 })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Recitation Score (0-5)
              </label>
              <input
                type="number"
                min="0"
                max="5"
                value={formData.recitation_score}
                onChange={(e) => setFormData({ ...formData, recitation_score: parseInt(e.target.value) || 0 })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400"
                required
              />
            </div>
          </div>

          {/* Score Preview */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm text-gray-600 mb-2">Score Preview:</div>
            <div className="text-lg font-semibold">
              Total: {totalPercentage}% 
              <span className={`ml-2 px-2 py-1 rounded text-sm ${
                willPass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {willPass ? 'PASS' : 'FAIL'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Page From
              </label>
              <input
                type="number"
                min="1"
                max="604"
                value={formData.page_from || ''}
                onChange={(e) => setFormData({ ...formData, page_from: parseInt(e.target.value) || undefined })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400"
                placeholder="Optional"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Page To
              </label>
              <input
                type="number"
                min="1"
                max="604"
                value={formData.page_to || ''}
                onChange={(e) => setFormData({ ...formData, page_to: parseInt(e.target.value) || undefined })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400"
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.test_juz}
                onChange={(e) => setFormData({ ...formData, test_juz: e.target.checked })}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Juz Test</span>
            </label>

            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.test_hizb}
                onChange={(e) => setFormData({ ...formData, test_hizb: e.target.checked })}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Hizb Test</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Remarks
            </label>
            <textarea
              value={formData.remarks}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400"
              rows={3}
              placeholder="Optional remarks or notes..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}