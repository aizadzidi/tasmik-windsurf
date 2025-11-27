"use client";

import React, { useState, useEffect } from "react";
import { getPageRangeFromJuz } from "@/lib/quranMapping";

interface JuzTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  defaultJuzNumber: number;
  teacherName?: string;
  availableTeachers?: string[];
  onSubmit: () => void;
}

interface Section2Scores {
  memorization: { [key: string]: number };
  middle_verse: { [key: string]: number };
  last_words: { [key: string]: number };
  reversal_reading: { [key: string]: number };
  verse_position: { [key: string]: number };
  read_verse_no: { [key: string]: number };
  understanding: { [key: string]: number };
}

const JuzTestModal: React.FC<JuzTestModalProps> = ({
  isOpen,
  onClose,
  studentId,
  studentName,
  defaultJuzNumber,
  teacherName,
  availableTeachers = [],
  onSubmit
}) => {
  const [loading, setLoading] = useState(false);
  const [selectedJuz, setSelectedJuz] = useState(defaultJuzNumber);
  const [formData, setFormData] = useState({
    halaqah_name: teacherName || "",
    page_from: 0,
    page_to: 0,
    test_juz: true, // Default to Juz test
    test_hizb: false,
    hizb_number: 1, // Default to 1st hizb (1 or 2)
    examiner_name: "",
    remarks: ""
  });

  // Use actual teachers from the system, ensuring assigned teacher is included
  const teacherOptions = React.useMemo(() => {
    const options = [...availableTeachers];
    if (teacherName && !options.includes(teacherName)) {
      options.unshift(teacherName); // Add assigned teacher at the beginning
    }
    return options;
  }, [availableTeachers, teacherName]);

  // Initialize with default juz test scores
  const [section2Scores, setSection2Scores] = useState<Section2Scores>({
    memorization: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
    middle_verse: { "1": 0, "2": 0 },
    last_words: { "1": 0, "2": 0 },
    reversal_reading: { "1": 0, "2": 0, "3": 0 },
    verse_position: { "1": 0, "2": 0, "3": 0 },
    read_verse_no: { "1": 0, "2": 0, "3": 0 },
    understanding: { "1": 0, "2": 0, "3": 0 }
  });

  // Get question configuration based on test type
  const getQuestionConfig = React.useCallback(() => {
    if (formData.test_hizb) {
      // Reduced questions for hizb test (approximately half)
      return {
        memorization: { title: "Repeat and Continue / الإعادة والمتابعة", questionNumbers: [1, 2, 3] }, // 5→3
        middle_verse: { title: "Middle of the verse / وسط الآية", questionNumbers: [1] },             // 2→1
        last_words: { title: "Last of the verse / آخر الآية", questionNumbers: [1] },               // 2→1
        reversal_reading: { title: "Reversal reading / القراءة بالعكس", questionNumbers: [1, 2] },   // 3→2
        verse_position: { title: "Position of the verse / موضع الآية", questionNumbers: [1, 2] },   // 3→2
        read_verse_no: { title: "Read verse number / قراءة رقم الآية", questionNumbers: [1] },       // 3→1
        understanding: { title: "Understanding of the verse / فهم الآية", questionNumbers: [1] }     // 3→1
      };
    } else {
      // Full questions for juz test
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
  }, [formData.test_hizb]);

  // Initialize section2Scores based on test type
  const initializeScores = React.useCallback(() => {
    const config = getQuestionConfig();
    const scores: Section2Scores = {
      memorization: {},
      middle_verse: {},
      last_words: {},
      reversal_reading: {},
      verse_position: {},
      read_verse_no: {},
      understanding: {}
    };
    
    Object.entries(config).forEach(([category, categoryConfig]) => {
      categoryConfig.questionNumbers.forEach(questionNum => {
        scores[category as keyof Section2Scores][String(questionNum)] = 0;
      });
    });
    
    return scores;
  }, [getQuestionConfig]);

  const [tajweedScore, setTajweedScore] = useState(0);
  const [recitationScore, setRecitationScore] = useState(0);
  const [passed, setPassed] = useState(false);
  const [shouldRepeat, setShouldRepeat] = useState(false);


  // Calculate page range based on test category and selected juz
  const calculatePageRange = React.useCallback(() => {
    const range = getPageRangeFromJuz(selectedJuz);
    if (!range) {
      return { from: 0, to: 0 };
    }
    if (formData.test_hizb) {
      // Split the actual juz range into two halves
      const totalPages = range.endPage - range.startPage + 1; // usually 21 except last Juz
      const firstHalfSize = Math.ceil(totalPages / 2);
      const hizb1End = range.startPage + firstHalfSize - 1;
      
      if (formData.hizb_number === 1) {
        // First hizb: start to middle
        return { from: range.startPage, to: hizb1End };
      } else {
        // Second hizb: middle+1 to end
        return { from: hizb1End + 1, to: range.endPage };
      }
    }
    return { from: range.startPage, to: range.endPage };
  }, [selectedJuz, formData.test_hizb, formData.hizb_number]);

  // Update page range and scores when test categories change
  useEffect(() => {
    if (isOpen) {
      const range = calculatePageRange();
      setFormData(prev => ({
        ...prev,
        page_from: range.from,
        page_to: range.to
      }));
      // Reset scores when test type changes
      setSection2Scores(initializeScores());
      setTajweedScore(0);
      setRecitationScore(0);
      setPassed(false);
      setShouldRepeat(false);
    }
  }, [formData.test_juz, formData.test_hizb, formData.hizb_number, selectedJuz, isOpen, calculatePageRange, initializeScores]);

  // Reset selectedJuz when modal opens with new defaultJuzNumber
  useEffect(() => {
    if (isOpen) {
      setSelectedJuz(defaultJuzNumber);
    }
  }, [defaultJuzNumber, isOpen]);

  // Update halaqah_name when teacherName prop changes
  useEffect(() => {
    if (isOpen && teacherName) {
      console.log("Setting halaqah_name to teacher:", teacherName);
      setFormData(prev => ({
        ...prev,
        halaqah_name: teacherName
      }));
    }
  }, [teacherName, isOpen]);

  const calculateTotalPercentage = () => {
    // Define the scoring weights for each category based on test type
    const isHizbTest = formData.test_hizb;
    
    const categoryWeights = isHizbTest ? {
      // Hizb test weights (11 questions total + tajweed + recitation = 13 scoring items)
      memorization: 23.1,   // 3 questions - Most important
      middle_verse: 7.7,    // 1 question
      last_words: 7.7,      // 1 question  
      reversal_reading: 15.4, // 2 questions
      verse_position: 15.4, // 2 questions
      read_verse_no: 7.7,   // 1 question
      understanding: 7.7,   // 1 question
      tajweed: 7.7,         // 1 × 5 points
      recitation: 7.7       // 1 × 5 points
    } : {
      // Juz test weights (21 questions total + tajweed + recitation = 23 scoring items)
      memorization: 22.7,   // 5 questions - Most important
      middle_verse: 9.1,    // 2 questions
      last_words: 9.1,      // 2 questions
      reversal_reading: 13.6, // 3 questions
      verse_position: 13.6, // 3 questions
      read_verse_no: 13.6,  // 3 questions
      understanding: 13.6,  // 3 questions
      tajweed: 2.3,         // 1 × 5 points
      recitation: 2.3       // 1 × 5 points
    };

    let totalPoints = 0;

    // Calculate section 2 scores with weights
    Object.entries(section2Scores).forEach(([category, scores]) => {
      const categoryTotal = Object.values(scores).reduce((sum: number, score) => sum + (Number(score) || 0), 0);
      const maxCategoryScore = Object.keys(scores).length * 5;
      const categoryPercentage = maxCategoryScore > 0 ? (categoryTotal / maxCategoryScore) : 0;
      const categoryWeight = categoryWeights[category as keyof typeof categoryWeights] || 0;
      totalPoints += categoryPercentage * categoryWeight;
    });

    // Add tajweed and recitation scores
    totalPoints += (tajweedScore / 5) * categoryWeights.tajweed;
    totalPoints += (recitationScore / 5) * categoryWeights.recitation;

    const percentage = Math.round(totalPoints);
    
    // Auto-set passed if 50% or above
    if (percentage >= 50 && !passed) {
      setPassed(true);
      setShouldRepeat(false);
    } else if (percentage < 50 && passed) {
      setPassed(false);
      setShouldRepeat(true);
    }

    return percentage;
  };

  const updateScore = (category: keyof Section2Scores, question: string, score: number) => {
    setSection2Scores(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [question]: score
      }
    }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const totalPercentage = calculateTotalPercentage();

      const testData = {
        student_id: studentId,
        juz_number: selectedJuz,
        test_date: new Date().toISOString().split('T')[0],
        examiner_id: null, // Will be set to null for now, can be improved later
        halaqah_name: formData.halaqah_name,
        page_from: formData.page_from,
        page_to: formData.page_to,
        test_juz: formData.test_juz,
        test_hizb: formData.test_hizb,
        hizb_number: formData.test_hizb ? formData.hizb_number : null, // Only include if hizb test
        section2_scores: section2Scores,
        tajweed_score: tajweedScore,
        recitation_score: recitationScore,
        total_percentage: totalPercentage,
        passed: passed,
        should_repeat: shouldRepeat,
        examiner_name: formData.examiner_name,
        remarks: formData.remarks
      };

      console.log("Submitting test data:", testData);

      const response = await fetch('/api/admin/juz-tests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit juz test');
      }

      const data = await response.json();
      console.log("Juz test submitted successfully:", data);
      alert("Juz test submitted successfully!");
      onSubmit();
      onClose();
    } catch (error) {
      console.error("Error submitting juz test:", error);
      
      // Show more detailed error message
      let errorMessage = "Unknown error occurred";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null) {
        errorMessage = JSON.stringify(error);
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      alert(`Failed to submit juz test: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6 rounded-t-lg">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">Akademi Al Khayr</h2>
              <p className="text-sm opacity-90">Quranic Memorization Test Result for Academy Al Khayr - Juz {selectedJuz}</p>
              <p className="text-xs opacity-75 mt-1">كشف نتج اختبار حفظ القرآن الكريم لأكاديمية الخير - الجزء {selectedJuz}</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 text-3xl font-bold"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Section 1 */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4 text-purple-800">Section 1 / القسم الأول</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Student&apos;s name / اسم الطالب
                  </label>
                  <div className="p-2 bg-gray-100 rounded border font-medium">
                    {studentName}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Juz to test / الجزء المراد اختباره
                  </label>
                  <select
                    value={selectedJuz}
                    onChange={(e) => setSelectedJuz(parseInt(e.target.value))}
                    className="w-full p-2 border rounded focus:ring-2 focus:ring-purple-400"
                  >
                    {Array.from({ length: 30 }, (_, i) => i + 1).map((juz) => (
                      <option key={juz} value={juz}>
                        Juz {juz} / الجزء {juz}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      From (من)
                    </label>
                    <input
                      type="number"
                      value={formData.page_from}
                      onChange={(e) => setFormData(prev => ({ ...prev, page_from: parseInt(e.target.value) || 0 }))}
                      className="w-full p-2 border rounded focus:ring-2 focus:ring-purple-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      To (إلى)
                    </label>
                    <input
                      type="number"
                      value={formData.page_to}
                      onChange={(e) => setFormData(prev => ({ ...prev, page_to: parseInt(e.target.value) || 0 }))}
                      className="w-full p-2 border rounded focus:ring-2 focus:ring-purple-400"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Test category / نوع الاختبار
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.test_juz}
                        onChange={(e) => setFormData(prev => ({ 
                          ...prev, 
                          test_juz: e.target.checked,
                          test_hizb: e.target.checked ? false : prev.test_hizb
                        }))}
                        className="mr-2"
                      />
                      <span className="text-sm">Juz (جزء)</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.test_hizb}
                        onChange={(e) => setFormData(prev => ({ 
                          ...prev, 
                          test_hizb: e.target.checked,
                          test_juz: e.target.checked ? false : prev.test_juz,
                          hizb_number: e.target.checked ? 1 : prev.hizb_number // Reset to 1st hizb when enabling
                        }))}
                        className="mr-2"
                      />
                      <span className="text-sm">Hizb (1/2 juz) / حزب</span>
                    </label>
                    
                    {/* Hizb selection - only show when test_hizb is checked */}
                    {formData.test_hizb && (
                      <div className="ml-6 mt-2 space-y-1">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Select Hizb / اختر الحزب
                        </label>
                        <div className="space-y-1">
                          <label className="flex items-center">
                            <input
                              type="radio"
                              name="hizb_selection"
                              checked={formData.hizb_number === 1}
                              onChange={() => setFormData(prev => ({ ...prev, hizb_number: 1 }))}
                              className="mr-2"
                            />
                            <span className="text-xs">1st Hizb / الحزب الأول</span>
                          </label>
                          <label className="flex items-center">
                            <input
                              type="radio"
                              name="hizb_selection"
                              checked={formData.hizb_number === 2}
                              onChange={() => setFormData(prev => ({ ...prev, hizb_number: 2 }))}
                              className="mr-2"
                            />
                            <span className="text-xs">2nd Hizb / الحزب الثاني</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2 */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4 text-purple-800">Section 2 / القسم الثاني</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left side scoring */}
              <div className="space-y-4">
                {Object.entries({
                  memorization: getQuestionConfig().memorization,
                  middle_verse: getQuestionConfig().middle_verse,
                  last_words: getQuestionConfig().last_words,
                  reversal_reading: getQuestionConfig().reversal_reading
                }).map(([category, config]) => (
                  <div key={category} className="border rounded p-3">
                    <h4 className="font-medium text-sm mb-2">{config.title}</h4>
                    <div className="grid grid-cols-5 gap-2">
                      {config.questionNumbers && config.questionNumbers.map((questionNum, i) => (
                        <div key={i} className="text-center">
                          <div className="text-xs mb-1">{questionNum}</div>
                          <select
                            value={section2Scores[category as keyof Section2Scores]?.[String(questionNum)] || 0}
                            onChange={(e) => updateScore(category as keyof Section2Scores, String(questionNum), parseInt(e.target.value) || 0)}
                            className="w-full p-1 border rounded text-center text-xs"
                          >
                            <option value={0}>0</option>
                            <option value={1}>1</option>
                            <option value={2}>2</option>
                            <option value={3}>3</option>
                            <option value={4}>4</option>
                            <option value={5}>5</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Right side scoring */}
              <div className="space-y-4">
                {Object.entries({
                  verse_position: getQuestionConfig().verse_position,
                  read_verse_no: getQuestionConfig().read_verse_no,
                  understanding: getQuestionConfig().understanding
                }).map(([category, config]) => (
                  <div key={category} className="border rounded p-3">
                    <h4 className="font-medium text-sm mb-2">{config.title}</h4>
                    <div className="grid grid-cols-5 gap-2">
                      {config.questionNumbers && config.questionNumbers.map((questionNum, i) => (
                        <div key={i} className="text-center">
                          <div className="text-xs mb-1">{questionNum}</div>
                          <select
                            value={section2Scores[category as keyof Section2Scores]?.[String(questionNum)] || 0}
                            onChange={(e) => updateScore(category as keyof Section2Scores, String(questionNum), parseInt(e.target.value) || 0)}
                            className="w-full p-1 border rounded text-center text-xs"
                          >
                            <option value={0}>0</option>
                            <option value={1}>1</option>
                            <option value={2}>2</option>
                            <option value={3}>3</option>
                            <option value={4}>4</option>
                            <option value={5}>5</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tajweed and Recitation */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div className="border rounded p-3 text-center">
                <h4 className="font-medium text-sm mb-2">Tajweed / التجويد</h4>
                <select
                  value={tajweedScore}
                  onChange={(e) => setTajweedScore(parseInt(e.target.value) || 0)}
                  className="w-16 p-1 border rounded text-center"
                >
                  <option value={0}>0</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                  <option value={5}>5</option>
                </select>
              </div>
              <div className="border rounded p-3 text-center">
                <h4 className="font-medium text-sm mb-2">Good recitation / حسن الأداء</h4>
                <select
                  value={recitationScore}
                  onChange={(e) => setRecitationScore(parseInt(e.target.value) || 0)}
                  className="w-16 p-1 border rounded text-center"
                >
                  <option value={0}>0</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                  <option value={5}>5</option>
                </select>
              </div>
              <div className="border rounded p-3 text-center bg-purple-50">
                <h4 className="font-medium text-sm mb-2">Grand total (100%) / المجموع الكامل</h4>
                <div className="text-lg font-bold text-purple-600">
                  {calculateTotalPercentage()}%
                </div>
              </div>
            </div>
          </div>

          {/* Section 3 */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4 text-purple-800">Section 3 / القسم الثالث</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Halaqah&apos;s name / اسم الحلقة
                  </label>
                  <select
                    value={formData.halaqah_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, halaqah_name: e.target.value }))}
                    className="w-full p-2 border rounded focus:ring-2 focus:ring-purple-400"
                  >
                    <option value="">Select teacher / اختر المعلم</option>
                    {teacherOptions.map((teacher) => (
                      <option key={teacher} value={teacher}>
                        {teacher}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Examiner&apos;s name / اسم المختبر
                  </label>
                  <input
                    type="text"
                    value={formData.examiner_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, examiner_name: e.target.value }))}
                    className="w-full p-2 border rounded focus:ring-2 focus:ring-purple-400"
                  />
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Suggestion / الاقتراح
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={passed}
                        onChange={(e) => setPassed(e.target.checked)}
                        className="mr-2"
                      />
                      <span className="text-sm">Passed / تم الاجتياز بنجاح</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={shouldRepeat}
                        onChange={(e) => setShouldRepeat(e.target.checked)}
                        className="mr-2"
                      />
                      <span className="text-sm">Should repeat the test / يحب إعادة الاختبار</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Remarks */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Remarks / ملاحظات
            </label>
            <textarea
              value={formData.remarks}
              onChange={(e) => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
              rows={3}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-purple-400"
              placeholder="Barakallahu feeha"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-purple-400 transition-colors"
            >
              {loading ? "Submitting..." : "Submit Test"}
            </button>
          </div>

          {/* Date */}
          <div className="text-right text-xs text-gray-500 mt-4">
            {new Date().toLocaleDateString('en-GB')}
          </div>
        </div>
      </div>
    </div>
  );
};

export default JuzTestModal;
