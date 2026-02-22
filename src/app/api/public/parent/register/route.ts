import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getRequestHost, isPublicSaasRegistrationHost } from "@/lib/hostResolution";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
import { getSupabaseAdminClient } from "@/lib/supabaseAdminClient";
import {
  enforcePublicRateLimit,
  hashForRateLimit,
  isValidEmail,
  isValidPassword,
  jsonError,
  normalizeEmail,
} from "@/lib/publicApi";

type ParentRegisterBody = {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  phone?: unknown;
};

function asTrimmedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function pickUuidScalar(data: unknown): string | null {
  if (typeof data === "string" && data.length > 0) return data;
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    if (typeof first === "string" && first.length > 0) return first;
    if (first && typeof first === "object") {
      const value = (first as Record<string, unknown>).find_auth_user_id_by_email;
      if (typeof value === "string" && value.length > 0) return value;
    }
  }
  if (data && typeof data === "object") {
    const value = (data as Record<string, unknown>).find_auth_user_id_by_email;
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function isAuthUserAlreadyExistsError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("already") &&
    (normalized.includes("registered") || normalized.includes("exists"))
  );
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const host = getRequestHost(request);
  if (isPublicSaasRegistrationHost(host)) {
    return jsonError(requestId, {
      error: "Parent self-signup is only available on tenant subdomains.",
      code: "TENANT_HOST_REQUIRED",
      status: 400,
    });
  }

  const ipRate = await enforcePublicRateLimit({
    request,
    keyPrefix: "public:parent-register:ip",
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

  const supabaseAdmin = getSupabaseAdminClient();
  const tenantId = await resolveTenantIdFromRequest(request, supabaseAdmin);
  if (!tenantId) {
    return jsonError(requestId, {
      error: "Tenant not found for this host.",
      code: "TENANT_NOT_FOUND",
      status: 404,
    });
  }

  let body: ParentRegisterBody;
  try {
    body = (await request.json()) as ParentRegisterBody;
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

  if (!name) {
    return jsonError(requestId, {
      error: "name is required.",
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }
  if (!isValidEmail(email)) {
    return jsonError(requestId, {
      error: "email is invalid.",
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }
  if (!isValidPassword(password)) {
    return jsonError(requestId, {
      error: "password must be between 8 and 128 characters.",
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }

  const identityRate = await enforceRateLimit({
    key: `public:parent-register:tenant:${tenantId}:${hashForRateLimit(email)}`,
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
    const { data: existingAuthData, error: existingAuthError } = await supabaseAdmin.rpc(
      "find_auth_user_id_by_email",
      {
        p_email: email,
      }
    );
    if (existingAuthError) {
      return jsonError(requestId, {
        error: "Unable to verify account state.",
        code: "ACCOUNT_LOOKUP_FAILED",
        status: 500,
      });
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
          return jsonError(requestId, {
            error: "Unable to create parent account.",
            code: "ACCOUNT_CREATE_FAILED",
            status: 500,
          });
        }
        const fallbackLookup = await supabaseAdmin.rpc("find_auth_user_id_by_email", {
          p_email: email,
        });
        userId = pickUuidScalar(fallbackLookup.data);
      } else {
        userId = createResult.data.user?.id ?? null;
        createdNewUser = true;
      }
    }

    if (!userId) {
      return jsonError(requestId, {
        error: "Unable to determine account identity.",
        code: "ACCOUNT_IDENTITY_MISSING",
        status: 500,
      });
    }

    const { data: existingProfile, error: profileLookupError } = await supabaseAdmin
      .from("user_profiles")
      .select("tenant_id, role")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileLookupError) {
      return jsonError(requestId, {
        error: "Unable to validate tenant membership.",
        code: "TENANT_MEMBERSHIP_LOOKUP_FAILED",
        status: 500,
      });
    }

    if (existingProfile?.tenant_id && existingProfile.tenant_id !== tenantId) {
      return jsonError(requestId, {
        error: "This account is already linked to another tenant.",
        code: "TENANT_MEMBERSHIP_CONFLICT",
        status: 409,
      });
    }

    if (existingProfile?.tenant_id === tenantId && existingProfile.role !== "parent") {
      return jsonError(requestId, {
        error: "This account already exists with a non-parent role.",
        code: "ROLE_CONFLICT",
        status: 409,
      });
    }

    const { error: userUpsertError } = await supabaseAdmin.from("users").upsert(
      {
        id: userId,
        name,
        email,
        role: "parent",
      },
      { onConflict: "id" }
    );
    if (userUpsertError) {
      return jsonError(requestId, {
        error: "Unable to finalize parent profile.",
        code: "PARENT_PROFILE_UPSERT_FAILED",
        status: 500,
      });
    }

    const { error: profileUpsertError } = await supabaseAdmin.from("user_profiles").upsert(
      {
        user_id: userId,
        tenant_id: tenantId,
        role: "parent",
        display_name: name,
        extra: phone ? { phone } : {},
      },
      { onConflict: "user_id" }
    );
    if (profileUpsertError) {
      return jsonError(requestId, {
        error: "Unable to finalize tenant parent profile.",
        code: "TENANT_PROFILE_UPSERT_FAILED",
        status: 500,
      });
    }

    const isIdempotent = !createdNewUser;
    return NextResponse.json(
      {
        ok: true,
        code: isIdempotent ? "PARENT_ALREADY_REGISTERED" : "PARENT_REGISTERED",
        request_id: requestId,
        tenant_id: tenantId,
        idempotent: isIdempotent,
      },
      { status: isIdempotent ? 200 : 201 }
    );
  } catch (error: unknown) {
    console.error("parent/register failed", { requestId, error });
    return jsonError(requestId, {
      error: "Internal server error.",
      code: "INTERNAL_ERROR",
      status: 500,
    });
  }
}

