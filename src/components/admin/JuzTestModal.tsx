"use client";

import React, { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/authFetch";
import {
  DEFAULT_JUZ_TEST_MODE,
  NORMAL_TIMER_DEFAULT_SECONDS,
  type JuzTestMode,
  type NormalModeMeta,
  type PmmmCategoryKey,
  type PmmmSection2Scores,
  buildNormalModeMeta,
  buildPmmmSection2Scores,
  calculateNormalModeScore,
  calculatePmmmModeScore,
  getBlockPages,
  getJuzTestModeLabel,
  getJuzTestPageRange,
  getNormalQuestionCount,
  getPassThresholdByMode,
  getPmmmQuestionConfig,
  getQuranPageUrl,
  normalizeJuzTestMode
} from "@/lib/juzTestScoring";

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

type TimerUiState = {
  running: boolean;
  finished: boolean;
};

const EMPTY_TIMER_STATE: TimerUiState = {
  running: false,
  finished: false
};

const clamp = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const formatTimer = (seconds: number): string => {
  const safeSeconds = Math.max(0, seconds);
  const mins = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
};

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
    test_juz: true,
    test_hizb: false,
    hizb_number: 1,
    examiner_name: "",
    remarks: "",
    test_mode: DEFAULT_JUZ_TEST_MODE as JuzTestMode
  });

  const [pmmmScores, setPmmmScores] = useState<PmmmSection2Scores>(() =>
    buildPmmmSection2Scores(false)
  );
  const [normalMeta, setNormalMeta] = useState<NormalModeMeta>(() =>
    buildNormalModeMeta({
      pageFrom: 1,
      pageTo: 20,
      isHizbTest: false,
      defaultSeconds: NORMAL_TIMER_DEFAULT_SECONDS
    })
  );
  const [timerState, setTimerState] = useState<Record<string, TimerUiState>>({});
  const [expandedQuestion, setExpandedQuestion] = useState<string>("1");

  const [tajweedScore, setTajweedScore] = useState(0);
  const [recitationScore, setRecitationScore] = useState(0);

  const mode = normalizeJuzTestMode(formData.test_mode);
  const isNormalMode = mode === "normal_memorization";

  const teacherOptions = React.useMemo(() => {
    const options = [...availableTeachers];
    if (teacherName && !options.includes(teacherName)) {
      options.unshift(teacherName);
    }
    return options;
  }, [availableTeachers, teacherName]);

  const questionConfig = useMemo(
    () => getPmmmQuestionConfig(formData.test_hizb),
    [formData.test_hizb]
  );

  const normalQuestionCount = useMemo(
    () => getNormalQuestionCount(formData.test_hizb),
    [formData.test_hizb]
  );

  const pageRange = useMemo(
    () => getJuzTestPageRange(selectedJuz, formData.test_hizb, formData.hizb_number),
    [selectedJuz, formData.test_hizb, formData.hizb_number]
  );

  useEffect(() => {
    if (!isOpen) return;
    setFormData((prev) => ({
      ...prev,
      page_from: pageRange.from,
      page_to: pageRange.to
    }));
  }, [isOpen, pageRange.from, pageRange.to]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedJuz(defaultJuzNumber);
  }, [defaultJuzNumber, isOpen]);

  useEffect(() => {
    if (!isOpen || !teacherName) return;
    setFormData((prev) => ({
      ...prev,
      halaqah_name: teacherName
    }));
  }, [teacherName, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    setPmmmScores((prev) => buildPmmmSection2Scores(formData.test_hizb, prev));
    setNormalMeta((prev) =>
      buildNormalModeMeta({
        pageFrom: pageRange.from,
        pageTo: pageRange.to,
        isHizbTest: formData.test_hizb,
        existingMeta: prev,
        defaultSeconds: NORMAL_TIMER_DEFAULT_SECONDS
      })
    );
  }, [formData.test_hizb, isOpen, pageRange.from, pageRange.to]);

  useEffect(() => {
    if (!isOpen) return;

    const nextTimerState: Record<string, TimerUiState> = {};
    for (let question = 1; question <= normalQuestionCount; question += 1) {
      const key = String(question);
      nextTimerState[key] = timerState[key] || EMPTY_TIMER_STATE;
    }
    setTimerState(nextTimerState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, normalQuestionCount]);

  useEffect(() => {
    if (!isOpen) return;
    if (Number(expandedQuestion) > normalQuestionCount) {
      setExpandedQuestion("1");
    }
  }, [expandedQuestion, isOpen, normalQuestionCount]);

  useEffect(() => {
    if (!isOpen || !isNormalMode) return;

    const runningQuestions = Object.entries(timerState)
      .filter(([, state]) => state.running && !state.finished)
      .map(([question]) => question);

    if (runningQuestions.length === 0) return;

    const interval = window.setInterval(() => {
      const reachedOvertime: string[] = [];

      setNormalMeta((prev) => {
        const nextTimer = { ...prev.timer };

        runningQuestions.forEach((questionKey) => {
          const currentTimer = nextTimer[questionKey];
          if (!currentTimer) return;

          const allowed = currentTimer.default_seconds + currentTimer.extension_seconds_total;
          const nextElapsed = currentTimer.elapsed_seconds + 1;
          const isOvertime = nextElapsed >= allowed;

          nextTimer[questionKey] = {
            ...currentTimer,
            elapsed: nextElapsed,
            elapsed_seconds: nextElapsed,
            overtime: isOvertime,
            events: currentTimer.events
          };

          if (isOvertime) {
            reachedOvertime.push(questionKey);
          }
        });

        return {
          ...prev,
          timer: nextTimer
        };
      });

      if (reachedOvertime.length > 0) {
        setTimerState((prev) => {
          const next = { ...prev };
          reachedOvertime.forEach((questionKey) => {
            next[questionKey] = {
              ...(next[questionKey] || EMPTY_TIMER_STATE),
              running: false
            };
          });
          return next;
        });
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isNormalMode, isOpen, timerState]);

  const computedResult = useMemo(() => {
    if (isNormalMode) {
      return calculateNormalModeScore(formData.test_hizb, normalMeta.breakdown);
    }

    const result = calculatePmmmModeScore({
      isHizbTest: formData.test_hizb,
      section2Scores: pmmmScores,
      tajweedScore,
      recitationScore
    });

    return {
      memorization: pmmmScores.memorization,
      breakdown: normalMeta.breakdown,
      totalPercentage: result.totalPercentage,
      passed: result.passed
    };
  }, [
    formData.test_hizb,
    isNormalMode,
    normalMeta.breakdown,
    pmmmScores,
    recitationScore,
    tajweedScore
  ]);

  const passed = computedResult.passed;
  const shouldRepeat = !passed;
  const normalAnsweredCount = useMemo(() => {
    if (!isNormalMode) return 0;
    return Object.values(normalMeta.question_map).filter((item) => item.selected_page !== null).length;
  }, [isNormalMode, normalMeta.question_map]);

  const normalProgress = isNormalMode
    ? Math.round((normalAnsweredCount / Math.max(1, normalQuestionCount)) * 100)
    : 0;

  const updatePmmmScore = (category: PmmmCategoryKey, question: string, score: number) => {
    setPmmmScores((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [question]: clamp(score, 0, 5)
      }
    }));
  };

  const updateNormalBreakdown = (
    questionKey: string,
    field: "hafazan" | "quality",
    rawValue: number
  ) => {
    setNormalMeta((prev) => {
      const existing = prev.breakdown[questionKey] || {
        hafazan: 0,
        quality: 0,
        question_total: 0
      };
      const nextHafazan = field === "hafazan" ? clamp(rawValue, 0, 4) : existing.hafazan;
      const nextQuality = field === "quality" ? clamp(rawValue, 0, 1) : existing.quality;

      return {
        ...prev,
        breakdown: {
          ...prev.breakdown,
          [questionKey]: {
            hafazan: nextHafazan,
            quality: nextQuality,
            question_total: Number((nextHafazan + nextQuality).toFixed(2))
          }
        }
      };
    });
  };

  const updateSelectedPage = (questionKey: string, selectedPage: number) => {
    setNormalMeta((prev) => {
      const currentMap = prev.question_map[questionKey];
      if (!currentMap) return prev;
      if (selectedPage < currentMap.block_from || selectedPage > currentMap.block_to) {
        return prev;
      }

      return {
        ...prev,
        question_map: {
          ...prev.question_map,
          [questionKey]: {
            ...currentMap,
            selected_page: selectedPage
          }
        }
      };
    });
  };

  const addTimerEvent = (questionKey: string, type: "start" | "pause" | "resume" | "extend" | "finish", seconds?: number) => {
    setNormalMeta((prev) => {
      const timer = prev.timer[questionKey];
      if (!timer) return prev;
      return {
        ...prev,
        timer: {
          ...prev.timer,
          [questionKey]: {
            ...timer,
            events: [
              ...timer.events,
              {
                type,
                at_iso: new Date().toISOString(),
                seconds
              }
            ]
          }
        }
      };
    });
  };

  const startOrResumeTimer = (questionKey: string) => {
    setTimerState((prev) => {
      const next: Record<string, TimerUiState> = {};
      Object.keys(prev).forEach((key) => {
        next[key] = {
          ...prev[key],
          running: key === questionKey,
          finished: key === questionKey ? prev[key]?.finished || false : prev[key]?.finished || false
        };
      });

      if (!next[questionKey]) {
        next[questionKey] = { running: true, finished: false };
      }

      return next;
    });

    const hasElapsed = (normalMeta.timer[questionKey]?.elapsed_seconds || 0) > 0;
    addTimerEvent(questionKey, hasElapsed ? "resume" : "start");
  };

  const pauseTimer = (questionKey: string) => {
    setTimerState((prev) => ({
      ...prev,
      [questionKey]: {
        ...(prev[questionKey] || EMPTY_TIMER_STATE),
        running: false
      }
    }));

    setNormalMeta((prev) => {
      const timer = prev.timer[questionKey];
      if (!timer) return prev;
      return {
        ...prev,
        timer: {
          ...prev.timer,
          [questionKey]: {
            ...timer,
            pause_count: timer.pause_count + 1
          }
        }
      };
    });

    addTimerEvent(questionKey, "pause");
  };

  const extendTimer = (questionKey: string) => {
    setNormalMeta((prev) => {
      const timer = prev.timer[questionKey];
      if (!timer) return prev;
      return {
        ...prev,
        timer: {
          ...prev.timer,
          [questionKey]: {
            ...timer,
            overtime: false,
            extensions: timer.extensions + 1,
            extension_seconds_total: timer.extension_seconds_total + 30
          }
        }
      };
    });

    addTimerEvent(questionKey, "extend", 30);
    startOrResumeTimer(questionKey);
  };

  const finishTimer = (questionKey: string) => {
    setTimerState((prev) => ({
      ...prev,
      [questionKey]: {
        ...(prev[questionKey] || EMPTY_TIMER_STATE),
        running: false,
        finished: true
      }
    }));

    setNormalMeta((prev) => {
      const timer = prev.timer[questionKey];
      if (!timer) return prev;
      return {
        ...prev,
        timer: {
          ...prev.timer,
          [questionKey]: {
            ...timer,
            overtime: false
          }
        }
      };
    });

    addTimerEvent(questionKey, "finish");
  };

  const handleSubmit = async () => {
    setLoading(true);

    try {
      const normalizedMode = normalizeJuzTestMode(formData.test_mode);
      const normalizedNormalMeta = buildNormalModeMeta({
        pageFrom: formData.page_from,
        pageTo: formData.page_to,
        isHizbTest: formData.test_hizb,
        existingMeta: normalMeta,
        defaultSeconds: NORMAL_TIMER_DEFAULT_SECONDS
      });

      const normalScore = calculateNormalModeScore(formData.test_hizb, normalizedNormalMeta.breakdown);
      const pmmmResult = calculatePmmmModeScore({
        isHizbTest: formData.test_hizb,
        section2Scores: pmmmScores,
        tajweedScore,
        recitationScore
      });

      const totalPercentage =
        normalizedMode === "normal_memorization"
          ? normalScore.totalPercentage
          : pmmmResult.totalPercentage;

      const passThreshold = getPassThresholdByMode(normalizedMode);
      const resolvedPassed = totalPercentage >= passThreshold;

      const section2Scores =
        normalizedMode === "normal_memorization"
          ? {
              memorization: normalScore.memorization,
              normal_meta: {
                ...normalizedNormalMeta,
                breakdown: normalScore.breakdown
              }
            }
          : pmmmScores;

      const payload = {
        student_id: studentId,
        juz_number: selectedJuz,
        test_date: new Date().toISOString().split("T")[0],
        examiner_id: null,
        halaqah_name: formData.halaqah_name,
        page_from: formData.page_from,
        page_to: formData.page_to,
        test_juz: formData.test_juz,
        test_hizb: formData.test_hizb,
        hizb_number: formData.test_hizb ? formData.hizb_number : null,
        test_mode: normalizedMode,
        section2_scores: section2Scores,
        tajweed_score: normalizedMode === "normal_memorization" ? 0 : tajweedScore,
        recitation_score: normalizedMode === "normal_memorization" ? 0 : recitationScore,
        total_percentage: totalPercentage,
        passed: resolvedPassed,
        should_repeat: !resolvedPassed,
        examiner_name: formData.examiner_name,
        remarks: formData.remarks
      };

      const response = await authFetch("/api/admin/juz-tests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to submit juz test");
      }

      onSubmit();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error occurred";
      alert(`Failed to submit juz test: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white">
        <div className="rounded-t-lg bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Akademi Al Khayr</h2>
              <p className="text-sm opacity-90">
                Quranic Memorization Test Result for Academy Al Khayr - Juz {selectedJuz}
              </p>
              <p className="mt-1 text-xs opacity-75">
                كشف نتج اختبار حفظ القرآن الكريم لأكاديمية الخير - الجزء {selectedJuz}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-3xl font-bold text-white hover:text-gray-200"
              type="button"
            >
              ×
            </button>
          </div>
        </div>

        <div className="space-y-6 p-6">
          <div className="sticky top-0 z-20 rounded-xl border border-slate-200 bg-white/95 p-3 backdrop-blur">
            <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-5 md:text-sm">
              <div>
                <div className="text-slate-500">Mode</div>
                <div className="font-semibold text-slate-800">{getJuzTestModeLabel(mode)}</div>
              </div>
              <div>
                <div className="text-slate-500">Type</div>
                <div className="font-semibold text-slate-800">{formData.test_hizb ? "Hizb" : "Juz"}</div>
              </div>
              <div>
                <div className="text-slate-500">Score</div>
                <div className="font-semibold text-slate-800">{computedResult.totalPercentage}%</div>
              </div>
              <div>
                <div className="text-slate-500">Status</div>
                <div className={`font-semibold ${passed ? "text-emerald-700" : "text-rose-700"}`}>
                  {passed ? "PASSED" : "FAILED"}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Progress</div>
                <div className="font-semibold text-slate-800">
                  {isNormalMode ? `${normalAnsweredCount}/${normalQuestionCount} (${normalProgress}%)` : "PMMM"}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
              Mode / Mod Penilaian
            </h3>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, test_mode: "pmmm" }))}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  mode === "pmmm" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                PMMM
              </button>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, test_mode: "normal_memorization" }))}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  mode === "normal_memorization"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Without PMMM
              </button>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="mb-4 text-lg font-semibold text-purple-800">Section 1 / القسم الأول</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Student&apos;s name / اسم الطالب
                  </label>
                  <div className="rounded border bg-gray-100 p-2 font-medium">{studentName}</div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Juz to test / الجزء المراد اختباره
                  </label>
                  <select
                    value={selectedJuz}
                    onChange={(e) => setSelectedJuz(parseInt(e.target.value, 10))}
                    className="w-full rounded border p-2 focus:ring-2 focus:ring-purple-400"
                  >
                    {Array.from({ length: 30 }, (_, index) => index + 1).map((juz) => (
                      <option key={juz} value={juz}>
                        Juz {juz} / الجزء {juz}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">From (من)</label>
                    <input
                      type="number"
                      value={formData.page_from}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          page_from: parseInt(e.target.value, 10) || 0
                        }))
                      }
                      className="w-full rounded border p-2 focus:ring-2 focus:ring-purple-400"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">To (إلى)</label>
                    <input
                      type="number"
                      value={formData.page_to}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          page_to: parseInt(e.target.value, 10) || 0
                        }))
                      }
                      className="w-full rounded border p-2 focus:ring-2 focus:ring-purple-400"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Test category / نوع الاختبار
                  </label>
                  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          test_juz: true,
                          test_hizb: false
                        }))
                      }
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                        formData.test_juz
                          ? "bg-slate-900 text-white"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      Juz
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          test_juz: false,
                          test_hizb: true,
                          hizb_number: prev.hizb_number || 1
                        }))
                      }
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                        formData.test_hizb
                          ? "bg-slate-900 text-white"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      Hizb
                    </button>
                  </div>

                  {formData.test_hizb && (
                    <div className="mt-3">
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                        Select Hizb / اختر الحزب
                      </label>
                      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, hizb_number: 1 }))}
                          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                            formData.hizb_number === 1
                              ? "bg-slate-900 text-white"
                              : "text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          1st Hizb
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, hizb_number: 2 }))}
                          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                            formData.hizb_number === 2
                              ? "bg-slate-900 text-white"
                              : "text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          2nd Hizb
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="mb-4 text-lg font-semibold text-purple-800">Section 2 / القسم الثاني</h3>

            {!isNormalMode && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                  {([
                    "memorization",
                    "middle_verse",
                    "last_words",
                    "reversal_reading"
                  ] as PmmmCategoryKey[]).map((category) => {
                    const config = questionConfig[category];
                    return (
                      <div key={category} className="rounded-xl border border-slate-200 bg-white p-3">
                        <h4 className="mb-2 text-sm font-medium text-slate-700">{config.title}</h4>
                        <div className="grid grid-cols-5 gap-2">
                          {config.questionNumbers.map((questionNum) => (
                            <div key={questionNum} className="text-center">
                              <div className="mb-1 text-xs">{questionNum}</div>
                              <select
                                value={pmmmScores[category][String(questionNum)] || 0}
                                onChange={(e) =>
                                  updatePmmmScore(
                                    category,
                                    String(questionNum),
                                    parseInt(e.target.value, 10) || 0
                                  )
                                }
                                className="w-full rounded-md border border-slate-200 bg-white p-1 text-center text-xs"
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
                    );
                  })}
                </div>

                <div className="space-y-4">
                  {([
                    "verse_position",
                    "read_verse_no",
                    "understanding"
                  ] as PmmmCategoryKey[]).map((category) => {
                    const config = questionConfig[category];
                    return (
                      <div key={category} className="rounded-xl border border-slate-200 bg-white p-3">
                        <h4 className="mb-2 text-sm font-medium text-slate-700">{config.title}</h4>
                        <div className="grid grid-cols-5 gap-2">
                          {config.questionNumbers.map((questionNum) => (
                            <div key={questionNum} className="text-center">
                              <div className="mb-1 text-xs">{questionNum}</div>
                              <select
                                value={pmmmScores[category][String(questionNum)] || 0}
                                onChange={(e) =>
                                  updatePmmmScore(
                                    category,
                                    String(questionNum),
                                    parseInt(e.target.value, 10) || 0
                                  )
                                }
                                className="w-full rounded-md border border-slate-200 bg-white p-1 text-center text-xs"
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
                    );
                  })}
                </div>
              </div>
            )}

            {isNormalMode && (
              <div className="space-y-4">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
                  Normal mode scoring: `hafazan (0-4) + quality (0-1)` per soalan. Lulus auto jika
                  markah keseluruhan ≥ 60%.
                </div>
                {Array.from({ length: normalQuestionCount }, (_, index) => index + 1).map((question) => {
                  const key = String(question);
                  const map = normalMeta.question_map[key];
                  const breakdown = normalMeta.breakdown[key];
                  const timerMeta = normalMeta.timer[key];
                  const uiTimer = timerState[key] || EMPTY_TIMER_STATE;
                  const pages = map ? getBlockPages(map) : [];
                  const allowedSeconds =
                    (timerMeta?.default_seconds || NORMAL_TIMER_DEFAULT_SECONDS) +
                    (timerMeta?.extension_seconds_total || 0);
                  const remainingSeconds = Math.max(
                    0,
                    allowedSeconds - (timerMeta?.elapsed_seconds || 0)
                  );
                  const isExpanded = expandedQuestion === key;

                  return (
                    <div key={key} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <button
                        type="button"
                        onClick={() => setExpandedQuestion((prev) => (prev === key ? "" : key))}
                        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
                      >
                        <div>
                          <div className="text-sm font-semibold text-slate-800">
                            Soalan {question} • Blok {map?.block_from ?? "-"}-{map?.block_to ?? "-"}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {map?.selected_page ? `Selected page ${map.selected_page}` : "No page selected"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-slate-800">
                            {(breakdown?.question_total ?? 0).toFixed(1)}/5
                          </div>
                          <div className="text-xs text-slate-500">{formatTimer(remainingSeconds)}</div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="space-y-3 border-t border-slate-200 px-4 py-4">
                          <div>
                            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                              Pilih page (manual)
                            </label>
                            <select
                              value={map?.selected_page ?? ""}
                              onChange={(e) => updateSelectedPage(key, parseInt(e.target.value, 10))}
                              className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm md:w-64"
                            >
                              <option value="" disabled>
                                Select page
                              </option>
                              {pages.map((page) => (
                                <option key={page} value={page}>
                                  Page {page}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {pages.map((page) => (
                              <a
                                key={page}
                                href={getQuranPageUrl(page)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                                  page === map?.selected_page
                                    ? "border-slate-900 bg-slate-900 text-white"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                                }`}
                              >
                                Page {page}
                              </a>
                            ))}
                          </div>

                          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-slate-600">
                                Hafazan (0-4)
                              </label>
                              <select
                                value={breakdown?.hafazan ?? 0}
                                onChange={(e) =>
                                  updateNormalBreakdown(
                                    key,
                                    "hafazan",
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm"
                              >
                                {[0, 1, 2, 3, 4].map((score) => (
                                  <option key={score} value={score}>
                                    {score}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-slate-600">
                                Quality (0-1)
                              </label>
                              <select
                                value={breakdown?.quality ?? 0}
                                onChange={(e) =>
                                  updateNormalBreakdown(
                                    key,
                                    "quality",
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm"
                              >
                                {[0, 0.5, 1].map((score) => (
                                  <option key={score} value={score}>
                                    {score}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-slate-600">
                                Question Total
                              </label>
                              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm font-semibold text-slate-800">
                                {(breakdown?.question_total ?? 0).toFixed(1)} / 5
                              </div>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-slate-600">
                                Timer
                              </label>
                              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm font-semibold text-slate-800">
                                {formatTimer(remainingSeconds)}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {!uiTimer.running && !uiTimer.finished && !timerMeta?.overtime && (
                              <button
                                type="button"
                                onClick={() => startOrResumeTimer(key)}
                                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                              >
                                {(timerMeta?.elapsed_seconds || 0) > 0 ? "Resume" : "Start"}
                              </button>
                            )}

                            {uiTimer.running && (
                              <button
                                type="button"
                                onClick={() => pauseTimer(key)}
                                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
                              >
                                Pause
                              </button>
                            )}

                            {timerMeta?.overtime && !uiTimer.finished && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => extendTimer(key)}
                                  className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
                                >
                                  +30s
                                </button>
                                <button
                                  type="button"
                                  onClick={() => finishTimer(key)}
                                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                                >
                                  Tamat Soalan
                                </button>
                              </>
                            )}

                            {uiTimer.finished && (
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                                Soalan ditamatkan
                              </span>
                            )}

                            <span className="text-xs text-slate-500">
                              Elapsed: {timerMeta?.elapsed_seconds || 0}s • Extensions: {timerMeta?.extensions || 0}
                              • Pause: {timerMeta?.pause_count || 0}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!isNormalMode && (
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                  <h4 className="mb-2 text-sm font-medium">Tajweed / التجويد</h4>
                  <select
                    value={tajweedScore}
                    onChange={(e) => setTajweedScore(parseInt(e.target.value, 10) || 0)}
                    className="w-16 rounded-md border border-slate-200 bg-white p-1 text-center"
                  >
                    {[0, 1, 2, 3, 4, 5].map((score) => (
                      <option key={score} value={score}>
                        {score}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                  <h4 className="mb-2 text-sm font-medium">Good recitation / حسن الأداء</h4>
                  <select
                    value={recitationScore}
                    onChange={(e) => setRecitationScore(parseInt(e.target.value, 10) || 0)}
                    className="w-16 rounded-md border border-slate-200 bg-white p-1 text-center"
                  >
                    {[0, 1, 2, 3, 4, 5].map((score) => (
                      <option key={score} value={score}>
                        {score}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                  <h4 className="mb-2 text-sm font-medium">Grand total (100%) / المجموع الكامل</h4>
                  <div className="text-lg font-bold text-purple-600">{computedResult.totalPercentage}%</div>
                </div>
              </div>
            )}
          </div>

          {isNormalMode && (
            <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="text-sm font-semibold text-slate-800">Auto Result</h4>
              <p className="mt-1 text-sm text-slate-600">
                Total: {computedResult.totalPercentage}% • Threshold: {getPassThresholdByMode(mode)}% •
                Status: {passed ? "PASSED" : "FAILED"}
              </p>
            </div>
          )}

          <div className="mb-6">
            <h3 className="mb-4 text-lg font-semibold text-slate-800">Section 3 / القسم الثالث</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Halaqah&apos;s name / اسم الحلقة
                  </label>
                  <select
                    value={formData.halaqah_name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, halaqah_name: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-200 p-2 focus:ring-2 focus:ring-slate-300"
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
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Examiner&apos;s name / اسم المختبر
                  </label>
                  <input
                    type="text"
                    value={formData.examiner_name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, examiner_name: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-200 p-2 focus:ring-2 focus:ring-slate-300"
                  />
                </div>
              </div>
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Computed Result:</span>{" "}
                  <span className={passed ? "text-green-700" : "text-red-700"}>
                    {passed ? "PASSED" : "FAILED"}
                  </span>
                </div>
                <div className="text-gray-600">
                  Should repeat: <strong>{shouldRepeat ? "Yes" : "No"}</strong>
                </div>
                <div className="text-gray-600">
                  Formula: {isNormalMode ? "(Σ question_total / (n×5)) × 100" : "PMMM weighted formula"}
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium text-slate-700">Remarks / ملاحظات</label>
            <textarea
              value={formData.remarks}
              onChange={(e) => setFormData((prev) => ({ ...prev, remarks: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-slate-200 p-2 focus:ring-2 focus:ring-slate-300"
              placeholder="Barakallahu feeha"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 transition-colors hover:bg-gray-50"
              type="button"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="rounded-lg bg-purple-600 px-6 py-2 text-white transition-colors hover:bg-purple-700 disabled:bg-purple-400"
              type="button"
            >
              {loading ? "Submitting..." : "Submit Test"}
            </button>
          </div>

          <div className="mt-4 text-right text-xs text-gray-500">
            {new Date().toLocaleDateString("en-GB")}
          </div>
        </div>
      </div>
    </div>
  );
};

export default JuzTestModal;
