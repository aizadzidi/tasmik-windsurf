// Grade utilities for converting between string grades and numerical values

export const GRADE_VALUES = {
  'mumtaz': 3,
  'jayyid jiddan': 2,
  'jayyid': 1
} as const;

export const GRADE_NAMES = {
  3: 'mumtaz',
  2: 'jayyid jiddan',
  1: 'jayyid'
} as const;

export type GradeString = keyof typeof GRADE_VALUES;
export type GradeNumber = keyof typeof GRADE_NAMES;

/**
 * Convert grade string to numerical value
 */
export function gradeToNumber(grade: string): number | null {
  const normalizedGrade = grade.toLowerCase() as GradeString;
  return GRADE_VALUES[normalizedGrade] || null;
}

/**
 * Convert numerical value to grade string
 */
export function numberToGrade(value: number): string | null {
  const roundedValue = Math.round(value) as GradeNumber;
  return GRADE_NAMES[roundedValue] || null;
}

/**
 * Calculate average grade from array of grade strings
 */
export function calculateAverageGrade(grades: (string | null)[]): string | null {
  const validGrades = grades
    .filter((grade): grade is string => grade !== null)
    .map(grade => gradeToNumber(grade))
    .filter((value): value is number => value !== null);

  if (validGrades.length === 0) return null;

  const average = validGrades.reduce((sum, value) => sum + value, 0) / validGrades.length;
  return numberToGrade(average);
}

/**
 * Get week boundaries (Monday to Friday) for a given date
 */
export function getWeekBoundaries(date: Date | string): { monday: string; friday: string; weekRange: string } {
  const targetDate = typeof date === 'string' ? new Date(date) : date;
  const dayOfWeek = targetDate.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Find Monday of this week
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(targetDate);
  monday.setDate(targetDate.getDate() + mondayOffset);
  
  // Find Friday of this week
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  
  // Format for display: "Dec 9-13, 2024"
  const monthName = monday.toLocaleDateString('en-US', { month: 'short' });
  const startDay = monday.getDate();
  const endDay = friday.getDate();
  const year = monday.getFullYear();
  
  return {
    monday: monday.toISOString().slice(0, 10),
    friday: friday.toISOString().slice(0, 10),
    weekRange: `${monthName} ${startDay}-${endDay}, ${year}`
  };
}

/**
 * Get week identifier string for grouping (e.g., "2024-W49")
 */
export function getWeekIdentifier(date: Date | string): string {
  const targetDate = typeof date === 'string' ? new Date(date) : date;
  const { monday } = getWeekBoundaries(targetDate);
  const mondayDate = new Date(monday);
  
  // Get ISO week number
  const yearStart = new Date(mondayDate.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(((mondayDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  
  return `${mondayDate.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
}