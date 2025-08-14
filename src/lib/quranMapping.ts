// Quran page to Juz mapping
// Based on standard Mushaf Medina (604 pages)

export interface JuzRange {
  juz: number;
  startPage: number;
  endPage: number;
}

// Standard Juz boundaries in Mushaf Medina (adjusted for 20 pages per Juz)
const JUZ_BOUNDARIES: JuzRange[] = [
  { juz: 1, startPage: 1, endPage: 20 },      // Al-Fatihah - Al-Baqarah 141
  { juz: 2, startPage: 21, endPage: 40 },     // Al-Baqarah 142 - Al-Baqarah 252
  { juz: 3, startPage: 41, endPage: 60 },     // Al-Baqarah 253 - Aali Imran 92
  { juz: 4, startPage: 61, endPage: 80 },     // Aali Imran 93 - An-Nisa 23
  { juz: 5, startPage: 81, endPage: 100 },    // An-Nisa 24 - An-Nisa 147
  { juz: 6, startPage: 101, endPage: 120 },   // An-Nisa 148 - Al-Ma'idah 81
  { juz: 7, startPage: 121, endPage: 140 },   // Al-Ma'idah 82 - Al-An'am 110
  { juz: 8, startPage: 141, endPage: 160 },   // Al-An'am 111 - Al-A'raf 87
  { juz: 9, startPage: 161, endPage: 180 },   // Al-A'raf 88 - Al-Anfal 40
  { juz: 10, startPage: 181, endPage: 200 },  // Al-Anfal 41 - At-Tawbah 92
  { juz: 11, startPage: 201, endPage: 220 },  // At-Tawbah 93 - Hud 5
  { juz: 12, startPage: 221, endPage: 240 },  // Hud 6 - Yusuf 52
  { juz: 13, startPage: 241, endPage: 260 },  // Yusuf 53 - Ibrahim 52
  { juz: 14, startPage: 261, endPage: 280 },  // Al-Hijr 1 - An-Nahl 128
  { juz: 15, startPage: 281, endPage: 300 },  // Al-Isra 1 - Al-Kahf 74
  { juz: 16, startPage: 301, endPage: 320 },  // Al-Kahf 75 - Ta-Ha 135
  { juz: 17, startPage: 321, endPage: 340 },  // Al-Anbiya 1 - Al-Hajj 78
  { juz: 18, startPage: 341, endPage: 360 },  // Al-Mu'minun 1 - Al-Furqan 20
  { juz: 19, startPage: 361, endPage: 380 },  // Al-Furqan 21 - An-Naml 55
  { juz: 20, startPage: 381, endPage: 400 },  // An-Naml 56 - Al-Ankabut 45
  { juz: 21, startPage: 401, endPage: 420 },  // Al-Ankabut 46 - As-Sajdah 30
  { juz: 22, startPage: 421, endPage: 440 },  // Al-Ahzab 1 - Ya-Sin 27
  { juz: 23, startPage: 441, endPage: 460 },  // Ya-Sin 28 - Az-Zumar 31
  { juz: 24, startPage: 461, endPage: 480 },  // Az-Zumar 32 - Fussilat 46
  { juz: 25, startPage: 481, endPage: 500 },  // Fussilat 47 - Al-Jathiyah 37
  { juz: 26, startPage: 501, endPage: 520 },  // Al-Ahqaf 1 - Adh-Dhariyat 30
  { juz: 27, startPage: 521, endPage: 540 },  // Adh-Dhariyat 31 - Al-Hadid 29
  { juz: 28, startPage: 541, endPage: 560 },  // Al-Mujadila 1 - At-Tahrim 12
  { juz: 29, startPage: 561, endPage: 580 },  // Al-Mulk 1 - Al-Mursalat 50
  { juz: 30, startPage: 581, endPage: 604 },  // An-Naba 1 - An-Nas 6 (24 pages due to being last)
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

  // If range provided, use the starting page to determine Juz
  // This is because memorization typically follows sequential order
  return getJuzFromPage(pageFrom);
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

  const juz = getJuzFromPage(pageFrom);
  if (!juz) {
    return null;
  }

  // Check if range spans multiple Juz
  const juzTo = getJuzFromPage(pageTo);
  if (juzTo !== juz) {
    // For now, show the starting Juz
    // In future, could show "Juz X-Y" for multi-Juz ranges
  }

  const juzRange = getPageRangeFromJuz(juz);
  if (!juzRange) {
    return null;
  }

  // Calculate pages covered within this Juz
  const effectivePageFrom = Math.max(pageFrom, juzRange.startPage);
  const effectivePageTo = Math.min(pageTo, juzRange.endPage);
  
  const pagesInJuz = effectivePageTo - effectivePageFrom + 1;
  
  return `Juz ${juz} - ${pagesInJuz}/20`;
}