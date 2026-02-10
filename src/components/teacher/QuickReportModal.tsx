"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getJuzFromPageRange, getPageWithinJuz } from "@/lib/quranMapping";

interface QuickReportModalProps {
  student: {
    id: string;
    name: string;
    tenant_id?: string | null;
  };
  reportType: "Tasmi" | "Murajaah" | "Old Murajaah" | "New Murajaah";
  onClose: () => void;
  onSuccess: () => void;
  userId: string;
  tasmiReports?: Array<{
    student_id: string;
    type: string;
    surah: string;
    ayat_from: number;
    ayat_to: number;
    page_from: number | null;
    page_to: number | null;
    date: string;
  }>;
  suggestions?: {
    surah: string;
    juzuk: number;
    ayatFrom: number;
    ayatTo: number | null;
    pageFrom?: number | null;
    pageTo?: number | null;
  };
}

const GRADES = ["mumtaz", "jayyid jiddan", "jayyid"];
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
  memorization: {
    title: "Repeat and Continue",
    questionNumbers: [1, 2]
  },
  middle_verse: {
    title: "Middle of the Verse",
    questionNumbers: [1]
  },
  last_words: {
    title: "Last of the Verse",
    questionNumbers: [1]
  },
  reversal_reading: {
    title: "Reversal Reading",
    questionNumbers: [1]
  },
  verse_position: {
    title: "Position of the Verse",
    questionNumbers: [1]
  }
};

const buildOldMurajaahTestInitialScores = (): OldMurajaahSection2Scores => ({
  memorization: { "1": 0, "2": 0 },
  middle_verse: { "1": 0 },
  last_words: { "1": 0 },
  reversal_reading: { "1": 0 },
  verse_position: { "1": 0 }
});

const SURAHS = [
  "Al-Fatihah", "Al-Baqarah", "Aali Imran", "An-Nisa'", "Al-Ma'idah", "Al-An'am", "Al-A'raf", "Al-Anfal", "At-Tawbah", "Yunus", "Hud", "Yusuf", "Ar-Ra'd", "Ibrahim", "Al-Hijr", "An-Nahl", "Al-Isra'", "Al-Kahf", "Maryam", "Ta-Ha", "Al-Anbiya'", "Al-Hajj", "Al-Mu'minun", "An-Nur", "Al-Furqan", "Ash-Shu'ara'", "An-Naml", "Al-Qasas", "Al-Ankabut", "Ar-Rum", "Luqman", "As-Sajda", "Al-Ahzab", "Saba'", "Fatir", "Ya-Sin", "As-Saffat", "Sad", "Az-Zumar", "Ghafir", "Fussilat", "Ash-Shura", "Az-Zukhruf", "Ad-Dukhan", "Al-Jathiyah", "Al-Ahqaf", "Muhammad", "Al-Fath", "Al-Hujurat", "Qaf", "Adh-Dhariyat", "At-Tur", "An-Najm", "Al-Qamar", "Ar-Rahman", "Al-Waqi'ah", "Al-Hadid", "Al-Mujadila", "Al-Hashr", "Al-Mumtahanah", "As-Saff", "Al-Jumu'ah", "Al-Munafiqun", "At-Taghabun", "At-Talaq", "At-Tahrim", "Al-Mulk", "Al-Qalam", "Al-Haqqah", "Al-Ma'arij", "Nuh", "Al-Jinn", "Al-Muzzammil", "Al-Muddathir", "Al-Qiyamah", "Al-Insan", "Al-Mursalat", "An-Naba'", "An-Nazi'at", "Abasa", "At-Takwir", "Al-Infitar", "Al-Mutaffifin", "Al-Inshiqaq", "Al-Buruj", "At-Tariq", "Al-A'la", "Al-Ghashiyah", "Al-Fajr", "Al-Balad", "Ash-Shams", "Al-Layl", "Ad-Duhaa", "Ash-Sharh", "At-Tin", "Al-Alaq", "Al-Qadr", "Al-Bayyinah", "Az-Zalzalah", "Al-Adiyat", "Al-Qari'ah", "At-Takathur", "Al-Asr", "Al-Humazah", "Al-Fil", "Quraysh", "Al-Ma'un", "Al-Kawthar", "Al-Kafirun", "An-Nasr", "Al-Masad", "Al-Ikhlas", "Al-Falaq", "An-Nas"
];

