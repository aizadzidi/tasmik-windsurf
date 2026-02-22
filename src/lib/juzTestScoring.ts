import { getPageRangeFromJuz } from "@/lib/quranMapping";

export type JuzTestMode = "pmmm" | "normal_memorization";

export const DEFAULT_JUZ_TEST_MODE: JuzTestMode = "pmmm";
export const NORMAL_TIMER_DEFAULT_SECONDS = 90;

export type PmmmCategoryKey =
  | "memorization"
  | "middle_verse"
  | "last_words"
  | "reversal_reading"
  | "verse_position"
  | "read_verse_no"
  | "understanding";

export type ScoreMap = Record<string, number>;

export type PmmmSection2Scores = Record<PmmmCategoryKey, ScoreMap>;

export interface QuestionCategoryConfig {
  title: string;
  questionNumbers: number[];
}

export interface NormalQuestionMapEntry {
  question: number;
  block_from: number;
  block_to: number;
  selected_page: number | null;
  passage: "half_page";
}

export interface NormalQuestionBreakdown {
  hafazan: number;
  quality: number;
  question_total: number;
}

export interface NormalTimerEvent {
  type: "start" | "pause" | "resume" | "extend" | "finish";
  at_iso: string;
  seconds?: number;
}

export interface NormalQuestionTimerMeta {
  default_seconds: number;
  elapsed: number;
  elapsed_seconds: number;
  overtime: boolean;
  extensions: number;
  extension_seconds_total: number;
  pause_count: number;
  events: NormalTimerEvent[];
}

export interface NormalModeMeta {
  question_map: Record<string, NormalQuestionMapEntry>;
  breakdown: Record<string, NormalQuestionBreakdown>;
  timer: Record<string, NormalQuestionTimerMeta>;
}

type Section2ScoresWithMeta = Partial<PmmmSection2Scores> & {
  normal_meta?: Partial<NormalModeMeta>;
};

const PMMM_JUZ_CONFIG: Record<PmmmCategoryKey, QuestionCategoryConfig> = {
  memorization: { title: "Repeat and Continue / الإعادة والمتابعة", questionNumbers: [1, 2, 3, 4, 5] },
  middle_verse: { title: "Middle of the verse / وسط الآية", questionNumbers: [1, 2] },
  last_words: { title: "Last of the verse / آخر الآية", questionNumbers: [1, 2] },
  reversal_reading: { title: "Reversal reading / القراءة بالعكس", questionNumbers: [1, 2, 3] },
  verse_position: { title: "Position of the verse / موضع الآية", questionNumbers: [1, 2, 3] },
  read_verse_no: { title: "Read verse number / قراءة رقم الآية", questionNumbers: [1, 2, 3] },
  understanding: { title: "Understanding of the verse / فهم الآية", questionNumbers: [1, 2, 3] }
};

const PMMM_HIZB_CONFIG: Record<PmmmCategoryKey, QuestionCategoryConfig> = {
  memorization: { title: "Repeat and Continue / الإعادة والمتابعة", questionNumbers: [1, 2, 3] },
  middle_verse: { title: "Middle of the verse / وسط الآية", questionNumbers: [1] },
  last_words: { title: "Last of the verse / آخر الآية", questionNumbers: [1] },
  reversal_reading: { title: "Reversal reading / القراءة بالعكس", questionNumbers: [1, 2] },
  verse_position: { title: "Position of the verse / موضع الآية", questionNumbers: [1, 2] },
  read_verse_no: { title: "Read verse number / قراءة رقم الآية", questionNumbers: [1] },
  understanding: { title: "Understanding of the verse / فهم الآية", questionNumbers: [1] }
};

const PMMM_PASS_THRESHOLD = 50;
const NORMAL_PASS_THRESHOLD = 60;

const clamp = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const questionRange = (count: number): number[] =>
  Array.from({ length: count }, (_, index) => index + 1);

export function normalizeJuzTestMode(value: unknown): JuzTestMode {
  return value === "normal_memorization" ? "normal_memorization" : "pmmm";
}

export function getJuzTestModeLabel(mode: unknown): "PMMM" | "Without PMMM" {
  return normalizeJuzTestMode(mode) === "normal_memorization" ? "Without PMMM" : "PMMM";
}

export function getPassThresholdByMode(mode: JuzTestMode): number {
  return mode === "normal_memorization" ? NORMAL_PASS_THRESHOLD : PMMM_PASS_THRESHOLD;
}

export function getNormalQuestionCount(isHizbTest: boolean): number {
  return isHizbTest ? 2 : 4;
}

