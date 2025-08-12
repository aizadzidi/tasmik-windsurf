// Shared types for teacher components

export interface Student {
  id: string;
  name: string;
}

export interface Report {
  id: string;
  student_id: string;
  type: string;
  surah: string;
  juzuk: number | null;
  ayat_from: number;
  ayat_to: number;
  page_from: number | null;
  page_to: number | null;
  grade: string | null;
  date: string;
  student_name?: string;
}

export type ViewMode = 'tasmik' | 'murajaah' | 'juz_tests';