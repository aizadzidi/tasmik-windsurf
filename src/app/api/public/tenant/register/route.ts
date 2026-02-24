import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getRequestHost, getTenantSubdomainBaseDomain } from "@/lib/hostResolution";
import { getSupabaseAdminClient } from "@/lib/supabaseAdminClient";
import {
  assertPublicRegistrationHost,
  buildIdempotencyKey,
  enforcePublicRateLimit,
  hashForRateLimit,
  isReservedTenantSlug,
  isValidEmail,
  isValidPassword,
  isValidSlug,
  jsonError,
  normalizeEmail,
  normalizeSlug,
} from "@/lib/publicApi";
import {
  resolveTenantPlanCode,
  TENANT_PLAN_CATALOG,
} from "@/lib/tenantPlans";

type TenantRegisterBody = {
  schoolName?: unknown;
  schoolSlug?: unknown;
  country?: unknown;
  timezone?: unknown;
  studentCount?: unknown;
  adminName?: unknown;
  adminEmail?: unknown;
  adminPhone?: unknown;
  adminPassword?: unknown;
  billingCycle?: unknown;
  plan?: unknown;
  billingEmail?: unknown;
  affiliateCode?: unknown;
  paymentProvider?: unknown;
};

const MAX_STUDENT_ESTIMATE = 200000;
const AFFILIATE_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function asOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function parseStudentEstimate(value: unknown): { value: number | null; error: string | null } {
  if (value === null || value === undefined || value === "") {
    return { value: null, error: null };
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return { value: null, error: "studentCount must be a valid number." };
  }
  const normalized = Math.trunc(parsed);
  if (normalized < 0 || normalized > MAX_STUDENT_ESTIMATE) {
    return {
      value: null,
      error: `studentCount must be between 0 and ${MAX_STUDENT_ESTIMATE}.`,
    };
  }
  return { value: normalized, error: null };
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

function isSchemaOutdatedError(params: {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}): boolean {
  const code = (params.code ?? "").toUpperCase();
  if (code === "42P01" || code === "42703" || code === "42883" || code === "42702") return true;

  const haystack = `${params.message ?? ""} ${params.details ?? ""}`.toLowerCase();
  return (
    haystack.includes('column reference "tenant_id" is ambiguous') ||
    (haystack.includes("does not exist") &&
      (haystack.includes("tenant_plan_catalog") ||
        haystack.includes("tenant_signup_requests") ||
        haystack.includes("bootstrap_tenant_self_serve") ||
        haystack.includes("check_tenant_plan_limit"))) ||
    haystack.includes("undefined table") ||
    haystack.includes("undefined column") ||
    haystack.includes("undefined function")
  );
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const host = getRequestHost(request);

  if (!assertPublicRegistrationHost(host)) {
    return jsonError(requestId, {
      error: "Tenant registration is only available on the SaaS onboarding host.",
      code: "HOST_NOT_ALLOWED",
      status: 403,
    });
  }

  const ipRate = await enforcePublicRateLimit({
    request,
    keyPrefix: "public:tenant-register:ip",
    limit: 6,
    windowMs: 10 * 60 * 1000,
  });
  if (!ipRate.result.allowed) {
    return jsonError(requestId, {
      error: "Too many registration attempts. Please retry later.",
      code: "RATE_LIMITED",
      status: 429,
      extra: { retry_after_seconds: ipRate.result.retryAfterSeconds },
    });
  }

  let body: TenantRegisterBody;
  try {
    body = (await request.json()) as TenantRegisterBody;
  } catch {
    return jsonError(requestId, {
      error: "Invalid JSON body.",
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }

  const schoolName = asOptionalText(body.schoolName, 120);
  const schoolSlug = normalizeSlug(typeof body.schoolSlug === "string" ? body.schoolSlug : "");
  const adminName = asOptionalText(body.adminName, 120);
  const adminEmail = normalizeEmail(typeof body.adminEmail === "string" ? body.adminEmail : "");
  const adminPassword = typeof body.adminPassword === "string" ? body.adminPassword : "";
  const billingCycle = body.billingCycle === "annual" ? "annual" : "monthly";
  const paymentProvider = asOptionalText(body.paymentProvider, 32)?.toLowerCase() ?? "billplz";
  const plan = resolveTenantPlanCode(body.plan);
  const country = asOptionalText(body.country, 80);
  const timezone = asOptionalText(body.timezone, 80);
  const adminPhone = asOptionalText(body.adminPhone, 32);
  const billingEmailInput = typeof body.billingEmail === "string" ? body.billingEmail.trim() : "";
  const billingEmail = billingEmailInput ? normalizeEmail(billingEmailInput) : null;
  const affiliateCodeInput =
    typeof body.affiliateCode === "string" ? body.affiliateCode.trim() : "";
  const affiliateCode = affiliateCodeInput ? affiliateCodeInput : null;
  const studentEstimate = parseStudentEstimate(body.studentCount);
  const studentCount = studentEstimate.value;
  const userAgent = asOptionalText(request.headers.get("user-agent"), 512);

  if (!schoolName) {
    return jsonError(requestId, {
      error: "schoolName is required.",
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }
  if (!isValidSlug(schoolSlug)) {
    return jsonError(requestId, {
      error: "schoolSlug must be 3-63 chars, lowercase letters, numbers, and hyphens only.",
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }
  if (isReservedTenantSlug(schoolSlug)) {
    return jsonError(requestId, {
      error: "schoolSlug is reserved and cannot be used.",
      code: "SLUG_RESERVED",
      status: 400,
    });
  }
  if (!adminName) {
    return jsonError(requestId, {
      error: "adminName is required.",
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }
  if (!isValidEmail(adminEmail)) {
    return jsonError(requestId, {
      error: "adminEmail is invalid.",
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }
  if (!isValidPassword(adminPassword)) {
    return jsonError(requestId, {
      error: "adminPassword must be between 8 and 128 characters.",
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }
  if (!plan) {
    return jsonError(requestId, {
      error: "plan is invalid. Allowed values: starter, growth, enterprise.",
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }
  if (billingEmailInput.length > 254) {
    return jsonError(requestId, {
      error: "billingEmail must be at most 254 characters.",
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }
  if (billingEmail && !isValidEmail(billingEmail)) {
    return jsonError(requestId, {
      error: "billingEmail is invalid.",
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }
  if (affiliateCode && !AFFILIATE_CODE_PATTERN.test(affiliateCode)) {
    return jsonError(requestId, {
      error: "affiliateCode must be 1-64 chars and use letters, numbers, '_' or '-'.",
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }
  if (studentEstimate.error) {
    return jsonError(requestId, {
      error: studentEstimate.error,
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }
  if (paymentProvider !== "billplz") {
    return jsonError(requestId, {
      error: "Only Billplz is supported for this registration flow.",
      code: "UNSUPPORTED_PAYMENT_PROVIDER",
      status: 400,
    });
  }

  const combinedLimitKey = hashForRateLimit(`${schoolSlug}:${adminEmail}`);
  const combinedRate = await enforceRateLimit({
    key: `public:tenant-register:identity:${combinedLimitKey}`,
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });
  if (!combinedRate.allowed) {
    return jsonError(requestId, {
      error: "Too many duplicate registration attempts. Please retry later.",
      code: "RATE_LIMITED",
      status: 429,
      extra: { retry_after_seconds: combinedRate.retryAfterSeconds },
    });
  }

  const tenantBaseDomain = getTenantSubdomainBaseDomain();
  const primaryDomain = `${schoolSlug}.${tenantBaseDomain}`;
  const idempotencyKey = buildIdempotencyKey(`${schoolSlug}:${adminEmail}`);

  const supabaseAdmin = getSupabaseAdminClient();

  const existingAuthLookup = await supabaseAdmin.rpc("find_auth_user_id_by_email", {
    p_email: adminEmail,
  });
  if (existingAuthLookup.error) {
    return jsonError(requestId, {
      error: "Unable to verify admin account state.",
      code: "ADMIN_ACCOUNT_LOOKUP_FAILED",
      status: 500,
    });
  }
  let adminUserId = pickUuidScalar(existingAuthLookup.data);
  if (adminUserId) {
    const existingProfile = await supabaseAdmin
      .from("user_profiles")
      .select("tenant_id")
      .eq("user_id", adminUserId)
      .maybeSingle();
    if (existingProfile.error) {
      return jsonError(requestId, {
        error: "Unable to validate admin membership.",
        code: "ADMIN_MEMBERSHIP_LOOKUP_FAILED",
        status: 500,
      });
    }
    if (existingProfile.data?.tenant_id) {
      const { data: tenantRow, error: tenantError } = await supabaseAdmin
        .from("tenants")
        .select("slug")
        .eq("id", existingProfile.data.tenant_id)
        .maybeSingle();
      if (tenantError) {
        return jsonError(requestId, {
          error: "Unable to validate tenant ownership.",
          code: "TENANT_LOOKUP_FAILED",
          status: 500,
        });
      }
      if (tenantRow?.slug && tenantRow.slug !== schoolSlug) {
        return jsonError(requestId, {
          error: "This admin account is already linked to another tenant.",
          code: "TENANT_MEMBERSHIP_CONFLICT",
          status: 409,
        });
      }
    }
  }

  try {
    const { data: bootstrapData, error: bootstrapError } = await supabaseAdmin.rpc(
      "bootstrap_tenant_self_serve",
      {
        p_school_name: schoolName,
        p_tenant_slug: schoolSlug,
        p_primary_domain: primaryDomain,
        p_admin_email: adminEmail,
        p_admin_name: adminName,
        p_admin_phone: adminPhone,
        p_country: country,
        p_timezone: timezone,
        p_plan_code: plan,
        p_billing_cycle: billingCycle,
        p_payment_provider: "billplz",
        p_idempotency_key: idempotencyKey,
      }
    );

    if (bootstrapError) {
      console.error("tenant/register bootstrap rpc failed", {
        requestId,
        code: bootstrapError.code,
        message: bootstrapError.message,
        details: bootstrapError.details,
        hint: bootstrapError.hint,
      });
      if (
        isSchemaOutdatedError({
          code: bootstrapError.code,
          message: bootstrapError.message,
          details: bootstrapError.details,
        })
      ) {
        return jsonError(requestId, {
          error:
            "Registration backend schema is outdated. Apply the latest tenant registration migrations.",
          code: "REGISTRATION_SCHEMA_OUTDATED",
          status: 503,
        });
      }
      const normalized = (bootstrapError.message ?? "").toLowerCase();
      if (normalized.includes("reserved tenant slug")) {
        return jsonError(requestId, {
          error: "This school slug is reserved.",
          code: "SLUG_RESERVED",
          status: 400,
        });
      }
      if (normalized.includes("invalid plan code")) {
        return jsonError(requestId, {
          error: "The selected plan is invalid.",
          code: "INVALID_PLAN",
          status: 400,
        });
      }
      if (
        normalized.includes("tenant slug already assigned") ||
        normalized.includes("domain already assigned") ||
        normalized.includes("idempotency key replay mismatch") ||
        normalized.includes("duplicate")
      ) {
        return jsonError(requestId, {
          error: "This school slug is unavailable.",
          code: "SLUG_UNAVAILABLE",
          status: 409,
        });
      }
      return jsonError(requestId, {
        error: "Unable to provision tenant at this time.",
        code: "TENANT_BOOTSTRAP_FAILED",
        status: 500,
      });
    }

    const bootstrapRow =
      Array.isArray(bootstrapData) && bootstrapData.length > 0
        ? (bootstrapData[0] as Record<string, unknown>)
        : (bootstrapData as Record<string, unknown> | null);
    const tenantId = typeof bootstrapRow?.tenant_id === "string" ? bootstrapRow.tenant_id : null;
    const signupRequestId =
      typeof bootstrapRow?.signup_request_id === "string" ? bootstrapRow.signup_request_id : null;
    const createdNew = bootstrapRow?.created_new === true;
    if (!tenantId || !signupRequestId) {
      return jsonError(requestId, {
        error: "Tenant bootstrap returned an invalid payload.",
        code: "TENANT_BOOTSTRAP_INVALID",
        status: 500,
      });
    }

    if (!adminUserId) {
      const createResult = await supabaseAdmin.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          name: adminName,
        },
      });
      if (createResult.error) {
        if (!isAuthUserAlreadyExistsError(createResult.error.message ?? "")) {
          return jsonError(requestId, {
            error: "Unable to create admin account.",
            code: "ADMIN_ACCOUNT_CREATE_FAILED",
            status: 500,
          });
        }

        const fallbackLookup = await supabaseAdmin.rpc("find_auth_user_id_by_email", {
          p_email: adminEmail,
        });
        adminUserId = pickUuidScalar(fallbackLookup.data);
      } else {
        adminUserId = createResult.data.user?.id ?? null;
      }
    }

    if (!adminUserId) {
      return jsonError(requestId, {
        error: "Unable to determine admin account.",
        code: "ADMIN_ACCOUNT_MISSING",
        status: 500,
      });
    }

    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from("user_profiles")
      .select("tenant_id")
      .eq("user_id", adminUserId)
      .maybeSingle();
    if (existingProfileError) {
      return jsonError(requestId, {
        error: "Unable to validate tenant membership.",
        code: "TENANT_MEMBERSHIP_LOOKUP_FAILED",
        status: 500,
      });
    }
    if (existingProfile?.tenant_id && existingProfile.tenant_id !== tenantId) {
      return jsonError(requestId, {
        error: "This admin account is already linked to another tenant.",
        code: "TENANT_MEMBERSHIP_CONFLICT",
        status: 409,
      });
    }

    const { error: userUpsertError } = await supabaseAdmin.from("users").upsert(
      {
        id: adminUserId,
        name: adminName,
        email: adminEmail,
        role: "admin",
      },
      { onConflict: "id" }
    );
    if (userUpsertError) {
      return jsonError(requestId, {
        error: "Unable to finalize admin profile.",
        code: "ADMIN_PROFILE_UPSERT_FAILED",
        status: 500,
      });
    }

    const { error: profileUpsertError } = await supabaseAdmin.from("user_profiles").upsert(
      {
        user_id: adminUserId,
        tenant_id: tenantId,
        role: "school_admin",
        display_name: adminName,
      },
      { onConflict: "user_id" }
    );
    if (profileUpsertError) {
      return jsonError(requestId, {
        error: "Unable to finalize tenant admin profile.",
        code: "TENANT_PROFILE_UPSERT_FAILED",
        status: 500,
      });
    }

    const { error: signupUpdateError } = await supabaseAdmin
      .from("tenant_signup_requests")
      .update({
        admin_user_id: adminUserId,
        billing_email_normalized: billingEmail,
        affiliate_code: affiliateCode,
        estimated_students: studentCount,
        request_host: host,
        request_user_agent: userAgent,
        updated_at: new Date().toISOString(),
      })
      .eq("id", signupRequestId);
    if (signupUpdateError) {
      if (
        isSchemaOutdatedError({
          code: signupUpdateError.code,
          message: signupUpdateError.message,
          details: signupUpdateError.details,
        })
      ) {
        return jsonError(requestId, {
          error:
            "Registration backend schema is outdated. Apply the latest tenant registration migrations.",
          code: "REGISTRATION_SCHEMA_OUTDATED",
          status: 503,
        });
      }
      return jsonError(requestId, {
        error: "Unable to persist onboarding audit data.",
        code: "TENANT_SIGNUP_AUDIT_UPDATE_FAILED",
        status: 500,
      });
    }

    const status = createdNew ? 201 : 200;
    return NextResponse.json(
      {
        ok: true,
        code: createdNew ? "TENANT_REGISTERED" : "TENANT_ALREADY_REGISTERED",
        request_id: requestId,
        tenant: {
          id: tenantId,
          slug: schoolSlug,
          domain: primaryDomain,
        },
        trial: {
          status: "trial_pending",
          starts_at: null,
          ends_at: null,
          days: TENANT_PLAN_CATALOG[plan].trialDays,
          starts_on: "first_admin_login",
        },
        subscription: {
          payment_provider: "billplz",
          plan,
          billing_cycle: billingCycle,
        },
        onboarding: {
          country,
          timezone,
          student_count: studentCount,
          billing_email: billingEmail,
          affiliate_code: affiliateCode,
        },
        idempotent: !createdNew,
      },
      { status }
    );
  } catch (error: unknown) {
    console.error("tenant/register failed", { requestId, error });
    return jsonError(requestId, {
      error: "Internal server error.",
      code: "INTERNAL_ERROR",
      status: 500,
    });
  }
}