// Get current week boundaries and display
function getCurrentWeekInfo() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Find Monday of this week
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  
  // Find Friday of this week
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  
  // Format for display: "Dec 9-13, 2024"
  const monthName = monday.toLocaleDateString('en-US', { month: 'short' });
  const startDay = monday.getDate();
  const endDay = friday.getDate();
  const year = monday.getFullYear();
  
  const weekRange = `${monthName} ${startDay}-${endDay}, ${year}`;
  const fridayDate = friday.toISOString().slice(0, 10);
  
  return { weekRange, fridayDate };
}

export default function QuickReportModal({ 
  student, 
  reportType, 
  onClose, 
  onSuccess, 
  userId,
  tasmiReports,
  suggestions 
}: QuickReportModalProps) {
  const currentWeek = getCurrentWeekInfo();
  const normalizedReportType = reportType === "Murajaah" ? "Old Murajaah" : reportType;
  const isNewMurajaah = normalizedReportType === "New Murajaah";
  const isOldMurajaah = normalizedReportType === "Old Murajaah";
  const modalTitle = isOldMurajaah ? "Old Murajaah" : `Add ${normalizedReportType} Report`;

  const [form, setForm] = useState({
    surah: suggestions?.surah || "",
    juzuk: suggestions?.juzuk?.toString() || "",
    ayat_from: suggestions?.ayatFrom?.toString() || "",
    ayat_to: suggestions?.ayatTo?.toString() || "",
    page_from: suggestions?.pageFrom?.toString() || "",
    page_to: suggestions?.pageTo?.toString() || "",
    grade: "",
    date: new Date().toISOString().slice(0, 10) // Default to today's date
  });
  const [weekRange] = useState(currentWeek.weekRange);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isPageRange, setIsPageRange] = useState(false);
  const [isMultiSurah, setIsMultiSurah] = useState(false);
  const [surahFrom, setSurahFrom] = useState<string>("");
  const [surahTo, setSurahTo] = useState<string>("");
  const [surahTouched, setSurahTouched] = useState(false);
  const [ayatTouched, setAyatTouched] = useState(false);
  const [isWithinRange, setIsWithinRange] = useState(() => (
    Boolean(suggestions?.pageFrom && suggestions?.pageTo && suggestions.pageFrom !== suggestions.pageTo)
  ));
  const recentAnchor = suggestions?.pageTo ?? suggestions?.pageFrom ?? null;
  const [reviewAnchorPage, setReviewAnchorPage] = useState(recentAnchor ? String(recentAnchor) : "");
  const [reviewCount, setReviewCount] = useState("3");
  const [oldMurajaahMode, setOldMurajaahMode] = useState<OldMurajaahMode>("recitation");
  const [oldMurajaahSection2Scores, setOldMurajaahSection2Scores] =
    useState<OldMurajaahSection2Scores>(buildOldMurajaahTestInitialScores());
  const [oldMurajaahReadVerseNoScore, setOldMurajaahReadVerseNoScore] = useState(0);
  const [oldMurajaahUnderstandingScore, setOldMurajaahUnderstandingScore] = useState(0);

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
    const maxTotalScore = maxSection2Score + 10; // read_verse_no + understanding
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
    const fromValue = parseInt(form.page_from, 10);
    const toValue = parseInt(form.page_to, 10);
    if (!fromValue) return null;
    const endValue = isWithinRange ? (form.page_to ? toValue : null) : fromValue;
    if (!endValue) return null;
    if (
      fromValue < 1 || fromValue > 604 ||
      endValue < 1 || endValue > 604
    ) {
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

  const reviewRangePreview = useMemo(() => {
    const anchorValue = parseInt(reviewAnchorPage, 10);
    const countValue = parseInt(reviewCount, 10);
    if (!anchorValue || !countValue) return null;
    const from = Math.max(1, anchorValue - countValue + 1);
    return { from, to: anchorValue, count: countValue };
  }, [reviewAnchorPage, reviewCount]);

  useEffect(() => {
    if (!isNewMurajaah || !reviewRangePreview || !tasmiReports?.length) return;
    if (surahTouched || ayatTouched) return;

    const overlapping = tasmiReports
      .filter((r) => {
        if (r.student_id !== student.id) return false;
        if (r.type !== "Tasmi") return false;
        if (r.page_from === null || r.page_to === null) return false;
        const reportFrom = Math.min(r.page_from, r.page_to);
        const reportTo = Math.max(r.page_from, r.page_to);
        return reportFrom <= reviewRangePreview.to && reportTo >= reviewRangePreview.from;
      });

    if (overlapping.length === 0) return;

    const first = overlapping.find((r) => {
      const rFrom = Math.min(r.page_from!, r.page_to!);
      const rTo = Math.max(r.page_from!, r.page_to!);
      return rFrom <= reviewRangePreview.from && rTo >= reviewRangePreview.from;
    }) ?? null;

    const last = overlapping.find((r) => {
      const rFrom = Math.min(r.page_from!, r.page_to!);
      const rTo = Math.max(r.page_from!, r.page_to!);
      return rFrom <= reviewRangePreview.to && rTo >= reviewRangePreview.to;
    }) ?? null;

    if (!first || !last) return;

    if (first.surah === last.surah) {
      setIsMultiSurah(false);
      setSurahFrom("");
      setSurahTo("");
      setForm((f) => ({
        ...f,
        surah: first.surah,
        ayat_from: String(first.ayat_from),
        ayat_to: String(last.ayat_to)
      }));
    } else {
      setIsMultiSurah(true);
      setSurahFrom(first.surah);
      setSurahTo(last.surah);
      setForm((f) => ({
        ...f,
        surah: `${first.surah} - ${last.surah}`,
        ayat_from: String(first.ayat_from),
        ayat_to: String(last.ayat_to)
      }));
    }
  }, [isNewMurajaah, reviewRangePreview, tasmiReports, student.id, surahTouched, ayatTouched]);

  // Auto-fill Juz based on page input
  useEffect(() => {
    if (isNewMurajaah || isOldMurajaah) return;
    const pageFrom = parseInt(form.page_from);
    const pageTo = form.page_to ? parseInt(form.page_to) : undefined;
    
    if (pageFrom && pageFrom >= 1 && pageFrom <= 604) {
      const juz = getJuzFromPageRange(pageFrom, pageTo);
      if (juz && juz.toString() !== form.juzuk) {
        setForm(f => ({ ...f, juzuk: juz.toString() }));
      }
    }
  }, [form.page_from, form.page_to, form.juzuk, isNewMurajaah, isOldMurajaah]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // For single page, ensure page_to equals page_from
    if (!isNewMurajaah && !isOldMurajaah && !isPageRange && form.page_from && !form.page_to) {
      setForm(f => ({ ...f, page_to: f.page_from }));
    }
    
    const requiredPageValidation = isNewMurajaah
      ? (!reviewAnchorPage || !reviewCount)
      : isOldMurajaah
        ? (!form.page_from || (isWithinRange && !form.page_to))
      : isPageRange 
        ? (!form.page_from || !form.page_to)
        : !form.page_from;
    
    const requiresSurahAndAyat = !isOldMurajaah;
    const hasSurah = requiresSurahAndAyat
      ? (isMultiSurah ? Boolean(surahFrom) && Boolean(surahTo) : Boolean(form.surah))
      : true;
    const hasAyatRange = requiresSurahAndAyat
      ? Boolean(form.ayat_from) && Boolean(form.ayat_to)
      : true;
    const requiresGrade = !(isOldMurajaah && oldMurajaahMode === "test");

    if (!hasSurah || !hasAyatRange || requiredPageValidation || (requiresGrade && !form.grade)) {
      setError("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      // Store the actual submission date (not the week end date)
      const submissionDate = form.date;
      
      const newAyatFrom = isOldMurajaah ? 1 : parseInt(form.ayat_from, 10);
      const newAyatTo = isOldMurajaah ? 1 : parseInt(form.ayat_to, 10);
      if (
        !isOldMurajaah &&
        (!Number.isFinite(newAyatFrom) || !Number.isFinite(newAyatTo))
      ) {
        setError("Please fill in all required fields");
        setIsSubmitting(false);
        return;
      }
      let resolvedPageFrom: number | null = null;
      let resolvedPageTo: number | null = null;
      let resolvedJuz: number | null = null;

      if (isOldMurajaah) {
        const fromValue = parseInt(form.page_from, 10);
        const toValue = parseInt(form.page_to, 10);
        const endValue = isWithinRange ? (form.page_to ? toValue : null) : fromValue;

        if (!fromValue || !endValue) {
          setError("Please fill in all required fields");
          setIsSubmitting(false);
          return;
        }
        if (
          fromValue < 1 || fromValue > 604 ||
          endValue < 1 || endValue > 604
        ) {
          setError("Page must be between 1 and 604");
          setIsSubmitting(false);
          return;
        }
        resolvedPageFrom = Math.min(fromValue, endValue);
        resolvedPageTo = Math.max(fromValue, endValue);
        resolvedJuz = getJuzFromPageRange(resolvedPageFrom, resolvedPageTo);
      } else if (isNewMurajaah) {
        const anchorValue = parseInt(reviewAnchorPage, 10);
        const countValue = parseInt(reviewCount, 10);
        if (!anchorValue || !countValue) {
          setError("Please fill in all required fields");
          setIsSubmitting(false);
          return;
        }
        const fromValue = Math.max(1, anchorValue - countValue + 1);
        resolvedPageFrom = fromValue;
        resolvedPageTo = anchorValue;
        resolvedJuz = getJuzFromPageRange(anchorValue, anchorValue);
      } else {
        const newPageFromValue = form.page_from ? parseInt(form.page_from) : null;
        const newPageToValue = form.page_to ? parseInt(form.page_to) : null;
        const finalPageTo = isPageRange ? newPageToValue : newPageFromValue;
        resolvedPageFrom = newPageFromValue;
        resolvedPageTo = finalPageTo;
        resolvedJuz = form.juzuk ? parseInt(form.juzuk) : null;
      }

      // Create new report with actual submission date
      const readingProgress = isOldMurajaah
        ? oldMurajaahMode === "test"
          ? {
              murajaah_mode: "test",
              test_assessment: {
                section2_scores: oldMurajaahSection2Scores,
                read_verse_no_score: oldMurajaahReadVerseNoScore,
                understanding_score: oldMurajaahUnderstandingScore,
                total_percentage: oldMurajaahTestTotalPercentage,
                passed: oldMurajaahTestPassed,
                pass_threshold: OLD_MURAJAAH_TEST_PASS_THRESHOLD
              }
            }
          : { murajaah_mode: "recitation" }
        : null;

      const baseRow = {
        teacher_id: userId,
        student_id: student.id,
        type: normalizedReportType,
        juzuk: resolvedJuz,
        ayat_from: newAyatFrom,
        ayat_to: newAyatTo,
        page_from: resolvedPageFrom,
        page_to: resolvedPageTo,
        grade: isOldMurajaah && oldMurajaahMode === "test" ? null : form.grade,
        reading_progress: readingProgress,
        date: submissionDate
      } as const;

      // Determine surah label to insert (grouped for multi-surah)
      let surahLabel: string;
      if (isOldMurajaah) {
        surahLabel = OLD_MURAJAAH_SURAH_LABEL;
      } else if (isMultiSurah) {
        const startIdx = SURAHS.indexOf(surahFrom);
        const endIdx = SURAHS.indexOf(surahTo);
        if (startIdx === -1 || endIdx === -1) {
          setError("Invalid surah range selected");
          setIsSubmitting(false);
          return;
        }
        const from = Math.min(startIdx, endIdx);
        const to = Math.max(startIdx, endIdx);
        surahLabel = `${SURAHS[from]} - ${SURAHS[to]}`;
      } else {
        surahLabel = form.surah;
      }

      const row = {
        ...baseRow,
        surah: surahLabel,
        ...(student.tenant_id ? { tenant_id: student.tenant_id } : {})
      };

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setError("Session expired. Please sign in again.");
        return;
      }

      const res = await fetch("/api/teacher/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(row)
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError(payload?.error || "Failed to create report");
      } else {
        onSuccess();
        onClose();
      }
    } catch {
      setError("Failed to create report");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white/95 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">
            {modalTitle}
          </h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Student Info */}
          <div className="sm:col-span-2 p-3 bg-blue-50 rounded-lg">
            <div className="text-sm font-medium text-gray-700">Student: {student.name}</div>
            <div className="text-sm text-gray-600">
              Type: {isOldMurajaah ? "Old Murajaah" : normalizedReportType}
            </div>
            <div className="text-xs text-gray-500 mt-1">Week: {weekRange}</div>
          </div>

          {isNewMurajaah && (
            <div className="sm:col-span-2 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold text-emerald-700">New Murajaah (Recent pages)</div>
                  <div className="text-xs text-emerald-600">Review latest pages from current Juz</div>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">New</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-emerald-700 mb-1">
                    {recentAnchor ? "Latest Tasmi Page" : "Anchor Page"}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="604"
                    placeholder="Page"
                    value={reviewAnchorPage}
                    onChange={(e) => setReviewAnchorPage(e.target.value)}
                    className="w-full border border-emerald-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-emerald-700 mb-1">Review Size *</label>
                  <select
                    value={reviewCount}
                    onChange={(e) => setReviewCount(e.target.value)}
                    className="w-full border border-emerald-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-400 text-sm bg-white"
                  >
                    {Array.from({ length: 20 }, (_, index) => index + 1).map((count) => (
                      <option key={count} value={count}>
                        Last {count} pages
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-700">
                <span className="rounded-full bg-white px-3 py-1 border border-emerald-200">
                  {reviewRangePreview
                    ? `Pages ${reviewRangePreview.from}-${reviewRangePreview.to}`
                    : "Select recent pages"}
                </span>
                <span className="text-emerald-600">
                  {reviewRangePreview
                    ? `Juz ${getJuzFromPageRange(reviewRangePreview.to, reviewRangePreview.to) ?? "-"}`
                    : "Juz auto"}
                </span>
              </div>
            </div>
          )}

          {!isOldMurajaah && (
            <>
              {/* Surah */}
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
                        onChange={(e) => {
                          setSurahTouched(true);
                          setSurahFrom(e.target.value);
                        }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
                      >
                        <option value="">Select</option>
                        {SURAHS.map((surah) => (
                          <option key={surah} value={surah}>{surah}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">To</label>
                      <select
                        value={surahTo}
                        onChange={(e) => {
                          setSurahTouched(true);
                          setSurahTo(e.target.value);
                        }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
                      >
                        <option value="">Select</option>
                        {SURAHS.map((surah) => (
                          <option key={surah} value={surah}>{surah}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <select
                    value={form.surah}
                    onChange={(e) => {
                      setSurahTouched(true);
                      setForm((f) => ({ ...f, surah: e.target.value }));
                    }}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
                  >
                    <option value="">Select a surah</option>
                    {SURAHS.map((surah) => (
                      <option key={surah} value={surah}>{surah}</option>
                    ))}
                  </select>
                )}
                <div className="flex items-center mt-2">
                  <input
                    type="checkbox"
                    id="multiSurah"
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
                  <label htmlFor="multiSurah" className="ml-2 text-sm text-gray-600">
                    Multiple surahs (surah range)
                  </label>
                </div>
              </div>

              {/* Ayat Range */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1 text-gray-700">Ayat Range *</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="From"
                    value={form.ayat_from}
                    onChange={e => {
                      setAyatTouched(true);
                      setForm(f => ({ ...f, ayat_from: e.target.value }));
                    }}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
                  />
                  <input
                    type="number"
                    placeholder="To"
                    value={form.ayat_to}
                    onChange={e => {
                      setAyatTouched(true);
                      setForm(f => ({ ...f, ayat_to: e.target.value }));
                    }}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
                  />
                </div>
              </div>
            </>
          )}

          {!isNewMurajaah && !isOldMurajaah && (
            <>
              {/* Page */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1 text-gray-700">Page *</label>
                
                {!isPageRange ? (
                  /* Single Page Input */
                  <input
                    type="number"
                    placeholder="Page number"
                    value={form.page_from}
                    onChange={e => {
                      const value = e.target.value;
                      setForm(f => ({ 
                        ...f, 
                        page_from: value,
                        page_to: value // Keep both in sync for single page
                      }));
                    }}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
                  />
                ) : (
                  /* Page Range Inputs */
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="From"
                      value={form.page_from}
                      onChange={e => setForm(f => ({ ...f, page_from: e.target.value }))}
                      required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
                    />
                    <input
                      type="number"
                      placeholder="To"
                      value={form.page_to}
                      onChange={e => setForm(f => ({ ...f, page_to: e.target.value }))}
                      required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
                    />
                  </div>
                )}
                
                {/* Page Range Toggle */}
                <div className="flex items-center mt-2">
                  <input
                    type="checkbox"
                    id="pageRange"
                    checked={isPageRange}
                    onChange={e => {
                      setIsPageRange(e.target.checked);
                      // Clear page_to when switching to single page
                      if (!e.target.checked) {
                        setForm(f => ({ ...f, page_to: f.page_from }));
                      }
                    }}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="pageRange" className="ml-2 text-sm text-gray-600">
                    Multiple pages (page range)
                  </label>
                </div>
              </div>

              {/* Juzuk - Auto-calculated section */}
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Juzuk <span className="text-xs text-gray-500 font-normal">(Auto-filled)</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={form.juzuk || ""}
                    readOnly
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-blue-50/50 text-gray-700 text-sm cursor-not-allowed focus:ring-0 focus:border-gray-300"
                    placeholder="Auto-filled from pages"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                </div>
              </div>
            </>
          )}

          {!(isOldMurajaah && oldMurajaahMode === "test") && (
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700">Grade *</label>
              <select
                value={form.grade}
                onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
              >
                <option value="">Select a grade</option>
                {GRADES.map(g => (
                  <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>
                ))}
              </select>
            </div>
          )}

          {/* Date */}
          <div className={isOldMurajaah && oldMurajaahMode === "test" ? "sm:col-span-2" : ""}>
            <label className="block text-sm font-medium mb-1 text-gray-700">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
            />
          </div>

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
                  onClick={() => setOldMurajaahMode("test")}
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
                      value={form.page_from}
                      onChange={(e) => {
                        const value = e.target.value;
                        setForm((f) => ({
                          ...f,
                          page_from: value,
                          page_to: value
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
                        value={form.page_from}
                        onChange={(e) => setForm((f) => ({ ...f, page_from: e.target.value }))}
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
                        value={form.page_to}
                        onChange={(e) => setForm((f) => ({ ...f, page_to: e.target.value }))}
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
                        setForm((f) => ({ ...f, page_to: f.page_from }));
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

          {error && (
            <div className="sm:col-span-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Buttons */}
          <div className="sm:col-span-2 flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg text-gray-700 bg-gray-200 hover:bg-gray-300 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
