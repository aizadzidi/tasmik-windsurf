"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

interface JuzTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  juzNumber: number;
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
  juzNumber,
  onSubmit
}) => {
  const [loading, setLoading] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [formData, setFormData] = useState({
    halaqah_name: "",
    page_from: 0,
    page_to: 0,
    test_juz: true, // Default to Juz test
    test_hizb: false,
    examiner_name: "",
    remarks: ""
  });

  const [section2Scores, setSection2Scores] = useState<Section2Scores>({
    memorization: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
    middle_verse: { "1": 0, "2": 0 },
    last_words: { "1": 0, "2": 0 },
    reversal_reading: { "1": 0, "2": 0, "3": 0 },
    verse_position: { "1": 0, "2": 0, "3": 0 },
    read_verse_no: { "1": 0, "2": 0, "3": 0 },
    understanding: { "1": 0 }
  });

  const [tajweedScore, setTajweedScore] = useState(0);
  const [recitationScore, setRecitationScore] = useState(0);
  const [passed, setPassed] = useState(false);
  const [shouldRepeat, setShouldRepeat] = useState(false);

  const fetchStudentName = async () => {
    try {
      const { data, error } = await supabase
        .from("students")
        .select("name")
        .eq("id", studentId)
        .single();

      if (error) throw error;
      setStudentName(data?.name || "");
    } catch (error) {
      console.error("Error fetching student name:", error);
    }
  };

  // Calculate page range based on test category and juz number
  const calculatePageRange = () => {
    if (formData.test_hizb) {
      // Hizb is half a juz (approximately 10-11 pages)
      const juzStartPage = (juzNumber - 1) * 20 + 1;
      const hizb1End = juzStartPage + 10;
      return { from: juzStartPage, to: hizb1End };
    } else {
      // Default to full juz: Juz 1 = pages 1-21, Juz 2 = pages 22-41, etc.
      const startPage = (juzNumber - 1) * 20 + 1;
      const endPage = startPage + 20; // 21 pages total (1-21, 22-41, etc.)
      return { from: startPage, to: endPage };
    }
  };

  // Update page range when test categories change
  useEffect(() => {
    if (isOpen) {
      const range = calculatePageRange();
      setFormData(prev => ({
        ...prev,
        page_from: range.from,
        page_to: range.to
      }));
    }
  }, [formData.test_juz, formData.test_hizb, juzNumber, isOpen]);

  // Fetch student name when modal opens
  useEffect(() => {
    if (isOpen && studentId) {
      fetchStudentName();
    }
  }, [isOpen, studentId]);

  const calculateTotalPercentage = () => {
    // Define the scoring weights for each category (to total 100 points exactly)
    const categoryWeights = {
      memorization: 25,     // 5 questions (Repeat and Continue) - Most important
      middle_verse: 10,     // 2 questions × 5 points each  
      last_words: 10,       // 2 questions × 5 points each
      reversal_reading: 15, // 3 questions × 5 points each
      verse_position: 15,   // 3 questions × 5 points each (Position of verse)
      read_verse_no: 15,    // 3 questions × 5 points each (Read verse number)
      understanding: 5,     // 1 question × 5 points (Understanding of verse)
      tajweed: 2.5,         // 1 × 5 points
      recitation: 2.5       // 1 × 5 points
    };
    // Total: 25+10+10+15+15+15+5+2.5+2.5 = 100

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
      const currentUser = await supabase.auth.getUser();
      
      if (!currentUser.data.user) {
        throw new Error("No authenticated user found");
      }
      
      console.log("Current user:", currentUser.data.user);
      
      const totalPercentage = calculateTotalPercentage();

      const testData = {
        student_id: studentId,
        juz_number: juzNumber,
        test_date: new Date().toISOString().split('T')[0],
        examiner_id: currentUser.data.user.id,
        halaqah_name: formData.halaqah_name,
        page_from: formData.page_from,
        page_to: formData.page_to,
        test_juz: formData.test_juz,
        test_hizb: formData.test_hizb,
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
      console.log("Test data JSON:", JSON.stringify(testData, null, 2));

      const { data, error } = await supabase
        .from("juz_tests")
        .insert([testData])
        .select();

      if (error) {
        console.error("Supabase error details:", error);
        throw error;
      }

      console.log("Juz test submitted successfully:", data);
      alert("Juz test submitted successfully!");
      onSubmit();
      onClose();
    } catch (error) {
      console.error("Error submitting juz test:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      
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
              <p className="text-sm opacity-90">Quranic Memorization Test Result for Academy Al Khayr - Juz {juzNumber}</p>
              <p className="text-xs opacity-75 mt-1">كشف نتج اختبار حفظ القرآن الكريم لأكاديمية الخير - الجزء {juzNumber}</p>
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
                    {studentName || "Loading..."}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
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
                          test_juz: e.target.checked ? false : prev.test_juz
                        }))}
                        className="mr-2"
                      />
                      <span className="text-sm">Hizb (1/2 juz) / حزب</span>
                    </label>
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
                  memorization: { title: "Repeat and Continue / الإعادة والمتابعة", questions: 5, questionNumbers: [1, 2, 3, 4, 5] },
                  middle_verse: { title: "Middle of the verse / وسط الآية", questions: 2, questionNumbers: [1, 2] },
                  last_words: { title: "Last of the verse / آخر الآية", questions: 2, questionNumbers: [1, 2] },
                  reversal_reading: { title: "Reversal reading / القراءة بالعكس", questions: 3, questionNumbers: [1, 2, 3] }
                }).map(([category, config]) => (
                  <div key={category} className="border rounded p-3">
                    <h4 className="font-medium text-sm mb-2">{config.title}</h4>
                    <div className="grid grid-cols-5 gap-2">
                      {config.questionNumbers && config.questionNumbers.map((questionNum, i) => (
                        <div key={i} className="text-center">
                          <div className="text-xs mb-1">{questionNum}</div>
                          <input
                            type="number"
                            min="0"
                            max="5"
                            value={section2Scores[category as keyof Section2Scores]?.[String(questionNum)] || 0}
                            onChange={(e) => updateScore(category as keyof Section2Scores, String(questionNum), parseInt(e.target.value) || 0)}
                            className="w-full p-1 border rounded text-center text-xs"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Right side scoring */}
              <div className="space-y-4">
                {Object.entries({
                  verse_position: { title: "Position of the verse / موضع الآية", questions: 3, questionNumbers: [1, 2, 3] },
                  read_verse_no: { title: "Read verse number / قراءة رقم الآية", questions: 3, questionNumbers: [1, 2, 3] },
                  understanding: { title: "Understanding of the verse / فهم الآية", questions: 1, questionNumbers: [1] }
                }).map(([category, config]) => (
                  <div key={category} className="border rounded p-3">
                    <h4 className="font-medium text-sm mb-2">{config.title}</h4>
                    <div className="grid grid-cols-5 gap-2">
                      {config.questionNumbers && config.questionNumbers.map((questionNum, i) => (
                        <div key={i} className="text-center">
                          <div className="text-xs mb-1">{questionNum}</div>
                          <input
                            type="number"
                            min="0"
                            max="5"
                            value={section2Scores[category as keyof Section2Scores]?.[String(questionNum)] || 0}
                            onChange={(e) => updateScore(category as keyof Section2Scores, String(questionNum), parseInt(e.target.value) || 0)}
                            className="w-full p-1 border rounded text-center text-xs"
                          />
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
                <input
                  type="number"
                  min="0"
                  max="5"
                  value={tajweedScore}
                  onChange={(e) => setTajweedScore(parseInt(e.target.value) || 0)}
                  className="w-16 p-1 border rounded text-center"
                />
              </div>
              <div className="border rounded p-3 text-center">
                <h4 className="font-medium text-sm mb-2">Good recitation / حسن الأداء</h4>
                <input
                  type="number"
                  min="0"
                  max="5"
                  value={recitationScore}
                  onChange={(e) => setRecitationScore(parseInt(e.target.value) || 0)}
                  className="w-16 p-1 border rounded text-center"
                />
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
                  <input
                    type="text"
                    value={formData.halaqah_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, halaqah_name: e.target.value }))}
                    className="w-full p-2 border rounded focus:ring-2 focus:ring-purple-400"
                  />
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