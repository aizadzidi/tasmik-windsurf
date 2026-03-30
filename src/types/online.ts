export type OnlineClaimStatus =
  | "pending_payment"
  | "active"
  | "expired"
  | "released"
  | "cancelled";

export type AttendanceMarkStatus = "present" | "absent";
export type OnlineRecurringPackageStatus =
  | "draft"
  | "pending_payment"
  | "active"
  | "paused"
  | "cancelled"
  | "legacy_review_required";
export type OnlineStudentPackageAssignmentStatus =
  | "draft"
  | "pending_payment"
  | "active"
  | "paused"
  | "cancelled";

export type OnlineRecurringPackageSlotStatus = "active" | "moved" | "cancelled";
export type OnlinePackageChangeRequestStatus =
  | "draft"
  | "pending_payment"
  | "scheduled"
  | "cancelled"
  | "applied";
export type OnlinePackageChangeBillingStatus =
  | "not_required"
  | "pending_payment"
  | "paid"
  | "credit_due";

export interface OnlineCourse {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  monthly_fee_cents: number;
  sessions_per_week: number;
  color_hex?: string | null;
  default_slot_duration_minutes?: number | null;
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

export interface OnlineRecurringPackage {
  id: string;
  tenant_id: string;
  student_id: string;
  course_id: string;
  teacher_id: string;
  student_package_assignment_id?: string | null;
  status: OnlineRecurringPackageStatus;
  source: string;
  effective_month: string;
  effective_from: string;
  effective_to: string | null;
  sessions_per_week: number;
  monthly_fee_cents_snapshot: number;
  notes: string | null;
  hold_expires_at?: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnlineStudentPackageAssignment {
  id: string;
  tenant_id: string;
  student_id: string;
  course_id: string;
  teacher_id: string;
  status: OnlineStudentPackageAssignmentStatus;
  effective_from: string;
  effective_to: string | null;
  sessions_per_week_snapshot: number;
  duration_minutes_snapshot: number;
  monthly_fee_cents_snapshot: number;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnlineRecurringPackageSlot {
  id: string;
  tenant_id: string;
  package_id: string;
  slot_template_id: string;
  day_of_week_snapshot: number;
  start_time_snapshot: string;
  duration_minutes_snapshot: number;
  status: OnlineRecurringPackageSlotStatus;
  created_at: string;
  updated_at: string;
}

export interface OnlineRecurringOccurrence {
  id: string;
  tenant_id: string;
  package_id: string;
  package_slot_id: string;
  student_id: string;
  course_id: string;
  teacher_id: string;
  slot_template_id: string;
  session_date: string;
  start_time: string;
  duration_minutes: number;
  attendance_status: AttendanceMarkStatus | null;
  attendance_notes: string | null;
  recorded_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnlinePackageChangeRequest {
  id: string;
  tenant_id: string;
  student_id: string;
  current_package_id: string;
  next_package_id_draft: string;
  requested_by: string | null;
  effective_month: string;
  pricing_delta_cents: number;
  billing_status: OnlinePackageChangeBillingStatus;
  status: OnlinePackageChangeRequestStatus;
  created_at: string;
  updated_at: string;
}

export interface OnlineTeacherScheduleSlotInput {
  day_of_week: number;
  start_time: string;
}

export interface OnlineTeacherSchedulerAssignment {
  id: string;
  student_id: string;
  student_name: string;
  parent_name: string | null;
  parent_contact_number: string | null;
  course_id: string;
  course_name: string;
  status: OnlineStudentPackageAssignmentStatus;
  sessions_per_week: number;
  monthly_fee_cents: number;
  duration_minutes: number;
  effective_from: string;
  effective_to: string | null;
}

export interface OnlineTeacherSchedulerStudent {
  id: string;
  name: string;
  parent_name: string | null;
  parent_contact_number: string | null;
}

export interface OnlineTeacherSchedulerCourse {
  id: string;
  name: string;
  sessions_per_week: number;
  monthly_fee_cents: number;
  duration_minutes: number;
}

export interface OnlineTeacherSchedulerOptions {
  pending_assignments: OnlineTeacherSchedulerAssignment[];
  slot_capacity: "single_student";
}

export interface OnlinePlannerTeacherOption {
  id: string;
  name: string;
  active_package_count: number;
  available_slot_count: number;
}

export interface OnlinePlannerOccupiedPill {
  slot_template_id: string;
  package_id: string;
  package_slot_id: string;
  student_id: string;
  student_name: string;
  parent_name: string | null;
  parent_contact_number: string | null;
  course_id: string;
  course_name: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  effective_month: string;
  next_occurrence_date: string | null;
  next_month_change_pending: boolean;
}

export interface OnlinePlannerEmptySlot {
  slot_template_id: string;
  course_id: string;
  course_name: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  is_active: boolean;
  is_available: boolean;
}

export interface OnlinePlannerDay {
  day_of_week: number;
  label: string;
  occupied_pills: OnlinePlannerOccupiedPill[];
  hidden_empty_count: number;
  empty_slots: OnlinePlannerEmptySlot[];
}
