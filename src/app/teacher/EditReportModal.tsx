import React, { useState, useEffect, useMemo } from "react";
import type { Report } from "@/types/teacher";
import NewMurajaahRangeSection from "@/components/teacher/NewMurajaahRangeSection";
import { getJuzFromPageRange, getPageWithinJuz } from "@/lib/quranMapping";
import {
  computeNewMurajaahRange,
  DEFAULT_NEW_MURAJAAH_LAST_N,
  MAX_NEW_MURAJAAH_LAST_N,
  MAX_NEW_MURAJAAH_SPAN,
  parseNullableInt,
  type NewMurajaahRangeMode
} from "@/lib/murajaahRange";

interface EditReportModalProps {
  report: Report;
  onSave: (updated: Report) => void;
  onCancel: () => void;
  grades: string[];
  surahs: string[];
  tasmiReports?: Report[];
}

const OLD_MURAJAAH_SURAH_LABEL = "PMMM";
const OLD_MURAJAAH_TEST_PASS_THRESHOLD = 60;
type OldMurajaahMode = "recitation" | "test";
type OldMurajaahScoreCategory =
  | "memorization"
  | "middle_verse"
  | "last_words"
  | "reversal_reading"
  | "verse_position";

interface OldMurajaahSection2Scores {
  memorization: Record<string, number>;
  middle_verse: Record<string, number>;
  last_words: Record<string, number>;
  reversal_reading: Record<string, number>;
  verse_position: Record<string, number>;
}

const OLD_MURAJAAH_TEST_QUESTION_CONFIG: Record<
  OldMurajaahScoreCategory,
  { title: string; questionNumbers: number[] }
> = {
  memorization: { title: "Repeat and Continue", questionNumbers: [1, 2] },
  middle_verse: { title: "Middle of the Verse", questionNumbers: [1] },
  last_words: { title: "Last of the Verse", questionNumbers: [1] },
  reversal_reading: { title: "Reversal Reading", questionNumbers: [1] },
  verse_position: { title: "Position of the Verse", questionNumbers: [1] }
};

const buildOldMurajaahTestInitialScores = (): OldMurajaahSection2Scores => ({
  memorization: { "1": 0, "2": 0 },
  middle_verse: { "1": 0 },
  last_words: { "1": 0 },
  reversal_reading: { "1": 0 },
  verse_position: { "1": 0 }
});

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const clampScore = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(5, Math.round(parsed)));
};

const getInitialOldMurajaahMode = (readingProgress: unknown): OldMurajaahMode => {
  if (!isObject(readingProgress)) return "recitation";
  return readingProgress.murajaah_mode === "test" ? "test" : "recitation";
};

const getInitialSection2Scores = (readingProgress: unknown): OldMurajaahSection2Scores => {
  if (!isObject(readingProgress)) return buildOldMurajaahTestInitialScores();
  const assessment = isObject(readingProgress.test_assessment)
    ? readingProgress.test_assessment
    : null;
  const section2 = assessment && isObject(assessment.section2_scores)
    ? assessment.section2_scores
    : null;
  const fallback = buildOldMurajaahTestInitialScores();
  if (!section2) return fallback;

  return (Object.keys(OLD_MURAJAAH_TEST_QUESTION_CONFIG) as OldMurajaahScoreCategory[]).reduce(
    (acc, category) => {
      const rawCategory = isObject(section2[category]) ? section2[category] : {};
      const mappedScores = OLD_MURAJAAH_TEST_QUESTION_CONFIG[category].questionNumbers.reduce(
        (scores, questionNum) => ({
          ...scores,
          [String(questionNum)]: clampScore(rawCategory[String(questionNum)])
        }),
        {} as Record<string, number>
      );
      return {
        ...acc,
        [category]: mappedScores
      };
    },
    fallback
  );
};

const getInitialAssessmentScore = (readingProgress: unknown, key: string): number => {
  if (!isObject(readingProgress)) return 0;
  const assessment = isObject(readingProgress.test_assessment)
    ? readingProgress.test_assessment
    : null;
  if (!assessment) return 0;
  return clampScore(assessment[key]);
};

const coerceRangeMode = (value: unknown): NewMurajaahRangeMode | null => {
  if (value === "last_n" || value === "manual_range") return value;
  return null;
};

