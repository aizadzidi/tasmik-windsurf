export const DEFAULT_TENANT_PLAN = "enterprise" as const;

export const TENANT_PLAN_CATALOG = {
  starter: {
    studentStaffCap: 300,
    trialDays: 14,
    graceDays: 7,
  },
  growth: {
    studentStaffCap: 1000,
    trialDays: 14,
    graceDays: 10,
  },
  enterprise: {
    studentStaffCap: 2000,
    trialDays: 14,
    graceDays: 14,
  },
} as const;

export type TenantPlanCode = keyof typeof TENANT_PLAN_CATALOG;

export function normalizeTenantPlanCode(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

export function isSupportedTenantPlanCode(plan: string): plan is TenantPlanCode {
  return plan in TENANT_PLAN_CATALOG;
}

export function resolveTenantPlanCode(value: unknown): TenantPlanCode | null {
  const normalized = normalizeTenantPlanCode(value);
  if (!normalized) return DEFAULT_TENANT_PLAN;
  if (!isSupportedTenantPlanCode(normalized)) return null;
  return normalized;
}

export function getTenantPlanCap(planCode: TenantPlanCode): number {
  return TENANT_PLAN_CATALOG[planCode].studentStaffCap;
}
