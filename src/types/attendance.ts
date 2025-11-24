export type AttendanceStatus = "present" | "absent";

export interface StudentProfile {
  id: string;
  name: string;
  familyId: string;
  classId: string;
}

export interface AttendanceEntry {
  statuses: Record<string, AttendanceStatus>;
  note?: string;
  submitted: boolean;
}

export interface AttendanceDay extends AttendanceEntry {
  date: string; // ISO format (yyyy-mm-dd)
}

export interface ClassAttendance {
  id: string;
  name: string;
  students: StudentProfile[];
  records: AttendanceDay[];
}

export type AttendanceRecord = Record<string, Record<string, AttendanceEntry>>;

export interface StudentAttendanceSummary {
  id: string;
  name: string;
  classId: string;
  className: string;
  familyId: string;
  totalDays: number;
  presentDays: number;
  absentDays: number;
  attendancePercent: number;
  currentPresentStreak: number;
  bestPresentStreak: number;
  lastAbsentDate?: string;
}

export interface SchoolHoliday {
  id: string;
  title: string;
  description?: string | null;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  category: string;
  created_at?: string;
  updated_at?: string;
}