const getInitialNewMurajaahSelection = (report: Report) => {
  const fallbackFrom = report.page_from ?? report.page_to ?? null;
  const fallbackTo = report.page_to ?? report.page_from ?? null;
  const fallbackCount = fallbackFrom && fallbackTo
    ? Math.max(1, Math.min(MAX_NEW_MURAJAAH_LAST_N, Math.abs(fallbackTo - fallbackFrom) + 1))
    : DEFAULT_NEW_MURAJAAH_LAST_N;
  const fallback = {
    rangeMode: "manual_range" as NewMurajaahRangeMode,
    specificPage: fallbackTo ? String(fallbackTo) : "",
    lastN: String(fallbackCount),
    manualFrom: fallbackFrom ? String(fallbackFrom) : "",
    manualTo: fallbackTo ? String(fallbackTo) : ""
  };

  if (!isObject(report.reading_progress)) return fallback;
  const selection = isObject(report.reading_progress.murajaah_selection)
    ? report.reading_progress.murajaah_selection
    : null;
  if (!selection) return fallback;

  const input = isObject(selection.input) ? selection.input : {};
  const rangeMode = coerceRangeMode(selection.builder) ?? fallback.rangeMode;
  const specificPage = parseNullableInt(input.specific_page);
  const lastN = parseNullableInt(input.last_n);
  const manualFrom = parseNullableInt(input.manual_from);
  const manualTo = parseNullableInt(input.manual_to);

  return {
    rangeMode,
    specificPage: specificPage ? String(specificPage) : fallback.specificPage,
    lastN: lastN ? String(lastN) : fallback.lastN,
    manualFrom: manualFrom ? String(manualFrom) : fallback.manualFrom,
    manualTo: manualTo ? String(manualTo) : fallback.manualTo
  };
};

