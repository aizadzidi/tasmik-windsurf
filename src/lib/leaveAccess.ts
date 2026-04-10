import { adminOperationSimple, supabaseService } from "@/lib/supabaseServiceClientSimple";
import {
  ensureTeacherHasCampusLeaveAccess,
  isTeacherLeaveAccessForbiddenError,
} from "@/lib/teacherProgramScope";

/** Supabase service client type used across leave helpers. */
export type SupabaseServiceClient = NonNullable<typeof supabaseService>;

/** Re-export from existing UTC-safe util so callers can import from one place. */
export { countBusinessDays } from "@/lib/dateUtils";

/**
 * Map user/profile role to staff position for entitlement lookups.
 */
export const ROLE_TO_POSITION: Record<string, string> = {
  school_admin: "admin",
  admin: "admin",
  teacher: "teacher",
  general_worker: "general_worker",
};

export class LeaveAccessForbiddenError extends Error {
  status = 403;
  code = "LEAVE_ACCESS_FORBIDDEN";
  constructor(message: string) {
    super(message);
    this.name = "LeaveAccessForbiddenError";
  }
}

export function isLeaveAccessForbiddenError(
  error: unknown
): error is LeaveAccessForbiddenError {
  return error instanceof LeaveAccessForbiddenError;
}

/**
 * Unified type guard for any leave-related forbidden error
 * (covers both LeaveAccessForbiddenError and TeacherLeaveAccessForbiddenError).
 */
export function isForbiddenLeaveError(
  error: unknown
): error is { message: string; status: number } {
  return isLeaveAccessForbiddenError(error) || isTeacherLeaveAccessForbiddenError(error);
}

/**
 * Resolve the user's role from the users table.
 */
async function resolveUserRole(userId: string): Promise<string> {
  return adminOperationSimple(async (client) => {
    const { data } = await client
      .from("users")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    return data?.role ?? "parent";
  });
}

/**
 * Unified leave access check that resolves the user role internally.
 * Returns the resolved role so callers don't need a separate query.
 *
 * - general_worker: always allowed (campus-based, no program scope)
 * - teacher: delegates to ensureTeacherHasCampusLeaveAccess
 * - parent / other: rejected with 403
 */
export async function assertStaffCanAccessLeave(
  userId: string,
  tenantId: string,
  userRole?: string
): Promise<string> {
  const role = userRole ?? await resolveUserRole(userId);

  if (role === "general_worker") {
    return role;
  }

  if (role === "teacher") {
    await adminOperationSimple(async (client) => {
      await ensureTeacherHasCampusLeaveAccess(client, userId, tenantId);
    });
    return role;
  }

  throw new LeaveAccessForbiddenError(
    "Leave management is only available for teachers and staff."
  );
}

/**
 * Resolve the staff position from user role, checking both users and user_profiles tables.
 * Prefers users.role (admin-controlled) over user_profiles.role (tenant-scoped).
 */
export async function resolveStaffPosition(
  client: SupabaseServiceClient,
  userId: string,
  tenantId: string
): Promise<string> {
  const { data: userRow } = await client
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const pos = ROLE_TO_POSITION[userRow?.role ?? ""];
  if (pos) return pos;

  const { data: profile } = await client
    .from("user_profiles")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return ROLE_TO_POSITION[profile?.role ?? ""] ?? "teacher";
}
