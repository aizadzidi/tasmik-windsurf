export type AttendanceStatus = "present" | "absent";

export interface StudentProfile {
  id: string;
  name: string;
  familyId: string;
  classId: string;
}

export interface AttendanceDay {
  date: string; // ISO format (yyyy-mm-dd)
  statuses: Record<string, AttendanceStatus>;
  note?: string;
}

export interface ClassAttendance {
  id: string;
  name: string;
  students: StudentProfile[];
  records: AttendanceDay[];
}

export type AttendanceRecord = Record<string, Record<string, Record<string, AttendanceStatus>>>;

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
