export type OnlineClaimStatus =
  | "pending_payment"
  | "active"
  | "expired"
  | "released"
  | "cancelled";

export type AttendanceMarkStatus = "present" | "absent";

export interface OnlineCourse {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  monthly_fee_cents: number;
  sessions_per_week: number;
  is_active: boolean;
}

export interface OnlineSlotTemplate {
  id: string;
  tenant_id: string;
  course_id: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  timezone: string;
  is_active: boolean;
}

export interface OnlineTeacherAvailability {
  teacher_id: string;
  slot_template_id: string;
  is_available: boolean;
  last_assigned_at: string | null;
}

export interface OnlineSlotClaim {
  id: string;
  tenant_id: string;
  course_id: string;
  slot_template_id: string;
  session_date: string;
  student_id: string;
  parent_id: string;
  assigned_teacher_id: string;
  enrollment_id: string | null;
  status: OnlineClaimStatus;
  seat_hold_expires_at: string | null;
  assignment_strategy: string;
  payment_reference: string | null;
  claimed_at: string;
}

export interface OnlineClaimRpcRow {
  ok: boolean;
  code: string;
  message: string;
  claim_id: string | null;
  assigned_teacher_id: string | null;
  seat_hold_expires_at: string | null;
  enrollment_id: string | null;
}

export interface ConfirmPaymentRpcRow {
  ok: boolean;
  code: string;
  message: string;
  enrollment_id: string | null;
  claim_status: OnlineClaimStatus | null;
}

export interface TeacherLoadCandidate {
  teacherId: string;
  activeLoad: number;
  lastAssignedAt: string | null;
}
