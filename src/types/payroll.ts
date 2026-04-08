export type PayrollStatus = "draft" | "finalized";

export const DEFAULT_WORKING_DAYS = 22;
export const DEFAULT_EPF_EMPLOYEE_RATE = 11.0;
export const DEFAULT_EPF_EMPLOYER_RATE = 13.0;
export const DEFAULT_SOCSO_EMPLOYEE_RATE = 0.5;
export const DEFAULT_SOCSO_EMPLOYER_RATE = 1.75;
export const DEFAULT_EIS_EMPLOYEE_RATE = 0.2;
export const DEFAULT_EIS_EMPLOYER_RATE = 0.2;

export const PAYROLL_STATUS_STYLES: Record<PayrollStatus, string> = {
  draft: "bg-amber-100 text-amber-800",
  finalized: "bg-emerald-100 text-emerald-800",
};

export const PAYROLL_STATUS_LABELS: Record<PayrollStatus, string> = {
  draft: "Draft",
  finalized: "Finalized",
};

/** Round to 2 decimal places - applied at every calculation step */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Format as RM currency */
export function formatRM(amount: number): string {
  return `RM ${amount.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export interface StaffSalaryConfig {
  id: string;
  tenant_id: string;
  user_id: string;
  basic_salary: number;
  working_days_per_month: number;
  housing_allowance: number;
  transport_allowance: number;
  meal_allowance: number;
  other_allowance: number;
  other_allowance_label: string;
  epf_employee_rate: number;
  epf_employer_rate: number;
  socso_employee_rate: number;
  socso_employer_rate: number;
  eis_employee_rate: number;
  eis_employer_rate: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  user_name?: string;
  user_email?: string;
  user_role?: string;
  has_config?: boolean;
}

export interface MonthlyPayroll {
  id: string;
  tenant_id: string;
  user_id: string;
  payroll_month: string;
  staff_name: string;
  staff_position: string;
  basic_salary: number;
  working_days: number;
  daily_rate: number;
  housing_allowance: number;
  transport_allowance: number;
  meal_allowance: number;
  other_allowance: number;
  other_allowance_label: string;
  total_allowances: number;
  upl_days: number;
  upl_deduction: number;
  epf_employee: number;
  epf_employer: number;
  socso_employee: number;
  socso_employer: number;
  eis_employee: number;
  eis_employer: number;
  epf_employee_rate: number;
  epf_employer_rate: number;
  socso_employee_rate: number;
  socso_employer_rate: number;
  eis_employee_rate: number;
  eis_employer_rate: number;
  custom_deduction_amount: number;
  custom_deduction_note: string;
  gross_salary: number;
  total_deductions: number;
  net_salary: number;
  status: PayrollStatus;
  finalized_at: string | null;
  finalized_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollSummary {
  total_staff: number;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  total_employer_epf: number;
  total_employer_socso: number;
  total_employer_eis: number;
  finalized_count: number;
  draft_count: number;
}

export interface PayrollGenerateResult {
  records: MonthlyPayroll[];
  summary: PayrollSummary;
  skipped_staff: { user_id: string; user_name: string; reason: string }[];
}
