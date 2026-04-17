import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdminClient";
import {
  formatSupabaseAuthDeleteError,
  isSupabaseAuthUserNotFoundError,
} from "@/lib/supabaseAuthAdmin";
import {
  getProgramTypesForTeacherInviteScope,
  isMissingTeacherInviteScopeSchemaError,
  normalizeTeacherInviteScope,
} from "@/lib/staffInvites";
import {
  hashForRateLimit,
  isAuthUserAlreadyExistsError,
  jsonError,
  pickUuidScalar,
} from "@/lib/publicApi";
import { enforceRateLimit } from "@/lib/rateLimit";

type StaffRole = "teacher" | "general_worker";

export type RegisterStaffParams = {
  name: string;
  email: string;
  password: string;
  phone: string | null;
  inviteCode: string;
  requestId: string;
};

export type RegisterStaffSuccess = {
  ok: true;
  code: "STAFF_REGISTERED" | "STAFF_ALREADY_REGISTERED";
  request_id: string;
  tenant_id: string;
  idempotent: boolean;
  target_role: StaffRole;
};

export type RegisterStaffError = {
  ok: false;
  error: string;
  code: string;
  status: number;
  extra?: Record<string, unknown>;
};

export type RegisterStaffResult = RegisterStaffSuccess | RegisterStaffError;

class StaffRegistrationFailure extends Error {
  code: string;
  status: number;
  extra?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    status: number,
    extra?: Record<string, unknown>
  ) {
    super(message);
    this.name = "StaffRegistrationFailure";
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

const toRegisterStaffError = (
  failure: StaffRegistrationFailure
): RegisterStaffError => ({
  ok: false,
  error: failure.message,
  code: failure.code,
  status: failure.status,
  extra: failure.extra,
});

const isStaffRegistrationFailure = (
  error: unknown
): error is StaffRegistrationFailure => error instanceof StaffRegistrationFailure;

async function resolveTeacherProgramIds(
  supabaseAdmin: ReturnType<typeof getSupabaseAdminClient>,
  tenantId: string,
  teacherScopeValue: unknown
) {
  const teacherScope = normalizeTeacherInviteScope(teacherScopeValue);
  if (!teacherScope) {
    throw new StaffRegistrationFailure(
      "This teacher invite is no longer valid. Please ask your admin for a new invite.",
      "TEACHER_SCOPE_REQUIRED",
      409
    );
  }

  const programTypes = getProgramTypesForTeacherInviteScope(teacherScope);
  const { data, error } = await supabaseAdmin
    .from("programs")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("type", programTypes);

  if (error) {
    throw new StaffRegistrationFailure(
      "Unable to prepare teacher access.",
      "TEACHER_ASSIGNMENT_LOOKUP_FAILED",
      500
    );
  }

  const programIds = (data ?? [])
    .map((row) => row.id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  if (programIds.length === 0) {
    throw new StaffRegistrationFailure(
      "This teacher invite cannot be used yet. Please ask your admin to set up the matching program first.",
      "TEACHER_SCOPE_NO_PROGRAMS",
      409
    );
  }

  return programIds;
}

async function loadInviteByCode(
  supabaseAdmin: ReturnType<typeof getSupabaseAdminClient>,
  inviteCode: string
) {
  const inviteWithScope = await supabaseAdmin
    .from("tenant_invites")
    .select("id, tenant_id, max_uses, use_count, expires_at, is_active, target_role, teacher_scope")
    .eq("code", inviteCode.toUpperCase())
    .maybeSingle();

  if (!inviteWithScope.error) {
    return { data: inviteWithScope.data, error: null };
  }

  if (!isMissingTeacherInviteScopeSchemaError(inviteWithScope.error)) {
    return { data: null, error: inviteWithScope.error };
  }

  const inviteWithoutScope = await supabaseAdmin
    .from("tenant_invites")
    .select("id, tenant_id, max_uses, use_count, expires_at, is_active, target_role")
    .eq("code", inviteCode.toUpperCase())
    .maybeSingle();

  if (inviteWithoutScope.error) {
    return { data: null, error: inviteWithoutScope.error };
  }

  return {
    data: inviteWithoutScope.data
      ? { ...inviteWithoutScope.data, teacher_scope: null }
      : null,
    error: null,
  };
}

async function cleanupFailedStaffRegistration(params: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdminClient>;
  userId: string;
  tenantId: string;
  createdNewUser: boolean;
  createdProfile: boolean;
  hadExistingUserRow: boolean;
}) {
  const { supabaseAdmin, userId, tenantId, createdNewUser, createdProfile, hadExistingUserRow } =
    params;

  try {
    const { error } = await supabaseAdmin
      .from("teacher_assignments")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("teacher_id", userId);
    if (error) throw error;
  } catch (cleanupError) {
    console.error("failed to cleanup teacher assignments after staff registration failure", {
      userId,
      tenantId,
      cleanupError,
    });
  }

  if (createdProfile) {
    try {
      const { error } = await supabaseAdmin
        .from("user_profiles")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("user_id", userId);
      if (error) throw error;
    } catch (cleanupError) {
      console.error("failed to cleanup user profile after staff registration failure", {
        userId,
        tenantId,
        cleanupError,
      });
    }
  }

  if (!hadExistingUserRow) {
    try {
      const { error } = await supabaseAdmin.from("users").delete().eq("id", userId);
      if (error) throw error;
    } catch (cleanupError) {
      console.error("failed to cleanup user row after staff registration failure", {
        userId,
        cleanupError,
      });
    }
  }

  if (!createdNewUser) return;

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId, true);
  if (error && !isSupabaseAuthUserNotFoundError(error)) {
    console.error("failed to cleanup auth user after staff registration failure", {
      userId,
      error: formatSupabaseAuthDeleteError(error),
    });
  }
}