export default function EditReportModal(
  { report, onSave, onCancel, grades, surahs, tasmiReports, loading = false, error = "" }:
  EditReportModalProps & { loading?: boolean; error?: string }
) {
  const [form, setForm] = useState<Report>({ ...report });
  const initialSurahRange = (() => {
    if (!report.surah || !report.surah.includes(" - ")) return null;
    const [from, to] = report.surah.split(" - ");
    if (!surahs.includes(from) || !surahs.includes(to)) return null;
    return { from, to };
  })();
  const [oldMurajaahMode, setOldMurajaahMode] = useState<OldMurajaahMode>(
    getInitialOldMurajaahMode(report.reading_progress)
  );
  const [oldMurajaahSection2Scores, setOldMurajaahSection2Scores] =
    useState<OldMurajaahSection2Scores>(getInitialSection2Scores(report.reading_progress));
  const [oldMurajaahReadVerseNoScore, setOldMurajaahReadVerseNoScore] = useState(
    getInitialAssessmentScore(report.reading_progress, "read_verse_no_score")
  );
  const [oldMurajaahUnderstandingScore, setOldMurajaahUnderstandingScore] = useState(
    getInitialAssessmentScore(report.reading_progress, "understanding_score")
  );
  const isNewMurajaah = form.type === "New Murajaah";
  const isOldMurajaah = form.type === "Old Murajaah" || form.type === "Murajaah";
  const initialNewMurajaahSelection = getInitialNewMurajaahSelection(report);
  const [isMultiSurah, setIsMultiSurah] = useState(Boolean(initialSurahRange));
  const [surahFrom, setSurahFrom] = useState(initialSurahRange?.from ?? "");
  const [surahTo, setSurahTo] = useState(initialSurahRange?.to ?? "");
  const [isWithinRange, setIsWithinRange] = useState(
    Boolean(form.page_from && form.page_to && form.page_from !== form.page_to)
  );
  const [newMurajaahRangeMode, setNewMurajaahRangeMode] = useState<NewMurajaahRangeMode>(
    initialNewMurajaahSelection.rangeMode
  );
  const [newMurajaahLastN, setNewMurajaahLastN] = useState(
    initialNewMurajaahSelection.lastN
  );
  const [newMurajaahManualFrom, setNewMurajaahManualFrom] = useState(
    initialNewMurajaahSelection.manualFrom
  );
  const [newMurajaahManualTo, setNewMurajaahManualTo] = useState(
    initialNewMurajaahSelection.manualTo
  );

  const oldMurajaahTestTotalPercentage = useMemo(() => {
    if (!isOldMurajaah || oldMurajaahMode !== "test") return 0;
    const section2Total = Object.values(oldMurajaahSection2Scores).reduce(
      (sum, categoryScores) =>
        sum + Object.values(categoryScores).reduce<number>(
          (categorySum, score) => categorySum + (Number(score) || 0),
          0
        ),
      0
    );
    const maxSection2Score = Object.values(OLD_MURAJAAH_TEST_QUESTION_CONFIG).reduce(
      (sum, config) => sum + config.questionNumbers.length * 5,
      0
    );
    const totalScore = section2Total + oldMurajaahReadVerseNoScore + oldMurajaahUnderstandingScore;
    const maxTotalScore = maxSection2Score + 10;
    if (maxTotalScore <= 0) return 0;
    return Math.round((totalScore / maxTotalScore) * 100);
  }, [
    isOldMurajaah,
    oldMurajaahMode,
    oldMurajaahSection2Scores,
    oldMurajaahReadVerseNoScore,
    oldMurajaahUnderstandingScore
  ]);
  const oldMurajaahTestPassed = oldMurajaahTestTotalPercentage >= OLD_MURAJAAH_TEST_PASS_THRESHOLD;

  const oldMurajaahPreview = useMemo(() => {
    if (!isOldMurajaah) return null;
    const fromValue = form.page_from ? Number(form.page_from) : null;
    const toValue = form.page_to ? Number(form.page_to) : null;
    if (!fromValue) return null;
    const endValue = isWithinRange ? toValue : fromValue;
    if (!endValue) return null;
    if (fromValue < 1 || fromValue > 604 || endValue < 1 || endValue > 604) {
      return null;
    }
    const juzValue = getJuzFromPageRange(fromValue, endValue);
    const pageWithin = getPageWithinJuz(endValue);
    if (!juzValue || !pageWithin) return null;
    return {
      juz: juzValue,
      pageWithin,
      from: Math.min(fromValue, endValue),
      to: Math.max(fromValue, endValue)
    };
  }, [form.page_from, form.page_to, isOldMurajaah, isWithinRange]);

  const latestTasmiPage = useMemo(() => {
    if (!tasmiReports?.length) return null;
    const latestTasmi = tasmiReports
      .filter((entry) => entry.student_id === report.student_id && entry.type === "Tasmi")
      .filter((entry) => entry.page_from !== null || entry.page_to !== null)
      .sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        const aAnchor = Math.max(a.page_to ?? 0, a.page_from ?? 0);
        const bAnchor = Math.max(b.page_to ?? 0, b.page_from ?? 0);
        return bAnchor - aAnchor;
      })[0];
    if (!latestTasmi) return null;
    return latestTasmi.page_to ?? latestTasmi.page_from ?? null;
  }, [tasmiReports, report.student_id]);

  const newMurajaahRange = useMemo(() => (
    computeNewMurajaahRange({
      sourceMode: newMurajaahRangeMode === "last_n" ? "latest_tasmi" : "specific_page",
      rangeMode: newMurajaahRangeMode,
      latestTasmiPage,
      specificPage: null,
      lastN: parseNullableInt(newMurajaahLastN),
      manualFrom: parseNullableInt(newMurajaahManualFrom),
      manualTo: parseNullableInt(newMurajaahManualTo),
      maxLastN: MAX_NEW_MURAJAAH_LAST_N,
      maxSpan: MAX_NEW_MURAJAAH_SPAN
    })
  ), [
    latestTasmiPage,
    newMurajaahRangeMode,
    newMurajaahLastN,
    newMurajaahManualFrom,
    newMurajaahManualTo
  ]);

  useEffect(() => {
    if (isNewMurajaah || isOldMurajaah) return;
    const pageFrom = form.page_from;
    const pageTo = form.page_to;

    if (pageFrom && pageFrom >= 1 && pageFrom <= 604) {
      const juz = getJuzFromPageRange(pageFrom, pageTo || undefined);
      if (juz && juz !== form.juzuk) {
        setForm((f) => ({ ...f, juzuk: juz }));
      }
    }
  }, [form.page_from, form.page_to, form.juzuk, isNewMurajaah, isOldMurajaah]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setForm((f: Report) => ({ ...f, [name]: value }));
  }

  const updateOldMurajaahScore = (
    category: OldMurajaahScoreCategory,
    question: string,
    score: number
  ) => {
    setOldMurajaahSection2Scores((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [question]: score
      }
    }));
  };

  const handleNewMurajaahRangeModeChange = (mode: NewMurajaahRangeMode) => {
    setNewMurajaahRangeMode(mode);
    if (mode !== "manual_range") return;
    if (newMurajaahManualFrom && newMurajaahManualTo) return;

    const prefill = computeNewMurajaahRange({
      sourceMode: "latest_tasmi",
      rangeMode: "last_n",
      latestTasmiPage,
      specificPage: null,
      lastN: parseNullableInt(newMurajaahLastN),
      manualFrom: null,
      manualTo: null,
      maxLastN: MAX_NEW_MURAJAAH_LAST_N,
      maxSpan: MAX_NEW_MURAJAAH_SPAN
    });

    if (!prefill.isValid || prefill.pageFrom === null || prefill.pageTo === null) return;
    if (!newMurajaahManualFrom) setNewMurajaahManualFrom(String(prefill.pageFrom));
    if (!newMurajaahManualTo) setNewMurajaahManualTo(String(prefill.pageTo));
  };

  const emitValidationError = (message: string) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("edit-modal-error", {
          detail: message
        })
      );
    }
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const requiredPageValidation = isNewMurajaah
      ? !newMurajaahRange.isValid
      : isOldMurajaah
        ? (!form.page_from || (isWithinRange && !form.page_to))
        : !form.page_from;
    const requiresSurahAndAyat = !isOldMurajaah;
    const hasSurah = requiresSurahAndAyat
      ? (isMultiSurah ? Boolean(surahFrom && surahTo) : Boolean(form.surah))
      : true;
    const hasAyatRange = requiresSurahAndAyat
      ? Boolean(form.ayat_from) && Boolean(form.ayat_to)
      : true;
    const requiresGrade = !(isOldMurajaah && oldMurajaahMode === "test");

    if (!form.type || !hasSurah || !hasAyatRange || requiredPageValidation || (requiresGrade && !form.grade)) {
      emitValidationError(
        isNewMurajaah && !newMurajaahRange.isValid
          ? newMurajaahRange.error ?? "Please fill in all required fields."
          : "Please fill in all required fields."
      );
      return;
    }

    let surahLabel = form.surah;
    if (isOldMurajaah) {
      surahLabel = OLD_MURAJAAH_SURAH_LABEL;
    } else if (isMultiSurah) {
      const startIdx = surahs.indexOf(surahFrom);
      const endIdx = surahs.indexOf(surahTo);
      if (startIdx === -1 || endIdx === -1) {
        emitValidationError("Invalid surah range selected.");
        return;
      }
      const from = Math.min(startIdx, endIdx);
      const to = Math.max(startIdx, endIdx);
      surahLabel = `${surahs[from]} - ${surahs[to]}`;
    }

    let resolvedPageFrom = form.page_from ? Number(form.page_from) : null;
    let resolvedPageTo = form.page_to ? Number(form.page_to) : null;
    let resolvedJuz = form.juzuk ? Number(form.juzuk) : null;
    if (isOldMurajaah) {
      const fromValue = form.page_from ? Number(form.page_from) : null;
      const toValue = form.page_to ? Number(form.page_to) : null;
      const endValue = isWithinRange ? toValue : fromValue;
      if (!fromValue || !endValue) {
        emitValidationError("Please fill in all required fields.");
        return;
      }
      if (fromValue < 1 || fromValue > 604 || endValue < 1 || endValue > 604) {
        emitValidationError("Page must be between 1 and 604.");
        return;
      }
      resolvedPageFrom = Math.min(fromValue, endValue);
      resolvedPageTo = Math.max(fromValue, endValue);
      resolvedJuz = getJuzFromPageRange(resolvedPageFrom, resolvedPageTo);
    } else if (isNewMurajaah) {
      if (
        !newMurajaahRange.isValid ||
        newMurajaahRange.pageFrom === null ||
        newMurajaahRange.pageTo === null
      ) {
        emitValidationError(newMurajaahRange.error ?? "Please fill in all required fields.");
        return;
      }
      resolvedPageFrom = newMurajaahRange.pageFrom;
      resolvedPageTo = newMurajaahRange.pageTo;
      resolvedJuz = newMurajaahRange.juz;
    } else {
      resolvedPageFrom = form.page_from ? Number(form.page_from) : null;
      resolvedPageTo = form.page_to ? Number(form.page_to) : resolvedPageFrom;
      resolvedJuz = form.juzuk ? Number(form.juzuk) : null;
    }

    const resolvedAyatFrom = isOldMurajaah ? 1 : Number(form.ayat_from);
    const resolvedAyatTo = isOldMurajaah ? 1 : Number(form.ayat_to);
    if (!isOldMurajaah && (!Number.isFinite(resolvedAyatFrom) || !Number.isFinite(resolvedAyatTo))) {
      emitValidationError("Please fill in all required fields.");
      return;
    }
    const readingProgress = isOldMurajaah
      ? oldMurajaahMode === "test"
        ? {
            murajaah_mode: "test" as const,
            test_assessment: {
              section2_scores: oldMurajaahSection2Scores,
              read_verse_no_score: oldMurajaahReadVerseNoScore,
              understanding_score: oldMurajaahUnderstandingScore,
              total_percentage: oldMurajaahTestTotalPercentage,
              passed: oldMurajaahTestPassed,
              pass_threshold: OLD_MURAJAAH_TEST_PASS_THRESHOLD
            }
          }
        : { murajaah_mode: "recitation" as const }
      : isNewMurajaah
        ? {
            ...(isObject(form.reading_progress) ? form.reading_progress : {}),
            murajaah_selection: {
              source: newMurajaahRangeMode === "last_n" ? "auto_latest_tasmi" : "specific_page",
              builder: newMurajaahRangeMode,
              input: {
                latest_tasmi_page: latestTasmiPage,
                specific_page: null,
                last_n: parseNullableInt(newMurajaahLastN),
                manual_from: parseNullableInt(newMurajaahManualFrom),
                manual_to: parseNullableInt(newMurajaahManualTo)
              },
              resolved_range: {
                page_from: resolvedPageFrom,
                page_to: resolvedPageTo
              }
            }
          }
      : (form.reading_progress ?? null);

    onSave({
      ...form,
      surah: surahLabel,
      juzuk: resolvedJuz,
      ayat_from: resolvedAyatFrom,
      ayat_to: resolvedAyatTo,
      page_from: resolvedPageFrom,
      page_to: resolvedPageTo,
      grade: isOldMurajaah && oldMurajaahMode === "test" ? null : form.grade,
      reading_progress: readingProgress
    });
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white/95 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">Edit Report</h3>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {isOldMurajaah && (
            <div className="sm:col-span-2 rounded-xl border border-amber-100 bg-amber-50/70 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold text-amber-700">Old Murajaah (PMMM within page range)</div>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">PMMM</span>
              </div>
              <div className="mb-3 inline-flex rounded-full bg-white/80 p-1 border border-amber-200">
                <button
                  type="button"
                  onClick={() => setOldMurajaahMode("recitation")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                    oldMurajaahMode === "recitation"
                      ? "bg-amber-600 text-white"
                      : "text-amber-700 hover:text-amber-800"
                  }`}
                >
                  Recitation
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOldMurajaahMode("test");
                    setForm((f) => ({ ...f, grade: null }));
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                    oldMurajaahMode === "test"
                      ? "bg-amber-600 text-white"
                      : "text-amber-700 hover:text-amber-800"
                  }`}
                >
                  Test
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {!isWithinRange ? (
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-amber-700 mb-1">Actual Page *</label>
                    <input
                      type="number"
                      min="1"
                      max="604"
                      placeholder="Page number"
                      value={form.page_from ?? ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        const numeric = value ? Number(value) : null;
                        setForm((f) => ({
                          ...f,
                          page_from: numeric,
                          page_to: numeric
                        }));
                      }}
                      className="w-full border border-amber-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-400 text-sm"
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs text-amber-700 mb-1">Page from *</label>
                      <input
                        type="number"
                        min="1"
                        max="604"
                        placeholder="From"
                        value={form.page_from ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setForm((f) => ({ ...f, page_from: value ? Number(value) : null }));
                        }}
                        className="w-full border border-amber-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-400 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-amber-700 mb-1">Page to *</label>
                      <input
                        type="number"
                        min="1"
                        max="604"
                        placeholder="To"
                        value={form.page_to ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setForm((f) => ({ ...f, page_to: value ? Number(value) : null }));
                        }}
                        className="w-full border border-amber-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-400 text-sm"
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-700">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isWithinRange}
                    onChange={(e) => {
                      setIsWithinRange(e.target.checked);
                      if (!e.target.checked) {
                        setForm((f) => ({ ...f, page_to: f.page_from ?? null }));
                      }
                    }}
                    className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-amber-200 rounded"
                  />
                  Multiple pages
                </label>
                <span className="rounded-full bg-white px-3 py-1 border border-amber-200">
                  {oldMurajaahPreview
                    ? `Juz ${oldMurajaahPreview.juz} - ${oldMurajaahPreview.pageWithin}/20`
                    : "Enter page"}
                </span>
              </div>

              {oldMurajaahMode === "test" && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-white/70 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-amber-700">
                      Test Mode: 6 core questions + 2 additional criteria
                    </div>
                    <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[11px] font-semibold">
                      Pass Mark: {OLD_MURAJAAH_TEST_PASS_THRESHOLD}%
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(Object.entries(OLD_MURAJAAH_TEST_QUESTION_CONFIG) as Array<
                      [OldMurajaahScoreCategory, { title: string; questionNumbers: number[] }]
                    >).map(([category, config]) => (
                      <div key={category} className="border border-amber-200 rounded-lg p-3 bg-white">
                        <h4 className="text-xs font-medium text-gray-700 mb-2">{config.title}</h4>
                        <div className="flex flex-wrap gap-2">
                          {config.questionNumbers.map((questionNum) => (
                            <div key={questionNum} className="w-14">
                              <div className="text-[10px] text-center text-gray-500 mb-1">{questionNum}</div>
                              <select
                                value={oldMurajaahSection2Scores[category][String(questionNum)] || 0}
                                onChange={(e) =>
                                  updateOldMurajaahScore(
                                    category,
                                    String(questionNum),
                                    parseInt(e.target.value, 10) || 0
                                  )
                                }
                                className="w-full border border-gray-300 rounded px-1 py-1 text-xs text-center"
                              >
                                {[0, 1, 2, 3, 4, 5].map((score) => (
                                  <option key={score} value={score}>{score}</option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    <div className="border border-amber-200 rounded-lg p-3 bg-white">
                      <h4 className="text-xs font-medium text-gray-700 mb-2">Read Verse Number</h4>
                      <div className="w-14">
                        <div className="text-[10px] text-center text-gray-500 mb-1">1</div>
                        <select
                          value={oldMurajaahReadVerseNoScore}
                          onChange={(e) => setOldMurajaahReadVerseNoScore(parseInt(e.target.value, 10) || 0)}
                          className="w-full border border-gray-300 rounded px-1 py-1 text-xs text-center"
                        >
                          {[0, 1, 2, 3, 4, 5].map((score) => (
                            <option key={score} value={score}>{score}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="border border-amber-200 rounded-lg p-3 bg-white">
                      <h4 className="text-xs font-medium text-gray-700 mb-2">Understanding</h4>
                      <div className="w-14">
                        <div className="text-[10px] text-center text-gray-500 mb-1">1</div>
                        <select
                          value={oldMurajaahUnderstandingScore}
                          onChange={(e) => setOldMurajaahUnderstandingScore(parseInt(e.target.value, 10) || 0)}
                          className="w-full border border-gray-300 rounded px-1 py-1 text-xs text-center"
                        >
                          {[0, 1, 2, 3, 4, 5].map((score) => (
                            <option key={score} value={score}>{score}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-amber-300 bg-amber-100/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-medium text-amber-900">Overall Score (100%)</div>
                        <div className="text-[11px] text-amber-800">Auto-calculated from all criteria</div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-amber-700">{oldMurajaahTestTotalPercentage}%</div>
                        <div className={`text-xs font-semibold ${oldMurajaahTestPassed ? "text-green-700" : "text-red-700"}`}>
                          {oldMurajaahTestPassed ? "PASSED" : "FAILED"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-amber-200/80 overflow-hidden">
                      <div
                        className={`h-full ${oldMurajaahTestPassed ? "bg-green-500" : "bg-amber-500"}`}
                        style={{ width: `${Math.min(100, Math.max(0, oldMurajaahTestTotalPercentage))}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {isNewMurajaah && (
            <NewMurajaahRangeSection
              latestTasmiPage={latestTasmiPage}
              rangeMode={newMurajaahRangeMode}
              lastNInput={newMurajaahLastN}
              manualFromInput={newMurajaahManualFrom}
              manualToInput={newMurajaahManualTo}
              result={newMurajaahRange}
              onRangeModeChange={handleNewMurajaahRangeModeChange}
              onLastNChange={setNewMurajaahLastN}
              onManualFromChange={setNewMurajaahManualFrom}
              onManualToChange={setNewMurajaahManualTo}
            />
          )}

          {!isOldMurajaah && (
            <>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  {isNewMurajaah && isMultiSurah ? "Surah Range *" : "Surah *"}
                </label>
                {isMultiSurah ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">From</label>
                      <select
                        value={surahFrom}
                        onChange={(e) => setSurahFrom(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
                      >
                        <option value="">Select</option>
                        {surahs.map((surah) => (
                          <option key={surah} value={surah}>{surah}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">To</label>
                      <select
                        value={surahTo}
                        onChange={(e) => setSurahTo(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
                      >
                        <option value="">Select</option>
                        {surahs.map((surah) => (
                          <option key={surah} value={surah}>{surah}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <select
                    name="surah"
                    value={form.surah}
                    onChange={(e) => setForm((f) => ({ ...f, surah: e.target.value }))}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
                  >
                    <option value="">Select a surah</option>
                    {surahs.map((surah) => (
                      <option key={surah} value={surah}>{surah}</option>
                    ))}
                  </select>
                )}
                <div className="flex items-center mt-2">
                  <input
                    type="checkbox"
                    id="editMultiSurah"
                    checked={isMultiSurah}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setIsMultiSurah(checked);
                      if (checked) {
                        setSurahFrom((prev) => prev || form.surah || "");
                        setSurahTo((prev) => prev || form.surah || "");
                      } else {
                        if (surahFrom) setForm((f) => ({ ...f, surah: surahFrom }));
                        setSurahFrom("");
                        setSurahTo("");
                      }
                    }}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="editMultiSurah" className="ml-2 text-sm text-gray-600">
                    Multiple surahs (surah range)
                  </label>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1 text-gray-700">Ayat Range *</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    name="ayat_from"
                    type="number"
                    required
                    value={form.ayat_from}
                    onChange={handleChange}
                    placeholder="From"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
                  />
                  <input
                    name="ayat_to"
                    type="number"
                    required
                    value={form.ayat_to}
                    onChange={handleChange}
                    placeholder="To"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
                  />
                </div>
              </div>
            </>
          )}

          {!isNewMurajaah && !isOldMurajaah && (
            <>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1 text-gray-700">Page *</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    name="page_from"
                    type="number"
                    value={form.page_from ?? ""}
                    onChange={handleChange}
                    placeholder="From"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
                  />
                  <input
                    name="page_to"
                    type="number"
                    value={form.page_to ?? ""}
                    onChange={handleChange}
                    placeholder="To"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Juzuk <span className="text-xs text-gray-500 font-normal">(Auto-filled)</span>
                </label>
                <input
                  name="juzuk"
                  type="number"
                  min="1"
                  value={form.juzuk ?? ""}
                  readOnly
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-blue-50/50 text-gray-700 text-sm cursor-not-allowed"
                  placeholder="Auto-filled from pages"
                />
              </div>
            </>
          )}

          {!(isOldMurajaah && oldMurajaahMode === "test") && (
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700">Grade *</label>
              <select
                name="grade"
                value={form.grade ?? ""}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
              >
                <option value="">Select a grade</option>
                {grades.map((g) => (
                  <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>
                ))}
              </select>
            </div>
          )}

          <div className={isOldMurajaah && oldMurajaahMode === "test" ? "sm:col-span-2" : ""}>
            <label className="block text-sm font-medium mb-1 text-gray-700">Date</label>
            <input
              name="date"
              type="date"
              value={form.date}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
            />
          </div>

          {error && (
            <div className="sm:col-span-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="sm:col-span-2 flex gap-3 pt-4">
            <button
              type="button"
              className="flex-1 px-4 py-2 rounded-lg text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50"
              disabled={loading}
            >
              {loading ? "Saving..." : "Save Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
