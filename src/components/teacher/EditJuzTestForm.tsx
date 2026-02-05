"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPageRangeFromJuz } from "@/lib/quranMapping";
import { resolveHizbNumber } from "@/lib/juzTestUtils";

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
  hizb_number?: number | null;
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
  hizb_number?: number | null;
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
  studentName?: string;
  onSave: (formData: EditJuzTestFormData) => void;
  onCancel: () => void;
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
  }
  return {
    memorization: { title: "Repeat and Continue / الإعادة والمتابعة", questionNumbers: [1, 2, 3, 4, 5] },
    middle_verse: { title: "Middle of the verse / وسط الآية", questionNumbers: [1, 2] },
    last_words: { title: "Last of the verse / آخر الآية", questionNumbers: [1, 2] },
    reversal_reading: { title: "Reversal reading / القراءة بالعكس", questionNumbers: [1, 2, 3] },
    verse_position: { title: "Position of the verse / موضع الآية", questionNumbers: [1, 2, 3] },
    read_verse_no: { title: "Read verse number / قراءة رقم الآية", questionNumbers: [1, 2, 3] },
    understanding: { title: "Understanding of the verse / فهم الآية", questionNumbers: [1, 2, 3] }
  };
};

const buildScores = (
  isHizbTest: boolean,
  existing?: Partial<Section2Scores>
): Section2Scores => {
  const config = getQuestionConfig(isHizbTest);
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
    categoryConfig.questionNumbers.forEach((questionNum) => {
      scores[category as keyof Section2Scores][String(questionNum)] =
        existing?.[category as keyof Section2Scores]?.[String(questionNum)] ?? 0;
    });
  });

  return scores;
};

