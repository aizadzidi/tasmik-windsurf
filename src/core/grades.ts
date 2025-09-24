// Single FE place for grade typing + helpers.
// NOTE: DB remains the source of truth for ordering via SQL grade_rank.
// Keep this list in sync with the CASE expression in get_grade_summary_per_class.

export const GRADE_ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'C+', 'C', 'D', 'E', 'G'] as const;
export type GradeCode = (typeof GRADE_ORDER)[number];

// Match SQL: A+=1 ... E=11, and G is treated as 999 (last).
export const GRADE_RANK: Record<GradeCode, number> = {
  'A+': 1,
  'A': 2,
  'A-': 3,
  'B+': 4,
  'B': 5,
  'C+': 7,
  'C': 8,
  'D': 10,
  'E': 11,
  'G': 999,
};

// Fallback comparator if a component ever needs to sort grades without SQL rank.
export function compareGrade(a: GradeCode, b: GradeCode) {
  return (GRADE_RANK[a] ?? 999) - (GRADE_RANK[b] ?? 999);
}

// Optional minimal color mapping for chips (keep palette consistent).
export const GRADE_COLOR: Record<GradeCode, string> = {
  'A+': 'emerald',
  'A': 'emerald',
  'A-': 'emerald',
  'B+': 'sky',
  'B': 'sky',
  'C+': 'amber',
  'C': 'amber',
  'D': 'orange',
  'E': 'rose',
  'G': 'zinc',
};

// Tiny helper for title/tooltip text.
export function gradeChipTitle(g: GradeCode, cnt: number, total?: number) {
  return total ? `${g}: ${cnt} subjects (of ${total})` : `${g}: ${cnt} subjects`;
}
