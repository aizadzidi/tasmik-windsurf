// Quran page to Juz mapping
// Based on standard Mushaf Medina (604 pages)

export interface JuzRange {
  juz: number;
  startPage: number;
  endPage: number;
}

// Standard Juz boundaries in Mushaf Medina (aligned so Juz 1 ends at page 21, Juz 2 at 41, etc.)
const JUZ_BOUNDARIES: JuzRange[] = [
  { juz: 1, startPage: 1, endPage: 21 },
  { juz: 2, startPage: 22, endPage: 41 },
  { juz: 3, startPage: 42, endPage: 61 },
  { juz: 4, startPage: 62, endPage: 81 },
  { juz: 5, startPage: 82, endPage: 101 },
  { juz: 6, startPage: 102, endPage: 121 },
  { juz: 7, startPage: 122, endPage: 141 },
  { juz: 8, startPage: 142, endPage: 161 },
  { juz: 9, startPage: 162, endPage: 181 },
  { juz: 10, startPage: 182, endPage: 201 },
  { juz: 11, startPage: 202, endPage: 221 },
  { juz: 12, startPage: 222, endPage: 241 },
  { juz: 13, startPage: 242, endPage: 261 },
  { juz: 14, startPage: 262, endPage: 281 },
  { juz: 15, startPage: 282, endPage: 301 },
  { juz: 16, startPage: 302, endPage: 321 },
  { juz: 17, startPage: 322, endPage: 341 },
  { juz: 18, startPage: 342, endPage: 361 },
  { juz: 19, startPage: 362, endPage: 381 },
  { juz: 20, startPage: 382, endPage: 401 },
  { juz: 21, startPage: 402, endPage: 421 },
  { juz: 22, startPage: 422, endPage: 441 },
  { juz: 23, startPage: 442, endPage: 461 },
  { juz: 24, startPage: 462, endPage: 481 },
  { juz: 25, startPage: 482, endPage: 501 },
  { juz: 26, startPage: 502, endPage: 521 },
  { juz: 27, startPage: 522, endPage: 541 },
  { juz: 28, startPage: 542, endPage: 561 },
  { juz: 29, startPage: 562, endPage: 581 },
  { juz: 30, startPage: 582, endPage: 604 },
];

/**
 * Get Juz number from a page number
 * @param page - Page number (1-604)
 * @returns Juz number (1-30) or null if invalid page
 */
export function getJuzFromPage(page: number): number | null {
  if (page < 1 || page > 604) {
    return null;
  }

  const juzRange = JUZ_BOUNDARIES.find(
    range => page >= range.startPage && page <= range.endPage
  );

  return juzRange ? juzRange.juz : null;
}

/**
 * Get Juz number from a page range
 * @param pageFrom - Starting page number
 * @param pageTo - Ending page number (optional)
 * @returns Juz number or null if invalid range
 */
export function getJuzFromPageRange(pageFrom: number, pageTo?: number): number | null {
  // If only one page provided, use that page
  if (!pageTo) {
    return getJuzFromPage(pageFrom);
  }

  // If range provided, use the ending page to determine Juz
  // This ensures the juz reflects the completion level for multiple page submissions
  return getJuzFromPage(pageTo);
}

/**
 * Get page range for a specific Juz
 * @param juz - Juz number (1-30)
 * @returns Object with startPage and endPage, or null if invalid juz
 */
export function getPageRangeFromJuz(juz: number): { startPage: number; endPage: number } | null {
  if (juz < 1 || juz > 30) {
    return null;
  }

  const juzRange = JUZ_BOUNDARIES.find(range => range.juz === juz);
  return juzRange ? { startPage: juzRange.startPage, endPage: juzRange.endPage } : null;
}

/**
 * Validate if a page range is within the same Juz
 * @param pageFrom - Starting page number
 * @param pageTo - Ending page number
 * @returns true if both pages are in the same Juz
 */
export function isPagesInSameJuz(pageFrom: number, pageTo: number): boolean {
  const juzFrom = getJuzFromPage(pageFrom);
  const juzTo = getJuzFromPage(pageTo);
  
  return juzFrom !== null && juzTo !== null && juzFrom === juzTo;
}

/**
 * Get all Juz numbers covered by a page range
 * @param pageFrom - Starting page number
 * @param pageTo - Ending page number
 * @returns Array of Juz numbers covered by the range
 */
export function getJuzListFromPageRange(pageFrom: number, pageTo: number): number[] {
  const juzList: number[] = [];
  
  for (let page = pageFrom; page <= pageTo; page++) {
    const juz = getJuzFromPage(page);
    if (juz && !juzList.includes(juz)) {
      juzList.push(juz);
    }
  }
  
  return juzList.sort((a, b) => a - b);
}

/**
 * Get the relative page position within a Juz (1-20)
 * @param absolutePage - Absolute page number (1-604)
 * @returns Page position within the Juz (1-20) or null if invalid
 */
export function getPageWithinJuz(absolutePage: number): number | null {
  if (absolutePage < 1 || absolutePage > 604) {
    return null;
  }

  const juzRange = JUZ_BOUNDARIES.find(
    range => absolutePage >= range.startPage && absolutePage <= range.endPage
  );

  if (!juzRange) {
    return null;
  }

  // Calculate relative position within the Juz (1-20)
  return absolutePage - juzRange.startPage + 1;
}

/**
 * Format Murajaah display for page range within a Juz
 * @param pageFrom - Starting page number
 * @param pageTo - Ending page number (optional)
 * @returns Formatted string like "Juz 19 - 20/20" or null if invalid
 */
export function formatMurajaahDisplay(pageFrom: number, pageTo?: number): string | null {
  if (!pageTo) {
    pageTo = pageFrom;
  }

  // Use the ending page to determine the Juz for display consistency
  const juz = getJuzFromPage(pageTo);
  if (!juz) {
    return null;
  }

  // Check if range spans multiple Juz
  const juzFrom = getJuzFromPage(pageFrom);
  if (juzFrom !== juz) {
    // For now, show the ending Juz (where student completed)
    // In future, could show "Juz X-Y" for multi-Juz ranges
  }

  const juzRange = getPageRangeFromJuz(juz);
  if (!juzRange) {
    return null;
  }

  // Determine the ending page position within the Juz (1-20)
  const pagePosition = getPageWithinJuz(pageTo);
  if (!pagePosition) {
    return `Juz ${juz}`;
  }

  return `Juz ${juz} - ${pagePosition}/20`;
}
