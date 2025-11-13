"use client";

import React, { useState, useEffect, useCallback } from 'react';

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
  section2_scores?: {
    memorization?: { [key: string]: number };
    middle_verse?: { [key: string]: number };
    last_words?: { [key: string]: number };
    reversal_reading?: { [key: string]: number };
    verse_position?: { [key: string]: number };
    read_verse_no?: { [key: string]: number };
    understanding?: { [key: string]: number };
  };
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
  section2_scores?: {
    memorization?: { [key: string]: number };
    middle_verse?: { [key: string]: number };
    last_words?: { [key: string]: number };
    reversal_reading?: { [key: string]: number };
    verse_position?: { [key: string]: number };
    read_verse_no?: { [key: string]: number };
    understanding?: { [key: string]: number };
  };
  should_repeat?: boolean;
  passed?: boolean;
  total_percentage?: number;
}

interface EditJuzTestFormProps {
  test: JuzTest;
  onSave: (formData: EditJuzTestFormData) => void;
  onCancel: () => void;
}

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

export default function EditJuzTestForm({ test, onSave, onCancel }: EditJuzTestFormProps) {
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
    test_juz: test.test_juz !== false,
    test_hizb: test.test_hizb || false,
    section2_scores: test.section2_scores || {},
    should_repeat: test.should_repeat || false,
    passed: test.passed,
    total_percentage: test.total_percentage
  });

  // Initialize section2 scores if they don't exist
  const [section2Scores, setSection2Scores] = useState(() => {
    const config = getQuestionConfig(formData.test_hizb);
    const defaultScores: { [key: string]: { [key: string]: number } } = {};
    
    Object.entries(config).forEach(([category, categoryConfig]) => {
      defaultScores[category] = {};
      categoryConfig.questionNumbers.forEach(questionNum => {
        defaultScores[category][String(questionNum)] = 
          test.section2_scores?.[category as keyof typeof test.section2_scores]?.[String(questionNum)] || 0;
      });
    });
    
    return defaultScores;
  });

  // Calculate page range based on test type and juz number
  const calculatePageRange = useCallback(() => {
    const juzRanges = {
      1: { startPage: 1, endPage: 21 }, 2: { startPage: 22, endPage: 42 }, 3: { startPage: 43, endPage: 63 },
      4: { startPage: 64, endPage: 84 }, 5: { startPage: 85, endPage: 105 }, 6: { startPage: 106, endPage: 126 },
      7: { startPage: 127, endPage: 147 }, 8: { startPage: 148, endPage: 168 }, 9: { startPage: 169, endPage: 189 },
      10: { startPage: 190, endPage: 210 }, 11: { startPage: 211, endPage: 231 }, 12: { startPage: 232, endPage: 252 },
      13: { startPage: 253, endPage: 273 }, 14: { startPage: 274, endPage: 294 }, 15: { startPage: 295, endPage: 315 },
      16: { startPage: 316, endPage: 336 }, 17: { startPage: 337, endPage: 357 }, 18: { startPage: 358, endPage: 378 },
      19: { startPage: 379, endPage: 399 }, 20: { startPage: 400, endPage: 420 }, 21: { startPage: 421, endPage: 441 },
      22: { startPage: 442, endPage: 462 }, 23: { startPage: 463, endPage: 483 }, 24: { startPage: 484, endPage: 504 },
      25: { startPage: 505, endPage: 525 }, 26: { startPage: 526, endPage: 546 }, 27: { startPage: 547, endPage: 567 },
      28: { startPage: 568, endPage: 588 }, 29: { startPage: 589, endPage: 599 }, 30: { startPage: 600, endPage: 604 }
    };
    
    const range = juzRanges[formData.juz_number as keyof typeof juzRanges];
    if (!range) return { from: 0, to: 0 };
    
    if (formData.test_hizb) {
      const totalPages = range.endPage - range.startPage + 1;
      const firstHalfSize = Math.ceil(totalPages / 2);
      const hizb1End = range.startPage + firstHalfSize - 1;
      return { from: range.startPage, to: hizb1End };
    }
    return { from: range.startPage, to: range.endPage };
  }, [formData.juz_number, formData.test_hizb]);

  // Update page range when test type or juz number changes
  useEffect(() => {
    const pageRange = calculatePageRange();
    setFormData(prev => ({
      ...prev,
      page_from: pageRange.from,
      page_to: pageRange.to
    }));

    setSection2Scores(prevScores => {
      const config = getQuestionConfig(formData.test_hizb);
      const nextScores: { [key: string]: { [key: string]: number } } = {};

      Object.entries(config).forEach(([category, categoryConfig]) => {
        nextScores[category] = {};
        categoryConfig.questionNumbers.forEach(questionNum => {
          nextScores[category][String(questionNum)] =
            prevScores[category]?.[String(questionNum)] || 0;
        });
      });

      return nextScores;
    });
  }, [calculatePageRange, formData.test_hizb]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Calculate total percentage from all scores
    const section2Total = Object.values(section2Scores).reduce((total, category) => 
      total + Object.values(category).reduce((sum, score) => sum + score, 0), 0
    );
    const maxSection2Score = Object.values(getQuestionConfig(formData.test_hizb))
      .reduce((total, config) => total + config.questionNumbers.length * 5, 0);
    const section3Total = formData.tajweed_score + formData.recitation_score;
    const maxSection3Score = 10;
    
    const totalScore = section2Total + section3Total;
    const maxTotalScore = maxSection2Score + maxSection3Score;
    const totalPercentage = Math.round((totalScore / maxTotalScore) * 100);
    const passed = totalPercentage >= 60;
    
    onSave({
      ...formData,
      section2_scores: section2Scores,
      passed,
      total_percentage: totalPercentage
    });
  };

  const calculateCurrentPercentage = () => {
    const section2Total = Object.values(section2Scores).reduce((total, category) => 
      total + Object.values(category).reduce((sum, score) => sum + score, 0), 0
    );
    const maxSection2Score = Object.values(getQuestionConfig(formData.test_hizb))
      .reduce((total, config) => total + config.questionNumbers.length * 5, 0);
    const section3Total = formData.tajweed_score + formData.recitation_score;
    const maxSection3Score = 10;
    
    const totalScore = section2Total + section3Total;
    const maxTotalScore = maxSection2Score + maxSection3Score;
    return Math.round((totalScore / maxTotalScore) * 100);
  };

  const currentPercentage = calculateCurrentPercentage();
  const willPass = currentPercentage >= 60;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Edit Test Record</h3>
          <p className="text-gray-500 text-sm">
            {formData.test_hizb ? `Hizb ${(formData.juz_number - 1) * 2 + 1}` : `Juz ${formData.juz_number}`} - Page {formData.page_from} to {formData.page_to}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          </div>

          {/* Test Type Toggle */}
          <div className="flex items-center gap-6 p-4 bg-gray-50 rounded-lg">
            <span className="text-sm font-medium text-gray-700">Test Type:</span>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={formData.test_juz && !formData.test_hizb}
                onChange={() => setFormData({ ...formData, test_juz: true, test_hizb: false })}
                className="text-blue-600"
              />
              <span className="text-sm text-gray-700">Full Juz Test</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={formData.test_hizb}
                onChange={() => setFormData({ ...formData, test_juz: false, test_hizb: true })}
                className="text-blue-600"
              />
              <span className="text-sm text-gray-700">Hizb Test</span>
            </label>
          </div>

          {/* Section 2: Detailed Question Categories */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">
              Section 2: Question Categories
            </h4>
            
            {Object.entries(getQuestionConfig(formData.test_hizb)).map(([categoryKey, categoryConfig]) => (
              <div key={categoryKey} className="bg-gray-50 rounded-lg p-4">
                <h5 className="font-medium text-gray-700 mb-3">{categoryConfig.title}</h5>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {categoryConfig.questionNumbers.map(questionNum => (
                    <div key={questionNum} className="flex flex-col">
                      <label className="text-xs text-gray-600 mb-1">Q{questionNum}</label>
                      <select
                        value={section2Scores[categoryKey]?.[String(questionNum)] || 0}
                        onChange={(e) => {
                          const newScores = { ...section2Scores };
                          if (!newScores[categoryKey]) newScores[categoryKey] = {};
                          newScores[categoryKey][String(questionNum)] = parseInt(e.target.value);
                          setSection2Scores(newScores);
                        }}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {[0, 1, 2, 3, 4, 5].map(score => (
                          <option key={score} value={score}>{score}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-xs text-gray-600">
                  Category Total: {Object.values(section2Scores[categoryKey] || {}).reduce((sum, score) => sum + score, 0)}/{categoryConfig.questionNumbers.length * 5}
                  ({Math.round((Object.values(section2Scores[categoryKey] || {}).reduce((sum, score) => sum + score, 0) / (categoryConfig.questionNumbers.length * 5)) * 100)}%)
                </div>
              </div>
            ))}
          </div>

          {/* Section 3: Tajweed and Recitation */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">
              Section 3: Tajweed & Recitation
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tajweed / التجويد
                </label>
                <select
                  value={formData.tajweed_score}
                  onChange={(e) => setFormData({ ...formData, tajweed_score: parseInt(e.target.value) })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {[0, 1, 2, 3, 4, 5].map(score => (
                    <option key={score} value={score}>{score}/5</option>
                  ))}
                </select>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Good Recitation / حسن الأداء
                </label>
                <select
                  value={formData.recitation_score}
                  onChange={(e) => setFormData({ ...formData, recitation_score: parseInt(e.target.value) })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {[0, 1, 2, 3, 4, 5].map(score => (
                    <option key={score} value={score}>{score}/5</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Score Preview */}
          <div className={`p-4 rounded-lg ${willPass ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="text-sm text-gray-600 mb-2">Test Results:</div>
            <div className={`font-bold text-lg ${willPass ? 'text-green-700' : 'text-red-700'}`}>
              {currentPercentage}% - {willPass ? 'PASSED' : 'FAILED'}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Total Score: {Object.values(section2Scores).reduce((total, category) => 
                total + Object.values(category).reduce((sum, score) => sum + score, 0), 0
              ) + formData.tajweed_score + formData.recitation_score} / {
                Object.values(getQuestionConfig(formData.test_hizb))
                  .reduce((total, config) => total + config.questionNumbers.length * 5, 0) + 10
              }
            </div>
          </div>

          {/* Additional Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Halaqah Name (Optional)</label>
              <input
                type="text"
                value={formData.halaqah_name}
                onChange={(e) => setFormData({ ...formData, halaqah_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter halaqah name"
              />
            </div>
            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.should_repeat}
                  onChange={(e) => setFormData({ ...formData, should_repeat: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Student should repeat this test</span>
              </label>
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
              className="px-6 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-medium"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