export function getPmmmQuestionConfig(isHizbTest: boolean): Record<PmmmCategoryKey, QuestionCategoryConfig> {
  return isHizbTest ? PMMM_HIZB_CONFIG : PMMM_JUZ_CONFIG;
}

export function getJuzTestPageRange(
  juzNumber: number,
  isHizbTest: boolean,
  hizbNumber: number
): { from: number; to: number } {
  const range = getPageRangeFromJuz(juzNumber);
  if (!range) return { from: 0, to: 0 };

  if (!isHizbTest) return { from: range.startPage, to: range.endPage };

  const totalPages = range.endPage - range.startPage + 1;
  const firstHalfSize = Math.ceil(totalPages / 2);
  const firstHalfEnd = range.startPage + firstHalfSize - 1;

  if (hizbNumber === 2) {
    return { from: firstHalfEnd + 1, to: range.endPage };
  }
  return { from: range.startPage, to: firstHalfEnd };
}

export function createNormalQuestionMap(params: {
  pageFrom: number;
  pageTo: number;
  isHizbTest: boolean;
  existingQuestionMap?: Partial<Record<string, NormalQuestionMapEntry>>;
}): Record<string, NormalQuestionMapEntry> {
  const { pageFrom, pageTo, isHizbTest, existingQuestionMap } = params;
  const from = Math.min(pageFrom, pageTo);
  const to = Math.max(pageFrom, pageTo);
  const questionCount = getNormalQuestionCount(isHizbTest);
  const totalPages = to - from + 1;
  const blockSize = Math.min(5, Math.max(1, Math.ceil(totalPages / questionCount)));
  const maxOffset = Math.max(0, totalPages - blockSize);
  const step = questionCount > 1 ? maxOffset / (questionCount - 1) : 0;

  const map: Record<string, NormalQuestionMapEntry> = {};

  questionRange(questionCount).forEach((question, index) => {
    const key = String(question);
    const blockFrom = from + Math.round(index * step);
    const blockTo = Math.min(to, blockFrom + blockSize - 1);
    const selected = existingQuestionMap?.[key]?.selected_page;

    map[key] = {
      question,
      block_from: blockFrom,
      block_to: blockTo,
      selected_page:
        typeof selected === "number" && selected >= blockFrom && selected <= blockTo
          ? selected
          : null,
      passage: "half_page"
    };
  });

  return map;
}

export function normalizeNormalBreakdown(
  isHizbTest: boolean,
  breakdown?: Partial<Record<string, Partial<NormalQuestionBreakdown>>>
): Record<string, NormalQuestionBreakdown> {
  const normalized: Record<string, NormalQuestionBreakdown> = {};
  questionRange(getNormalQuestionCount(isHizbTest)).forEach((question) => {
    const key = String(question);
    const hafazan = clamp(Number(breakdown?.[key]?.hafazan ?? 0), 0, 4);
    const quality = clamp(Number(breakdown?.[key]?.quality ?? 0), 0, 1);
    normalized[key] = {
      hafazan,
      quality,
      question_total: Number((hafazan + quality).toFixed(2))
    };
  });
  return normalized;
}

export function normalizeNormalTimerMeta(
  isHizbTest: boolean,
  timerMap?: Partial<Record<string, Partial<NormalQuestionTimerMeta>>>,
  defaultSeconds = NORMAL_TIMER_DEFAULT_SECONDS
): Record<string, NormalQuestionTimerMeta> {
  const timer: Record<string, NormalQuestionTimerMeta> = {};
  questionRange(getNormalQuestionCount(isHizbTest)).forEach((question) => {
    const key = String(question);
    const current = timerMap?.[key];
    const elapsed = Math.max(
      0,
      Math.round(Number(current?.elapsed_seconds ?? current?.elapsed ?? 0))
    );

    timer[key] = {
      default_seconds: Math.max(1, Math.round(Number(current?.default_seconds ?? defaultSeconds))),
      elapsed,
      elapsed_seconds: elapsed,
      overtime: Boolean(current?.overtime),
      extensions: Math.max(0, Math.round(Number(current?.extensions ?? 0))),
      extension_seconds_total: Math.max(
        0,
        Math.round(Number(current?.extension_seconds_total ?? 0))
      ),
      pause_count: Math.max(0, Math.round(Number(current?.pause_count ?? 0))),
      events: Array.isArray(current?.events) ? (current?.events as NormalTimerEvent[]) : []
    };
  });
  return timer;
}

