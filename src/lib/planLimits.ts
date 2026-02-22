import type { SupabaseClient } from "@supabase/supabase-js";

export const TENANT_LIMIT_EXCEEDED_CODE = "TENANT_LIMIT_EXCEEDED";

export type TenantPlanLimitCheck = {
  allowed: boolean;
  limitCode: string;
  cap: number;
  activeStudents: number;
  activeStaff: number;
  projectedTotal: number;
  overage: number;
  graceStartedAt: string | null;
  graceEndsAt: string | null;
  blockedNewAdds: boolean;
};

export type TenantPlanLimitErrorPayload = {
  error: string;
  code: string;
  cap: number;
  active_students: number;
  active_staff: number;
  projected_total: number;
  overage: number;
  grace_started_at: string | null;
  grace_ends_at: string | null;
  blocked_new_adds: boolean;
};

export class TenantPlanLimitExceededError extends Error {
  status: number;
  payload: TenantPlanLimitErrorPayload;

  constructor(payload: TenantPlanLimitErrorPayload) {
    super(payload.error);
    this.name = "TenantPlanLimitExceededError";
    this.status = 409;
    this.payload = payload;
  }
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.trunc(parsed);
}

function toBoolean(value: unknown): boolean {
  return value === true;
}

function toNullableIso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toLimitCheckRow(row: Record<string, unknown>): TenantPlanLimitCheck {
  return {
    allowed: toBoolean(row.allowed),
    limitCode: typeof row.limit_code === "string" ? row.limit_code : "UNKNOWN",
    cap: Math.max(0, toNumber(row.cap)),
    activeStudents: Math.max(0, toNumber(row.active_students)),
    activeStaff: Math.max(0, toNumber(row.active_staff)),
    projectedTotal: Math.max(0, toNumber(row.projected_total)),
    overage: Math.max(0, toNumber(row.overage)),
    graceStartedAt: toNullableIso(row.grace_started_at),
    graceEndsAt: toNullableIso(row.grace_ends_at),
    blockedNewAdds: toBoolean(row.blocked_new_adds),
  };
}

export function toTenantLimitErrorPayload(
  check: TenantPlanLimitCheck
): TenantPlanLimitErrorPayload {
  return {
    error: "Tenant has reached the student + staff limit. New additions are blocked.",
    code: TENANT_LIMIT_EXCEEDED_CODE,
    cap: check.cap,
    active_students: check.activeStudents,
    active_staff: check.activeStaff,
    projected_total: check.projectedTotal,
    overage: check.overage,
    grace_started_at: check.graceStartedAt,
    grace_ends_at: check.graceEndsAt,
    blocked_new_adds: check.blockedNewAdds,
  };
}

export async function checkTenantPlanLimit(params: {
  client: SupabaseClient;
  tenantId: string;
  addStudents?: number;
  addStaff?: number;
}): Promise<TenantPlanLimitCheck> {
  const { client, tenantId } = params;
  const addStudents = Math.max(0, Math.trunc(params.addStudents ?? 0));
  const addStaff = Math.max(0, Math.trunc(params.addStaff ?? 0));

  const { data, error } = await client.rpc("check_tenant_plan_limit", {
    p_tenant_id: tenantId,
    p_add_students: addStudents,
    p_add_staff: addStaff,
  });

  if (error) {
    throw new Error(`Plan limit check failed: ${error.message}`);
  }

  const row =
    Array.isArray(data) && data.length > 0
      ? (data[0] as Record<string, unknown>)
      : (data as Record<string, unknown> | null);
  if (!row) {
    throw new Error("Plan limit check returned no data");
  }

  return toLimitCheckRow(row);
}

export async function enforceTenantPlanLimit(params: {
  client: SupabaseClient;
  tenantId: string;
  addStudents?: number;
  addStaff?: number;
}) {
  const check = await checkTenantPlanLimit(params);
  if (check.allowed) return check;
  throw new TenantPlanLimitExceededError(toTenantLimitErrorPayload(check));
}

