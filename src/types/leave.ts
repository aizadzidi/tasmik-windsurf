export type StaffPosition = "admin" | "teacher" | "general_worker";
export type LeaveType = "annual_leave" | "medical_leave" | "unpaid_leave" | "maternity_leave" | "paternity_leave" | "ihsan_leave";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export const STAFF_POSITIONS: { value: StaffPosition; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "teacher", label: "Teacher" },
  { value: "general_worker", label: "General Worker" },
];

export const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: "medical_leave", label: "Medical Leave" },
  { value: "annual_leave", label: "Annual Leave" },
  { value: "unpaid_leave", label: "Unpaid Leave" },
  { value: "paternity_leave", label: "Paternity Leave" },
  { value: "maternity_leave", label: "Maternity Leave" },
  { value: "ihsan_leave", label: "Ihsan Leave" },
];

/** Leave types that skip balance deduction — empty means all types use balance tracking */
export const SPECIAL_LEAVE_TYPES = new Set<LeaveType>([]);

export const DEFAULT_ENTITLEMENTS: { position: string; leave_type: string; days_per_year: number }[] = [
  { position: "admin", leave_type: "annual_leave", days_per_year: 14 },
  { position: "admin", leave_type: "medical_leave", days_per_year: 14 },
  { position: "admin", leave_type: "unpaid_leave", days_per_year: 0 },
  { position: "admin", leave_type: "maternity_leave", days_per_year: 60 },
  { position: "admin", leave_type: "paternity_leave", days_per_year: 7 },
  { position: "admin", leave_type: "ihsan_leave", days_per_year: 3 },
  { position: "teacher", leave_type: "annual_leave", days_per_year: 12 },
  { position: "teacher", leave_type: "medical_leave", days_per_year: 14 },
  { position: "teacher", leave_type: "unpaid_leave", days_per_year: 0 },
  { position: "teacher", leave_type: "maternity_leave", days_per_year: 60 },
  { position: "teacher", leave_type: "paternity_leave", days_per_year: 7 },
  { position: "teacher", leave_type: "ihsan_leave", days_per_year: 3 },
  { position: "general_worker", leave_type: "annual_leave", days_per_year: 10 },
  { position: "general_worker", leave_type: "medical_leave", days_per_year: 14 },
  { position: "general_worker", leave_type: "unpaid_leave", days_per_year: 0 },
  { position: "general_worker", leave_type: "maternity_leave", days_per_year: 60 },
  { position: "general_worker", leave_type: "paternity_leave", days_per_year: 7 },
  { position: "general_worker", leave_type: "ihsan_leave", days_per_year: 3 },
];

export interface LeaveEntitlement {
  id: string;
  tenant_id: string;
  position: StaffPosition;
  leave_type: LeaveType;
  days_per_year: number;
  created_at: string;
  updated_at: string;
}

export interface LeaveApplication {
  id: string;
  tenant_id: string;
  user_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string | null;
  status: LeaveStatus;
  reviewed_by: string | null;
  review_remarks: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  user_name?: string;
  user_email?: string;
  user_role?: string;
}

export interface LeaveBalance {
  id: string;
  tenant_id: string;
  user_id: string;
  leave_type: LeaveType;
  year: number;
  entitled_days: number;
  used_days: number;
  created_at: string;
  updated_at: string;
}

export interface LeaveBalanceSummary {
  leave_type: LeaveType;
  label: string;
  entitled_days: number;
  used_days: number;
  remaining_days: number;
  is_unlimited: boolean;
}

export interface ApplyLeavePayload {
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  reason?: string;
}

export interface ReviewLeavePayload {
  application_id: string;
  action: "approve" | "reject" | "cancel";
  remarks?: string;
}
