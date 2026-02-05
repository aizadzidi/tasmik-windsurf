import { getPageRangeFromJuz } from "@/lib/quranMapping";

export type JuzTestDisplayData = {
  juz_number: number;
  test_hizb?: boolean | null;
  hizb_number?: number | null;
  page_from?: number | null;
  page_to?: number | null;
};

const normalizePage = (value: number | null | undefined) =>
  typeof value === "number" && value > 0 ? value : null;

export function resolveHizbNumber(test: JuzTestDisplayData): number | null {
  if (!test.test_hizb) return null;

  if (typeof test.hizb_number === "number" && test.hizb_number >= 1) {
    return test.hizb_number;
  }

  const from = normalizePage(test.page_from);
  const to = normalizePage(test.page_to);
  const ref = from ?? to;
  if (ref === null) return 1;

  const range = getPageRangeFromJuz(test.juz_number);
  if (!range) return 1;

  const totalPages = range.endPage - range.startPage + 1;
  const firstHalfSize = Math.ceil(totalPages / 2);
  const hizb1End = range.startPage + firstHalfSize - 1;

  return ref <= hizb1End ? 1 : 2;
}

export function getDisplayHizbNumber(test: JuzTestDisplayData): number | null {
  const hizbNumber = resolveHizbNumber(test);
  if (!hizbNumber) return null;
  return (test.juz_number - 1) * 2 + hizbNumber;
}

export function formatJuzTestLabel(test: JuzTestDisplayData): string {
  const hizbDisplay = getDisplayHizbNumber(test);
  if (test.test_hizb && hizbDisplay) {
    return `Hizb ${hizbDisplay}`;
  }
  return `Juz ${test.juz_number}`;
}

export function formatJuzTestPageRange(test: JuzTestDisplayData): string | null {
  const from = normalizePage(test.page_from);
  const to = normalizePage(test.page_to);

  if (from === null && to === null) return null;
  if (from !== null && to !== null) {
    if (from === to) return `Page ${from}`;
    return `Page ${from} - ${to}`;
  }

  const only = from ?? to;
  return only !== null ? `Page ${only}` : null;
}