/**
 * Shared registration logic for invite-based staff onboarding.
 * Reads `target_role` from the invite to determine the role and
 * creates the initial teacher assignments when needed.
 */
export async function registerStaffWithInvite(
  params: RegisterStaffParams
): Promise<RegisterStaffResult> {
  const { name, email, password, phone, inviteCode, requestId } = params;

  const supabaseAdmin = getSupabaseAdminClient();

  // Validate invite code
  const { data: invite, error: inviteError } = await loadInviteByCode(
    supabaseAdmin,
    inviteCode
  );

  if (inviteError || !invite) {
    return { ok: false, error: "Invalid invite code.", code: "INVALID_INVITE", status: 400 };
  }

  if (!invite.is_active) {
    return { ok: false, error: "This invite has been revoked.", code: "INVITE_REVOKED", status: 410 };
  }
  if (new Date(invite.expires_at) < new Date()) {
    return { ok: false, error: "This invite has expired.", code: "INVITE_EXPIRED", status: 410 };
  }
  if (invite.use_count >= invite.max_uses) {
    return { ok: false, error: "This invite has reached its usage limit.", code: "INVITE_EXHAUSTED", status: 410 };
  }

  const tenantId = invite.tenant_id;
  const targetRole: StaffRole = invite.target_role === "general_worker" ? "general_worker" : "teacher";
  if (targetRole === "general_worker" && invite.teacher_scope != null) {
    return {
      ok: false,
      error: "This invite is no longer valid. Please ask your admin for a new invite.",
      code: "INVITE_SCOPE_MISMATCH",
      status: 409,
    };
  }
  let teacherProgramIds: string[] = [];
  try {
    teacherProgramIds =
      targetRole === "teacher"
        ? await resolveTeacherProgramIds(supabaseAdmin, tenantId, invite.teacher_scope)
        : [];
  } catch (error: unknown) {
    if (isStaffRegistrationFailure(error)) {
      return toRegisterStaffError(error);
    }
    console.error("staff registration setup failed", { requestId, error });
    return { ok: false, error: "Internal server error.", code: "INTERNAL_ERROR", status: 500 };
  }

  // Per-identity rate limit scoped to tenant (after invite validation so we have tenantId)
  const identityRate = await enforceRateLimit({
    key: `public:staff-register:tenant:${tenantId}:${hashForRateLimit(email)}`,
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });
  if (!identityRate.allowed) {
    return {
      ok: false,
      error: "Too many duplicate signup attempts. Please retry later.",
      code: "RATE_LIMITED",
      status: 429,
      extra: { retry_after_seconds: identityRate.retryAfterSeconds },
    };
  }

  try {
    // Check if auth user exists
    const { data: existingAuthData, error: existingAuthError } = await supabaseAdmin.rpc(
      "find_auth_user_id_by_email",
      { p_email: email }
    );
    if (existingAuthError) {
      return { ok: false, error: "Unable to verify account state.", code: "ACCOUNT_LOOKUP_FAILED", status: 500 };
    }

    let userId = pickUuidScalar(existingAuthData);
    let createdNewUser = false;

    if (!userId) {
      const createResult = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });
      if (createResult.error) {
        if (!isAuthUserAlreadyExistsError(createResult.error.message ?? "")) {
          return { ok: false, error: "Unable to create staff account.", code: "ACCOUNT_CREATE_FAILED", status: 500 };
        }
        const fallbackLookup = await supabaseAdmin.rpc("find_auth_user_id_by_email", { p_email: email });
        userId = pickUuidScalar(fallbackLookup.data);
      } else {
        userId = createResult.data.user?.id ?? null;
        createdNewUser = true;
      }
    }

    if (!userId) {
      return { ok: false, error: "Unable to determine account identity.", code: "ACCOUNT_IDENTITY_MISSING", status: 500 };
    }

    // Check existing profile
    const { data: existingProfile, error: profileLookupError } = await supabaseAdmin
      .from("user_profiles")
      .select("tenant_id, role")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileLookupError) {
      return { ok: false, error: "Unable to validate tenant membership.", code: "TENANT_MEMBERSHIP_LOOKUP_FAILED", status: 500 };
    }

    if (existingProfile?.tenant_id && existingProfile.tenant_id !== tenantId) {
      return { ok: false, error: "This account is already linked to another school.", code: "TENANT_MEMBERSHIP_CONFLICT", status: 409 };
    }

    if (existingProfile?.tenant_id === tenantId) {
      return { ok: false, error: "This account is already registered at this school.", code: "ALREADY_REGISTERED", status: 409 };
    }

    const { data: existingUserRow, error: existingUserLookupError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (existingUserLookupError) {
      return {
        ok: false,
        error: "Unable to finalize staff profile.",
        code: "STAFF_PROFILE_LOOKUP_FAILED",
        status: 500,
      };
    }

    const hadExistingUserRow = Boolean(existingUserRow?.id);
    let createdProfile = false;

    try {
      const { error: userUpsertError } = await supabaseAdmin.from("users").upsert(
        { id: userId, name, email, role: targetRole },
        { onConflict: "id" }
      );
      if (userUpsertError) {
        throw new StaffRegistrationFailure(
          "Unable to finalize staff profile.",
          "STAFF_PROFILE_UPSERT_FAILED",
          500
        );
      }

      const { error: profileInsertError } = await supabaseAdmin
        .from("user_profiles")
        .insert({
          user_id: userId,
          tenant_id: tenantId,
          role: targetRole,
          display_name: name,
          extra: phone ? { phone } : {},
        });
      if (profileInsertError) {
        const isConflict =
          profileInsertError.code === "23505" ||
          profileInsertError.message?.includes("duplicate");
        if (isConflict) {
          const { data: recheck } = await supabaseAdmin
            .from("user_profiles")
            .select("tenant_id")
            .eq("user_id", userId)
            .maybeSingle();
          if (recheck?.tenant_id && recheck.tenant_id !== tenantId) {
            return {
              ok: false,
              error: "This account is already linked to another school.",
              code: "TENANT_MEMBERSHIP_CONFLICT",
              status: 409,
            };
          }
          return {
            ok: false,
            error: "This account is already registered at this school.",
            code: "ALREADY_REGISTERED",
            status: 409,
          };
        }
        throw new StaffRegistrationFailure(
          "Unable to finalize tenant staff profile.",
          "TENANT_PROFILE_INSERT_FAILED",
          500
        );
      }
      createdProfile = true;

      if (targetRole === "teacher") {
        const { error: assignmentInsertError } = await supabaseAdmin
          .from("teacher_assignments")
          .upsert(
            teacherProgramIds.map((programId) => ({
              tenant_id: tenantId,
              teacher_id: userId,
              program_id: programId,
              role: "teacher",
            })),
            { onConflict: "teacher_id,program_id,tenant_id" }
          );
        if (assignmentInsertError) {
          throw new StaffRegistrationFailure(
            "Unable to complete teacher setup.",
            "TEACHER_ASSIGNMENTS_INSERT_FAILED",
            500
          );
        }
      }

      const { data: incremented } = await supabaseAdmin.rpc("increment_invite_use_count", {
        invite_id: invite.id,
      });
      if (incremented === false) {
        throw new StaffRegistrationFailure(
          "This invite is no longer available.",
          "INVITE_EXHAUSTED",
          410
        );
      }
    } catch (error: unknown) {
      if (isStaffRegistrationFailure(error)) {
        await cleanupFailedStaffRegistration({
          supabaseAdmin,
          userId,
          tenantId,
          createdNewUser,
          createdProfile,
          hadExistingUserRow,
        });
        return toRegisterStaffError(error);
      }

      await cleanupFailedStaffRegistration({
        supabaseAdmin,
        userId,
        tenantId,
        createdNewUser,
        createdProfile,
        hadExistingUserRow,
      });
      throw error;
    }

    return {
      ok: true,
      code: createdNewUser ? "STAFF_REGISTERED" : "STAFF_ALREADY_REGISTERED",
      request_id: requestId,
      tenant_id: tenantId,
      idempotent: !createdNewUser,
      target_role: targetRole,
    };
  } catch (error: unknown) {
    console.error("staff registration failed", { requestId, error });
    return { ok: false, error: "Internal server error.", code: "INTERNAL_ERROR", status: 500 };
  }
}

/**
 * Helper to convert a RegisterStaffResult into a NextResponse
 * using the same jsonError format as existing public APIs.
 */
export function staffResultToResponse(requestId: string, result: RegisterStaffResult) {
  if (result.ok) {
    return NextResponse.json(result, { status: result.code === "STAFF_REGISTERED" ? 201 : 200 });
  }
  return jsonError(requestId, {
    error: result.error,
    code: result.code,
    status: result.status,
    extra: result.extra,
  });
}
