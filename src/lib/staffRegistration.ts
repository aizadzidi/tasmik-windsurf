import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdminClient";
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

/**
 * Shared registration logic for invite-based staff onboarding.
 * Reads `target_role` from the invite to determine the role
 * (teacher or general_worker).
 */
export async function registerStaffWithInvite(
  params: RegisterStaffParams
): Promise<RegisterStaffResult> {
  const { name, email, password, phone, inviteCode, requestId } = params;

  const supabaseAdmin = getSupabaseAdminClient();

  // Validate invite code
  const { data: invite, error: inviteError } = await supabaseAdmin
    .from("tenant_invites")
    .select("id, tenant_id, max_uses, use_count, expires_at, is_active, target_role")
    .eq("code", inviteCode.toUpperCase())
    .maybeSingle();

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

    // Upsert user record with role from invite
    const { error: userUpsertError } = await supabaseAdmin.from("users").upsert(
      { id: userId, name, email, role: targetRole },
      { onConflict: "id" }
    );
    if (userUpsertError) {
      return { ok: false, error: "Unable to finalize staff profile.", code: "STAFF_PROFILE_UPSERT_FAILED", status: 500 };
    }

    // Insert tenant profile with role from invite
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
          return { ok: false, error: "This account is already linked to another school.", code: "TENANT_MEMBERSHIP_CONFLICT", status: 409 };
        }
        return { ok: false, error: "This account is already registered at this school.", code: "ALREADY_REGISTERED", status: 409 };
      }
      return { ok: false, error: "Unable to finalize tenant staff profile.", code: "TENANT_PROFILE_INSERT_FAILED", status: 500 };
    }

    // Atomically increment invite use_count
    const { data: incremented } = await supabaseAdmin.rpc("increment_invite_use_count", { invite_id: invite.id });
    if (incremented === false) {
      return { ok: false, error: "This invite is no longer available.", code: "INVITE_EXHAUSTED", status: 410 };
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