export function buildNormalModeMeta(params: {
  pageFrom: number;
  pageTo: number;
  isHizbTest: boolean;
  existingMeta?: Partial<NormalModeMeta>;
  defaultSeconds?: number;
}): NormalModeMeta {
  const { pageFrom, pageTo, isHizbTest, existingMeta, defaultSeconds } = params;
  return {
    question_map: createNormalQuestionMap({
      pageFrom,
      pageTo,
      isHizbTest,
      existingQuestionMap: existingMeta?.question_map
    }),
    breakdown: normalizeNormalBreakdown(isHizbTest, existingMeta?.breakdown),
    timer: normalizeNormalTimerMeta(isHizbTest, existingMeta?.timer, defaultSeconds)
  };
}

export function buildPmmmSection2Scores(
  isHizbTest: boolean,
  existing?: Partial<PmmmSection2Scores>
): PmmmSection2Scores {
  const config = getPmmmQuestionConfig(isHizbTest);
  const next = {} as PmmmSection2Scores;
  (Object.keys(config) as PmmmCategoryKey[]).forEach((category) => {
    const map: ScoreMap = {};
    config[category].questionNumbers.forEach((questionNumber) => {
      map[String(questionNumber)] = clamp(
        Number(existing?.[category]?.[String(questionNumber)] ?? 0),
        0,
        5
      );
    });
    next[category] = map;
  });
  return next;
}

export function calculateNormalModeScore(
  isHizbTest: boolean,
  breakdown?: Partial<Record<string, Partial<NormalQuestionBreakdown>>>
): {
  breakdown: Record<string, NormalQuestionBreakdown>;
  memorization: ScoreMap;
  totalPercentage: number;
  passed: boolean;
} {
  const normalizedBreakdown = normalizeNormalBreakdown(isHizbTest, breakdown);
  const memorization: ScoreMap = {};
  let total = 0;

  Object.entries(normalizedBreakdown).forEach(([key, value]) => {
    memorization[key] = value.question_total;
    total += value.question_total;
  });

  const max = getNormalQuestionCount(isHizbTest) * 5;
  const percentage = Math.round((total / max) * 100);
  return {
    breakdown: normalizedBreakdown,
    memorization,
    totalPercentage: percentage,
    passed: percentage >= NORMAL_PASS_THRESHOLD
  };
}

export function calculatePmmmModeScore(params: {
  isHizbTest: boolean;
  section2Scores: PmmmSection2Scores;
  tajweedScore: number;
  recitationScore: number;
}): { totalPercentage: number; passed: boolean } {
  const { isHizbTest, section2Scores } = params;
  const weights = isHizbTest
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

  let weighted = 0;
  (Object.keys(section2Scores) as PmmmCategoryKey[]).forEach((category) => {
    const categoryScores = section2Scores[category];
    const total = Object.values(categoryScores).reduce((acc, value) => acc + value, 0);
    const max = Object.keys(categoryScores).length * 5;
    weighted += max > 0 ? (total / max) * weights[category] : 0;
  });

  weighted += (clamp(params.tajweedScore, 0, 5) / 5) * weights.tajweed;
  weighted += (clamp(params.recitationScore, 0, 5) / 5) * weights.recitation;

  const percentage = Math.round(weighted);
  return {
    totalPercentage: percentage,
    passed: percentage >= PMMM_PASS_THRESHOLD
  };
}

export function calculateJuzTestScore(params: {
  mode: unknown;
  isHizbTest: boolean;
  pageFrom: number;
  pageTo: number;
  section2Scores?: Section2ScoresWithMeta;
  tajweedScore?: number;
  recitationScore?: number;
}): { totalPercentage: number; passed: boolean } {
  const mode = normalizeJuzTestMode(params.mode);
  if (mode === "normal_memorization") {
    const meta = buildNormalModeMeta({
      pageFrom: params.pageFrom,
      pageTo: params.pageTo,
      isHizbTest: params.isHizbTest,
      existingMeta: params.section2Scores?.normal_meta
    });
    const result = calculateNormalModeScore(params.isHizbTest, meta.breakdown);
    return { totalPercentage: result.totalPercentage, passed: result.passed };
  }

  const pmmmScores = buildPmmmSection2Scores(params.isHizbTest, params.section2Scores);
  return calculatePmmmModeScore({
    isHizbTest: params.isHizbTest,
    section2Scores: pmmmScores,
    tajweedScore: params.tajweedScore ?? 0,
    recitationScore: params.recitationScore ?? 0
  });
}

export function getQuranPageUrl(page: number): string {
  return `https://quran.com/page/${page}`;
}

export function getBlockPages(block: NormalQuestionMapEntry): number[] {
  return Array.from(
    { length: Math.max(0, block.block_to - block.block_from + 1) },
    (_, index) => block.block_from + index
  );
}
