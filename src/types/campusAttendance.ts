export type CampusAttendanceStatus = "present" | "absent" | "late";

export type CampusSessionState =
  | "planned"
  | "in_progress"
  | "finalized"
  | "cancelled"
  | "holiday";

export type CampusAttendanceSource = "teacher" | "admin_override" | "legacy_migration";

export type CampusSessionTemplate = {
  id: string;
  tenant_id: string;
  class_id: string;
  subject_id: string | null;
  teacher_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  classes?: { name?: string | null } | null;
  subjects?: { name?: string | null } | null;
  users?: { name?: string | null } | null;
};

export type CampusSessionInstance = {
  id: string;
  tenant_id: string;
  template_id: string | null;
  class_id: string;
  subject_id: string | null;
  teacher_id: string | null;
  session_date: string;
  start_time: string;
  end_time: string;
  state: CampusSessionState;
  generation_source: "auto" | "manual" | "legacy_migration";
  generated_at: string;
  finalized_at: string | null;
  finalized_by: string | null;
  finalize_note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  classes?: { name?: string | null } | null;
  subjects?: { name?: string | null } | null;
  users?: { name?: string | null } | null;
};

export type CampusAttendanceMark = {
  id: string;
  tenant_id: string;
  session_instance_id: string;
  student_id: string;
  status: CampusAttendanceStatus;
  reason_code: string | null;
  notes: string | null;
  source: CampusAttendanceSource;
  marked_by: string | null;
  marked_at: string;
  created_at: string;
  updated_at: string;
  students?: { name?: string | null; class_id?: string | null } | null;
};

export type CampusSessionStudent = {
  student_id: string;
  student_name: string;
  class_id: string;
  status: CampusAttendanceStatus;
  mark_id: string | null;
  source: CampusAttendanceSource | null;
  notes: string | null;
  reason_code: string | null;
};

export type TeacherSessionQueueItem = {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  state: CampusSessionState;
  class_id: string;
  class_name: string;
  subject_name: string | null;
  teacher_id: string | null;
  teacher_name: string | null;
  student_total: number;
  marked_total: number;
  absent_total: number;
  late_total: number;
  priority: "overdue" | "ongoing" | "upcoming" | "completed" | "holiday";
};

export type TeacherSessionDetail = {
  session: TeacherSessionQueueItem;
  students: CampusSessionStudent[];
};

export type CampusSessionDetail = TeacherSessionDetail;

export type TeacherRiskStudent = {
  student_id: string;
  student_name: string;
  class_id: string | null;
  class_name: string;
  total_sessions_30d: number;
  absent_30d: number;
  late_30d: number;
  risk_score: number;
  last_absent_date: string | null;
};

export type AdminLiveSessionItem = {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  state: CampusSessionState;
  class_id: string;
  class_name: string;
  teacher_id: string | null;
  teacher_name: string | null;
  student_total: number;
  marked_total: number;
  absent_total: number;
  late_total: number;
  is_overdue: boolean;
};

export type AttendanceAnalyticsRow = {
  bucket_date: string;
  class_id: string;
  class_name: string;
  teacher_id: string | null;
  teacher_name: string | null;
  total_marks: number;
  present_count: number;
  absent_count: number;
  late_count: number;
  present_rate_pct: number;
  absent_rate_pct: number;
  late_rate_pct: number;
};

export type LatenessHeatmapRow = {
  day_of_week: number;
  hour_bucket: number;
  late_count: number;
  total_count: number;
  late_rate_pct: number;
};

export type BulkMarkPayload = {
  updates: Array<{
    student_id: string;
    status: CampusAttendanceStatus;
    notes?: string | null;
    reason_code?: string | null;
  }>;
};

export type OverrideMarkPayload = {
  status: CampusAttendanceStatus;
  reason: string;
  notes?: string | null;
};

export type SessionTemplatePayload = {
  class_id: string;
  subject_id?: string | null;
  teacher_id?: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  effective_from: string;
  effective_to?: string | null;
  is_active?: boolean;
  notes?: string | null;
};
