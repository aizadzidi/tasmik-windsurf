// Utility functions for admin reports page

export interface MurajaahProgress {
  juz: number;
  hizb: number;
  page: number;
}

export interface StudentProgressData {
  id: string;
  name: string;
  teacher_name: string | null;
  class_name: string | null;
  latest_reading: string | null;
  last_read_date: string | null;
  days_since_last_read: number;
  report_type: 'Tasmi' | 'Old Murajaah' | 'New Murajaah' | 'juz_test' | null;
  memorization_completed?: boolean;
  memorization_completed_date?: string;
}

// Calculate days since last read
export function calculateDaysSinceLastRead(lastReadDate: string | null): number {
  if (!lastReadDate) return 999; // Never read
  
  const today = new Date();
  const lastDate = new Date(lastReadDate);
  const diffTime = today.getTime() - lastDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  // For future dates, return 0 to indicate "today" or recent activity
  return Math.max(0, diffDays);
}

// Format date to relative time (e.g., "3 days ago", "2 weeks ago")
export function formatRelativeDate(dateString: string | null): string {
  if (!dateString) return 'Never';
  
  const date = new Date(dateString);
  const today = new Date();
  const diffTime = today.getTime() - date.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  // Handle future dates
  if (diffDays < 0) {
    const futureDays = Math.abs(diffDays);
    if (futureDays === 1) return 'Tomorrow';
    return `In ${futureDays} days`;
  }
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return '1 week ago';
  if (diffDays < 21) return '2 weeks ago';
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 60) return '1 month ago';
  
  return `${Math.floor(diffDays / 30)} months ago`;
}

// Format absolute date (e.g., "15 Apr", "3 May 2024")
export function formatAbsoluteDate(dateString: string | null): string {
  if (!dateString) return '-';
  
  const date = new Date(dateString);
  const today = new Date();
  const isCurrentYear = date.getFullYear() === today.getFullYear();
  
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    ...(isCurrentYear ? {} : { year: 'numeric' })
  };
  
  return date.toLocaleDateString('en-US', options);
}

// Parse murajaah progress from various formats
export function parseMurajaahProgress(progressString: string | null): MurajaahProgress | null {
  if (!progressString) return null;
  
  // Handle formats like "Juz 3 - 1/20", "Juz 5 - Hizb 10", etc.
  const juzMatch = progressString.match(/Juz\s*(\d+)/i);
  if (!juzMatch) return null;
  
  const juz = parseInt(juzMatch[1]);
  
  // Check for hizb format (e.g., "Hizb 10")
  const hizbMatch = progressString.match(/Hizb\s*(\d+)/i);
  if (hizbMatch) {
    return {
      juz,
      hizb: parseInt(hizbMatch[1]),
      page: 0
    };
  }
  
  // Check for page format (e.g., "1/20", "2/20")
  const pageMatch = progressString.match(/(\d+)\/20/);
  if (pageMatch) {
    return {
      juz,
      hizb: 0,
      page: parseInt(pageMatch[1])
    };
  }
  
  return { juz, hizb: 0, page: 0 };
}

// Format murajaah progress for display
export function formatMurajaahProgress(progress: MurajaahProgress | null): string {
  if (!progress) return '-';
  
  if (progress.hizb > 0) {
    return `Juz ${progress.juz} - Hizb ${progress.hizb}`;
  }
  
  if (progress.page > 0) {
    return `Juz ${progress.juz} - ${progress.page}/20`;
  }
  
  return `Juz ${progress.juz}`;
}

// Create murajaah progress object
export function createMurajaahProgress(juz: number, hizb: number = 0, page: number = 0): MurajaahProgress {
  return { juz, hizb, page };
}

// Get row color class based on days since last read
export function getInactivityRowClass(daysSinceLastRead: number, memorization_completed?: boolean): string {
  // For completed students, use purple color scheme
  if (memorization_completed) {
    return 'bg-purple-50 border-purple-200';
  }
  
  // For students still memorizing
  if (daysSinceLastRead >= 14) return 'bg-red-50 border-red-200';
  if (daysSinceLastRead >= 7) return 'bg-orange-50 border-orange-200';
  if (daysSinceLastRead < 7 && daysSinceLastRead >= 0) return 'bg-green-50 border-green-200';
  return ''; // Never read or invalid data
}

// Get activity status text and color
export function getActivityStatus(daysSinceLastRead: number, memorization_completed?: boolean): { text: string; color: string } {
  // For completed students, always show "Completed" status
  if (memorization_completed) {
    return { text: 'Completed', color: 'text-purple-600' };
  }
  
  // For students still memorizing
  if (daysSinceLastRead >= 14) return { text: 'Critical', color: 'text-red-600' };
  if (daysSinceLastRead >= 7) return { text: 'Warning', color: 'text-orange-600' };
  if (daysSinceLastRead < 7 && daysSinceLastRead >= 0) return { text: 'Active', color: 'text-green-600' };
  return { text: 'No Data', color: 'text-gray-400' };
}

// Sort students by activity (most inactive first)
export function sortStudentsByActivity(students: StudentProgressData[]): StudentProgressData[] {
  return [...students].sort((a, b) => {
    // Students who never read come last
    if (a.days_since_last_read === 999) return 1;
    if (b.days_since_last_read === 999) return -1;
    
    // Otherwise, sort by days since last read (descending - most inactive first)
    return b.days_since_last_read - a.days_since_last_read;
  });
}

// Filter students by search term
export function filterStudentsBySearch(students: StudentProgressData[], searchTerm: string): StudentProgressData[] {
  if (!searchTerm.trim()) return students;
  
  const term = searchTerm.toLowerCase().trim();
  return students.filter(student =>
    student.name.toLowerCase().includes(term) ||
    student.teacher_name?.toLowerCase().includes(term) ||
    student.class_name?.toLowerCase().includes(term)
  );
}

// Filter students by teacher
export function filterStudentsByTeacher(students: StudentProgressData[], teacherFilter: string): StudentProgressData[] {
  if (!teacherFilter) return students;
  
  return students.filter(student => student.teacher_name === teacherFilter);
}

// Filter students by completion status
export function filterStudentsByCompletion(students: StudentProgressData[], showCompleted: boolean): StudentProgressData[] {
  return students.filter(student => 
    showCompleted ? student.memorization_completed === true : student.memorization_completed !== true
  );
}

// Get unique teachers from student data
export function getUniqueTeachers(students: StudentProgressData[]): string[] {
  const teachers = students
    .map(s => s.teacher_name)
    .filter((name): name is string => name !== null);
  
  return [...new Set(teachers)].sort();
}

// Get summary statistics
export interface SummaryStats {
  totalStudents: number;
  inactive7Days: number;
  inactive14Days: number;
}

export function getSummaryStats(students: StudentProgressData[]): SummaryStats {
  return {
    totalStudents: students.length,
    inactive7Days: students.filter(s => s.days_since_last_read >= 7).length,
    inactive14Days: students.filter(s => s.days_since_last_read >= 14).length
  };
}