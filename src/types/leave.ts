export type StaffPosition = "admin" | "teacher" | "general_worker";
export type LeaveType = "annual_leave" | "medical_leave" | "unpaid_leave";
export type LeaveStatus = "pending" | "approved" | "rejected";

export const STAFF_POSITIONS: { value: StaffPosition; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "teacher", label: "Teacher" },
  { value: "general_worker", label: "General Worker" },
];

export const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: "annual_leave", label: "Annual Leave" },
  { value: "medical_leave", label: "Medical Leave" },
  { value: "unpaid_leave", label: "Unpaid Leave" },
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
  action: "approve" | "reject";
  remarks?: string;
}