export default function EditJuzTestForm({
  test,
  studentName,
  onSave,
  onCancel
}: EditJuzTestFormProps) {
  const initialHizbNumber =
    resolveHizbNumber({
      juz_number: test.juz_number,
      test_hizb: test.test_hizb,
      hizb_number: test.hizb_number ?? null,
      page_from: test.page_from ?? null,
      page_to: test.page_to ?? null
    }) ?? 1;

  const initialIsHizbTest = test.test_hizb || false;
  const [formData, setFormData] = useState({
    juz_number: test.juz_number,
    test_date: test.test_date,
    examiner_name: test.examiner_name || "",
    halaqah_name: test.halaqah_name || "",
    page_from: test.page_from || 0,
    page_to: test.page_to || 0,
    test_juz: test.test_juz !== false && !initialIsHizbTest,
    test_hizb: initialIsHizbTest,
    hizb_number: initialHizbNumber,
    remarks: test.remarks || ""
  });

  const [section2Scores, setSection2Scores] = useState<Section2Scores>(() =>
    buildScores(formData.test_hizb, test.section2_scores as Section2Scores | undefined)
  );
  const [tajweedScore, setTajweedScore] = useState(test.tajweed_score || 0);
  const [recitationScore, setRecitationScore] = useState(test.recitation_score || 0);
  const [passed, setPassed] = useState(test.passed);
  const [shouldRepeat, setShouldRepeat] = useState(test.should_repeat || false);

  const calculatePageRange = useCallback(() => {
    const range = getPageRangeFromJuz(formData.juz_number);
    if (!range) {
      return { from: 0, to: 0 };
    }
    if (formData.test_hizb) {
      const totalPages = range.endPage - range.startPage + 1;
      const firstHalfSize = Math.ceil(totalPages / 2);
      const hizb1End = range.startPage + firstHalfSize - 1;

      if (formData.hizb_number === 1) {
        return { from: range.startPage, to: hizb1End };
      }
      return { from: hizb1End + 1, to: range.endPage };
    }
    return { from: range.startPage, to: range.endPage };
  }, [formData.juz_number, formData.test_hizb, formData.hizb_number]);

  const didInitPageRef = useRef(false);
  useEffect(() => {
    if (!didInitPageRef.current) {
      didInitPageRef.current = true;
      return;
    }
    const range = calculatePageRange();
    setFormData((prev) => ({
      ...prev,
      page_from: range.from,
      page_to: range.to
    }));
  }, [calculatePageRange]);

  useEffect(() => {
    setSection2Scores((prev) => buildScores(formData.test_hizb, prev));
  }, [formData.test_hizb]);

  const updateScore = (category: keyof Section2Scores, question: string, score: number) => {
    setSection2Scores((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [question]: score
      }
    }));
  };

  const calculateTotalPercentage = () => {
    const isHizbTest = formData.test_hizb;

    const categoryWeights = isHizbTest
      ? {
          memorization: 23.1,
          middle_verse: 7.7,
          last_words: 7.7,
          reversal_reading: 15.4,
          verse_position: 15.4,
          read_verse_no: 7.7,
          understanding: 7.7,
          tajweed: 7.7,
          recitation: 7.7
        }
      : {
          memorization: 22.7,
          middle_verse: 9.1,
          last_words: 9.1,
          reversal_reading: 13.6,
          verse_position: 13.6,
          read_verse_no: 13.6,
          understanding: 13.6,
          tajweed: 2.3,
          recitation: 2.3
        };

    let totalPoints = 0;

    Object.entries(section2Scores).forEach(([category, scores]) => {
      const categoryTotal = Object.values(scores).reduce(
        (sum: number, score) => sum + (Number(score) || 0),
        0
      );
      const maxCategoryScore = Object.keys(scores).length * 5;
      const categoryPercentage = maxCategoryScore > 0 ? categoryTotal / maxCategoryScore : 0;
      const categoryWeight = categoryWeights[category as keyof typeof categoryWeights] || 0;
      totalPoints += categoryPercentage * categoryWeight;
    });

    totalPoints += (tajweedScore / 5) * categoryWeights.tajweed;
    totalPoints += (recitationScore / 5) * categoryWeights.recitation;

    const percentage = Math.round(totalPoints);

    if (percentage >= 50 && !passed) {
      setPassed(true);
      setShouldRepeat(false);
    } else if (percentage < 50 && passed) {
      setPassed(false);
      setShouldRepeat(true);
    }

    return percentage;
  };

  const totalPercentage = calculateTotalPercentage();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    onSave({
      ...formData,
      page_from: formData.page_from,
      page_to: formData.page_to,
      test_juz: formData.test_juz,
      test_hizb: formData.test_hizb,
      hizb_number: formData.test_hizb ? formData.hizb_number : null,
      section2_scores: section2Scores,
      tajweed_score: tajweedScore,
      recitation_score: recitationScore,
      total_percentage: totalPercentage,
      passed,
      should_repeat: shouldRepeat
    });
  };

  const displayDate = useMemo(() => {
    if (!formData.test_date) return new Date().toLocaleDateString("en-GB");
    const parsed = new Date(formData.test_date);
    if (Number.isNaN(parsed.getTime())) return new Date().toLocaleDateString("en-GB");
    return parsed.toLocaleDateString("en-GB");
  }, [formData.test_date]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6 rounded-t-lg">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">Akademi Al Khayr</h2>
              <p className="text-sm opacity-90">
                Quranic Memorization Test Result for Academy Al Khayr - Juz {formData.juz_number}
              </p>
              <p className="text-xs opacity-75 mt-1">
                كشف نتج اختبار حفظ القرآن الكريم لأكاديمية الخير - الجزء {formData.juz_number}
              </p>
            </div>
            <button
              onClick={onCancel}
              className="text-white hover:text-gray-200 text-3xl font-bold"
              type="button"
            >
              ×
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
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
                    {studentName || "Student"}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Juz to test / الجزء المراد اختباره
                  </label>
                  <select
                    value={formData.juz_number}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, juz_number: parseInt(e.target.value, 10) }))
                    }
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
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          page_from: parseInt(e.target.value, 10) || 0
                        }))
                      }
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
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          page_to: parseInt(e.target.value, 10) || 0
                        }))
                      }
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
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            test_juz: e.target.checked,
                            test_hizb: e.target.checked ? false : prev.test_hizb
                          }))
                        }
                        className="mr-2"
                      />
                      <span className="text-sm">Juz (جزء)</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.test_hizb}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            test_hizb: e.target.checked,
                            test_juz: e.target.checked ? false : prev.test_juz,
                            hizb_number: e.target.checked ? 1 : prev.hizb_number
                          }))
                        }
                        className="mr-2"
                      />
                      <span className="text-sm">Hizb (1/2 juz) / حزب</span>
                    </label>

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
                              onChange={() =>
                                setFormData((prev) => ({ ...prev, hizb_number: 1 }))
                              }
                              className="mr-2"
                            />
                            <span className="text-xs">1st Hizb / الحزب الأول</span>
                          </label>
                          <label className="flex items-center">
                            <input
                              type="radio"
                              name="hizb_selection"
                              checked={formData.hizb_number === 2}
                              onChange={() =>
                                setFormData((prev) => ({ ...prev, hizb_number: 2 }))
                              }
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
              <div className="space-y-4">
                {Object.entries({
                  memorization: getQuestionConfig(formData.test_hizb).memorization,
                  middle_verse: getQuestionConfig(formData.test_hizb).middle_verse,
                  last_words: getQuestionConfig(formData.test_hizb).last_words,
                  reversal_reading: getQuestionConfig(formData.test_hizb).reversal_reading
                }).map(([category, config]) => (
                  <div key={category} className="border rounded p-3">
                    <h4 className="font-medium text-sm mb-2">{config.title}</h4>
                    <div className="grid grid-cols-5 gap-2">
                      {config.questionNumbers.map((questionNum) => (
                        <div key={questionNum} className="text-center">
                          <div className="text-xs mb-1">{questionNum}</div>
                          <select
                            value={section2Scores[category as keyof Section2Scores]?.[String(questionNum)] || 0}
                            onChange={(e) =>
                              updateScore(
                                category as keyof Section2Scores,
                                String(questionNum),
                                parseInt(e.target.value, 10) || 0
                              )
                            }
                            className="w-full p-1 border rounded text-center text-xs"
                          >
                            {[0, 1, 2, 3, 4, 5].map((score) => (
                              <option key={score} value={score}>
                                {score}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                {Object.entries({
                  verse_position: getQuestionConfig(formData.test_hizb).verse_position,
                  read_verse_no: getQuestionConfig(formData.test_hizb).read_verse_no,
                  understanding: getQuestionConfig(formData.test_hizb).understanding
                }).map(([category, config]) => (
                  <div key={category} className="border rounded p-3">
                    <h4 className="font-medium text-sm mb-2">{config.title}</h4>
                    <div className="grid grid-cols-5 gap-2">
                      {config.questionNumbers.map((questionNum) => (
                        <div key={questionNum} className="text-center">
                          <div className="text-xs mb-1">{questionNum}</div>
                          <select
                            value={section2Scores[category as keyof Section2Scores]?.[String(questionNum)] || 0}
                            onChange={(e) =>
                              updateScore(
                                category as keyof Section2Scores,
                                String(questionNum),
                                parseInt(e.target.value, 10) || 0
                              )
                            }
                            className="w-full p-1 border rounded text-center text-xs"
                          >
                            {[0, 1, 2, 3, 4, 5].map((score) => (
                              <option key={score} value={score}>
                                {score}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div className="border rounded p-3 text-center">
                <h4 className="font-medium text-sm mb-2">Tajweed / التجويد</h4>
                <select
                  value={tajweedScore}
                  onChange={(e) => setTajweedScore(parseInt(e.target.value, 10) || 0)}
                  className="w-16 p-1 border rounded text-center"
                >
                  {[0, 1, 2, 3, 4, 5].map((score) => (
                    <option key={score} value={score}>
                      {score}
                    </option>
                  ))}
                </select>
              </div>
              <div className="border rounded p-3 text-center">
                <h4 className="font-medium text-sm mb-2">Good recitation / حسن الأداء</h4>
                <select
                  value={recitationScore}
                  onChange={(e) => setRecitationScore(parseInt(e.target.value, 10) || 0)}
                  className="w-16 p-1 border rounded text-center"
                >
                  {[0, 1, 2, 3, 4, 5].map((score) => (
                    <option key={score} value={score}>
                      {score}
                    </option>
                  ))}
                </select>
              </div>
              <div className="border rounded p-3 text-center bg-purple-50">
                <h4 className="font-medium text-sm mb-2">Grand total (100%) / المجموع الكامل</h4>
                <div className="text-lg font-bold text-purple-600">{totalPercentage}%</div>
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
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, halaqah_name: e.target.value }))
                    }
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
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, examiner_name: e.target.value }))
                    }
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
              onChange={(e) => setFormData((prev) => ({ ...prev, remarks: e.target.value }))}
              rows={3}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-purple-400"
              placeholder="Barakallahu feeha"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              Save Changes
            </button>
          </div>

          {/* Date */}
          <div className="text-right text-xs text-gray-500 mt-4">{displayDate}</div>
        </form>
      </div>
    </div>
  );
}
