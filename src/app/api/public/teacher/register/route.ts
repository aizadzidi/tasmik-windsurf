import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdminClient";
import {
  asTrimmedText,
  enforcePublicRateLimit,
  hashForRateLimit,
  isAuthUserAlreadyExistsError,
  isValidEmail,
  isValidPassword,
  jsonError,
  normalizeEmail,
  pickUuidScalar,
} from "@/lib/publicApi";
import { enforceRateLimit } from "@/lib/rateLimit";

type TeacherRegisterBody = {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  phone?: unknown;
  invite_code?: unknown;
};

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

  // Rate limit by IP
  const ipRate = await enforcePublicRateLimit({
    request,
    keyPrefix: "public:teacher-register:ip",
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!ipRate.result.allowed) {
    return jsonError(requestId, {
      error: "Too many signup attempts. Please retry later.",
      code: "RATE_LIMITED",
      status: 429,
      extra: { retry_after_seconds: ipRate.result.retryAfterSeconds },
    });
  }

  let body: TeacherRegisterBody;
  try {
    body = (await request.json()) as TeacherRegisterBody;
  } catch {
    return jsonError(requestId, {
      error: "Invalid JSON body.",
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }

  const name = asTrimmedText(body.name, 120);
  const email = normalizeEmail(typeof body.email === "string" ? body.email : "");
  const password = typeof body.password === "string" ? body.password : "";
  const phone = asTrimmedText(body.phone, 32);
  const inviteCode = asTrimmedText(body.invite_code, 32);

  if (!name) {
    return jsonError(requestId, { error: "Name is required.", code: "VALIDATION_ERROR", status: 400 });
  }
  if (!isValidEmail(email)) {
    return jsonError(requestId, { error: "Email is invalid.", code: "VALIDATION_ERROR", status: 400 });
  }
  if (!isValidPassword(password)) {
    return jsonError(requestId, { error: "Password must be between 8 and 128 characters.", code: "VALIDATION_ERROR", status: 400 });
  }
  if (!inviteCode) {
    return jsonError(requestId, { error: "Invite code is required.", code: "VALIDATION_ERROR", status: 400 });
  }

  const supabaseAdmin = getSupabaseAdminClient();

  // Validate invite code
  const { data: invite, error: inviteError } = await supabaseAdmin
    .from("tenant_invites")
    .select("id, tenant_id, max_uses, use_count, expires_at, is_active")
    .eq("code", inviteCode.toUpperCase())
    .maybeSingle();

  if (inviteError || !invite) {
    return jsonError(requestId, { error: "Invalid invite code.", code: "INVALID_INVITE", status: 400 });
  }

  if (!invite.is_active) {
    return jsonError(requestId, { error: "This invite has been revoked.", code: "INVITE_REVOKED", status: 410 });
  }
  if (new Date(invite.expires_at) < new Date()) {
    return jsonError(requestId, { error: "This invite has expired.", code: "INVITE_EXPIRED", status: 410 });
  }
  if (invite.use_count >= invite.max_uses) {
    return jsonError(requestId, { error: "This invite has reached its usage limit.", code: "INVITE_EXHAUSTED", status: 410 });
  }

  const tenantId = invite.tenant_id;

  // Per-identity rate limit
  const identityRate = await enforceRateLimit({
    key: `public:teacher-register:tenant:${tenantId}:${hashForRateLimit(email)}`,
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });
  if (!identityRate.allowed) {
    return jsonError(requestId, {
      error: "Too many duplicate signup attempts. Please retry later.",
      code: "RATE_LIMITED",
      status: 429,
      extra: { retry_after_seconds: identityRate.retryAfterSeconds },
    });
  }

  try {
    // Check if auth user exists
    const { data: existingAuthData, error: existingAuthError } = await supabaseAdmin.rpc(
      "find_auth_user_id_by_email",
      { p_email: email }
    );
    if (existingAuthError) {
      return jsonError(requestId, { error: "Unable to verify account state.", code: "ACCOUNT_LOOKUP_FAILED", status: 500 });
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
          return jsonError(requestId, { error: "Unable to create teacher account.", code: "ACCOUNT_CREATE_FAILED", status: 500 });
        }
        const fallbackLookup = await supabaseAdmin.rpc("find_auth_user_id_by_email", { p_email: email });
        userId = pickUuidScalar(fallbackLookup.data);
      } else {
        userId = createResult.data.user?.id ?? null;
        createdNewUser = true;
      }
    }

    if (!userId) {
      return jsonError(requestId, { error: "Unable to determine account identity.", code: "ACCOUNT_IDENTITY_MISSING", status: 500 });
    }

    // Check existing profile
    const { data: existingProfile, error: profileLookupError } = await supabaseAdmin
      .from("user_profiles")
      .select("tenant_id, role")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileLookupError) {
      return jsonError(requestId, { error: "Unable to validate tenant membership.", code: "TENANT_MEMBERSHIP_LOOKUP_FAILED", status: 500 });
    }

    if (existingProfile?.tenant_id && existingProfile.tenant_id !== tenantId) {
      return jsonError(requestId, { error: "This account is already linked to another school.", code: "TENANT_MEMBERSHIP_CONFLICT", status: 409 });
    }

    if (existingProfile?.tenant_id === tenantId) {
      return jsonError(requestId, { error: "This account is already registered at this school.", code: "ALREADY_REGISTERED", status: 409 });
    }

    // Upsert user record
    const { error: userUpsertError } = await supabaseAdmin.from("users").upsert(
      { id: userId, name, email, role: "teacher" },
      { onConflict: "id" }
    );
    if (userUpsertError) {
      return jsonError(requestId, { error: "Unable to finalize teacher profile.", code: "TEACHER_PROFILE_UPSERT_FAILED", status: 500 });
    }

    // Insert tenant profile (not upsert — avoids cross-tenant race)
    const { error: profileInsertError } = await supabaseAdmin
      .from("user_profiles")
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        role: "teacher",
        display_name: name,
        extra: phone ? { phone } : {},
      });
    if (profileInsertError) {
      // If a concurrent request already inserted a profile, check if it's ours
      const isConflict =
        profileInsertError.code === "23505" ||
        profileInsertError.message?.includes("duplicate");
      if (isConflict) {
        // Re-check which tenant owns the profile now
        const { data: recheck } = await supabaseAdmin
          .from("user_profiles")
          .select("tenant_id")
          .eq("user_id", userId)
          .maybeSingle();
        if (recheck?.tenant_id && recheck.tenant_id !== tenantId) {
          return jsonError(requestId, { error: "This account is already linked to another school.", code: "TENANT_MEMBERSHIP_CONFLICT", status: 409 });
        }
        return jsonError(requestId, { error: "This account is already registered at this school.", code: "ALREADY_REGISTERED", status: 409 });
      }
      return jsonError(requestId, { error: "Unable to finalize tenant teacher profile.", code: "TENANT_PROFILE_INSERT_FAILED", status: 500 });
    }

    // Atomically increment invite use_count (with capacity check)
    const { data: incremented } = await supabaseAdmin.rpc("increment_invite_use_count", { invite_id: invite.id });
    if (incremented === false) {
      return jsonError(requestId, { error: "This invite is no longer available.", code: "INVITE_EXHAUSTED", status: 410 });
    }

    return NextResponse.json(
      {
        ok: true,
        code: createdNewUser ? "TEACHER_REGISTERED" : "TEACHER_ALREADY_REGISTERED",
        request_id: requestId,
        tenant_id: tenantId,
        idempotent: !createdNewUser,
      },
      { status: createdNewUser ? 201 : 200 }
    );
  } catch (error: unknown) {
    console.error("teacher/register failed", { requestId, error });
    return jsonError(requestId, { error: "Internal server error.", code: "INTERNAL_ERROR", status: 500 });
  }
}
