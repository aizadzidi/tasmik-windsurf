export interface GradingScale {
  type: 'letter' | 'percentage' | 'points';
  grades: GradeRange[];
}

export interface GradeRange {
  min: number;
  max: number;
  letter?: string;
  grade?: string;
  gpa?: number;
}

// Cache for grading scales to avoid repeated DB calls
const gradingScaleCache = new Map<string, GradingScale>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const cacheTimestamps = new Map<string, number>();

/**
 * Fetch grading scale for a specific exam, with caching
 */
export async function getGradingScale(examId: string): Promise<GradingScale | null> {
  const cacheKey = `exam_${examId}`;
  const now = Date.now();
  
  // Check cache first
  if (gradingScaleCache.has(cacheKey)) {
    const timestamp = cacheTimestamps.get(cacheKey) || 0;
    if (now - timestamp < CACHE_DURATION) {
      return gradingScaleCache.get(cacheKey) || null;
    }
  }

  try {
    // Fetch from database
    const response = await fetch(`/api/teacher/grading-scale?examId=${examId}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    const gradingScale = data.gradingScale as GradingScale;
    
    if (gradingScale) {
      // Cache the result
      gradingScaleCache.set(cacheKey, gradingScale);
      cacheTimestamps.set(cacheKey, now);
    }
    
    return gradingScale;
  } catch (error) {
    console.error('Failed to fetch grading scale:', error);
    return getDefaultGradingScale(); // Fallback
  }
}

/**
 * Compute grade from mark using dynamic grading scale
 */
export function computeGrade(mark: number, gradingScale: GradingScale): string {
  if (!gradingScale || !gradingScale.grades) {
    return computeGradeDefault(mark);
  }

  // Find the appropriate grade range
  const gradeRange = gradingScale.grades.find(range => 
    mark >= range.min && mark <= range.max
  );

  if (gradeRange) {
    return gradeRange.letter || gradeRange.grade || '';
  }

  // Fallback to highest or lowest grade if outside range
  const sortedGrades = [...gradingScale.grades].sort((a, b) => a.min - b.min);
  if (mark < sortedGrades[0].min) {
    return sortedGrades[0].letter || sortedGrades[0].grade || '';
  }
  if (mark > sortedGrades[sortedGrades.length - 1].max) {
    return sortedGrades[sortedGrades.length - 1].letter || sortedGrades[sortedGrades.length - 1].grade || '';
  }

  return '';
}

/**
 * Default grading scale (SPM 2023) as fallback
 */
function getDefaultGradingScale(): GradingScale {
  return {
    type: 'letter',
    grades: [
      { min: 90, max: 100, letter: 'A+' },
      { min: 80, max: 89, letter: 'A' },
      { min: 70, max: 79, letter: 'A-' },
      { min: 65, max: 69, letter: 'B+' },
      { min: 60, max: 64, letter: 'B' },
      { min: 55, max: 59, letter: 'C+' },
      { min: 50, max: 54, letter: 'C' },
      { min: 45, max: 49, letter: 'D' },
      { min: 40, max: 44, letter: 'E' },
      { min: 0, max: 39, letter: 'G' },
    ]
  };
}

/**
 * Default grade computation (hardcoded SPM 2023)
 */
function computeGradeDefault(mark: number): string {
  if (mark >= 90) return 'A+';
  if (mark >= 80) return 'A';
  if (mark >= 70) return 'A-';
  if (mark >= 65) return 'B+';
  if (mark >= 60) return 'B';
  if (mark >= 55) return 'C+';
  if (mark >= 50) return 'C';
  if (mark >= 45) return 'D';
  if (mark >= 40) return 'E';
  return 'G';
}

/**
 * Clear the grading scale cache (useful for admin operations)
 */
export function clearGradingScaleCache(examId?: string) {
  if (examId) {
    const cacheKey = `exam_${examId}`;
    gradingScaleCache.delete(cacheKey);
    cacheTimestamps.delete(cacheKey);
  } else {
    gradingScaleCache.clear();
    cacheTimestamps.clear();
  }
}