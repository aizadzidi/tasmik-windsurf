import { getJuzFromPageRange } from "@/lib/quranMapping";

export const QURAN_PAGE_MIN = 1;
export const QURAN_PAGE_MAX = 604;
export const DEFAULT_NEW_MURAJAAH_LAST_N = 3;
export const MAX_NEW_MURAJAAH_LAST_N = 20;
export const MAX_NEW_MURAJAAH_SPAN = 20;

export type NewMurajaahSourceMode = "latest_tasmi" | "specific_page";
export type NewMurajaahRangeMode = "last_n" | "manual_range";

export interface NewMurajaahRangeInput {
  sourceMode: NewMurajaahSourceMode;
  rangeMode: NewMurajaahRangeMode;
  latestTasmiPage: number | null;
  specificPage: number | null;
  lastN: number | null;
  manualFrom: number | null;
  manualTo: number | null;
  maxLastN?: number;
  maxSpan?: number;
}

export interface NewMurajaahRangeResult {
  isValid: boolean;
  error: string | null;
  pageFrom: number | null;
  pageTo: number | null;
  juz: number | null;
  count: number | null;
  anchorPage: number | null;
  sourceMode: NewMurajaahSourceMode;
  rangeMode: NewMurajaahRangeMode;
}

const invalid = (
  input: Pick<NewMurajaahRangeInput, "sourceMode" | "rangeMode">,
  error: string
): NewMurajaahRangeResult => ({
  isValid: false,
  error,
  pageFrom: null,
  pageTo: null,
  juz: null,
  count: null,
  anchorPage: null,
  sourceMode: input.sourceMode,
  rangeMode: input.rangeMode
});

const isWholeNumber = (value: number | null): value is number =>
  typeof value === "number" && Number.isInteger(value);

const isPageNumber = (value: number | null): value is number =>
  isWholeNumber(value) && value >= QURAN_PAGE_MIN && value <= QURAN_PAGE_MAX;

export function parseNullableInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function computeNewMurajaahRange(input: NewMurajaahRangeInput): NewMurajaahRangeResult {
  const maxLastN = input.maxLastN ?? MAX_NEW_MURAJAAH_LAST_N;
  const maxSpan = input.maxSpan ?? MAX_NEW_MURAJAAH_SPAN;

  if (input.rangeMode === "last_n") {
    const anchorPage = input.sourceMode === "latest_tasmi" ? input.latestTasmiPage : input.specificPage;
    if (!isPageNumber(anchorPage)) {
      return invalid(
        input,
        input.sourceMode === "latest_tasmi"
          ? "Latest Tasmi page is not available yet."
          : "Please enter a valid start page (1-604)."
      );
    }

    const lastN = input.lastN;
    if (!isWholeNumber(lastN) || lastN < 1 || lastN > maxLastN) {
      return invalid(input, `Review size must be between 1 and ${maxLastN} pages.`);
    }

    const pageTo = anchorPage;
    const pageFrom = Math.max(QURAN_PAGE_MIN, anchorPage - lastN + 1);
    const count = pageTo - pageFrom + 1;
    const juz = getJuzFromPageRange(pageFrom, pageTo);

    return {
      isValid: true,
      error: null,
      pageFrom,
      pageTo,
      juz,
      count,
      anchorPage,
      sourceMode: input.sourceMode,
      rangeMode: input.rangeMode
    };
  }

  const manualFrom = input.manualFrom;
  const manualTo = input.manualTo;
  if (!isPageNumber(manualFrom) || !isPageNumber(manualTo)) {
    return invalid(input, "Please enter a valid page range (1-604).");
  }
  if (manualFrom > manualTo) {
    return invalid(input, "Page From must be less than or equal to Page To.");
  }

  const count = manualTo - manualFrom + 1;
  if (count > maxSpan) {
    return invalid(input, `Page range cannot exceed ${maxSpan} pages.`);
  }

  const juz = getJuzFromPageRange(manualFrom, manualTo);
  return {
    isValid: true,
    error: null,
    pageFrom: manualFrom,
    pageTo: manualTo,
    juz,
    count,
    anchorPage: null,
    sourceMode: input.sourceMode,
    rangeMode: input.rangeMode
  };
}
