import { NextRequest, NextResponse } from "next/server";
import {
  getRequestHost,
  isLocalDevelopmentHost,
  isPublicSaasRegistrationHost,
} from "@/lib/hostResolution";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
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
import { hashStudentClaimToken } from "@/lib/studentClaims";

type StudentRegisterBody = {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  phone?: unknown;
  claim_token?: unknown;
};

type ClaimLookupRow = {
  student_id: string;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
  students:
    | {
        id: string;
        name: string | null;
        record_type: string | null;
        account_owner_user_id: string | null;
      }
    | Array<{
        id: string;
        name: string | null;
        record_type: string | null;
        account_owner_user_id: string | null;
      }>
    | null;
};

type ValidatedClaim = {
  student_id: string;
  student_name: string | null;
};

type ExistingUserRow = {
  id: string;
  role: string | null;
};

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const host = getRequestHost(request);
  const isLocalHost = isLocalDevelopmentHost(host);

  const ipRate = await enforcePublicRateLimit({
    request,
    keyPrefix: "public:student-register:ip",
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

  let body: StudentRegisterBody;
  try {
    body = (await request.json()) as StudentRegisterBody;
  } catch {
    return jsonError(requestId, {
      error: "Invalid JSON body.",
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }

  const submittedName = asTrimmedText(body.name, 120);
  const email = normalizeEmail(typeof body.email === "string" ? body.email : "");
  const password = typeof body.password === "string" ? body.password : "";
  const phone = asTrimmedText(body.phone, 32);
  const claimToken = asTrimmedText(body.claim_token, 255);
  const claimTokenHash = claimToken ? hashStudentClaimToken(claimToken) : null;

  if (isPublicSaasRegistrationHost(host) && !(isLocalHost && claimToken)) {
    return jsonError(requestId, {
      error: "Student self-signup is only available on tenant subdomains.",
      code: "TENANT_HOST_REQUIRED",
      status: 400,
    });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  let tenantId = await resolveTenantIdFromRequest(request, supabaseAdmin);
  if (!tenantId && isLocalHost && claimToken) {
    const claimTenantRes = await supabaseAdmin
      .from("online_student_claim_tokens")
      .select("tenant_id")
      .eq("token_hash", hashStudentClaimToken(claimToken))
      .maybeSingle<{ tenant_id: string }>();
    if (!claimTenantRes.error) {
      tenantId = claimTenantRes.data?.tenant_id ?? null;
    }
  }
  if (!tenantId) {
    return jsonError(requestId, {
      error: "Tenant not found for this host.",
      code: "TENANT_NOT_FOUND",
      status: 404,
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

  let validatedClaim: ValidatedClaim | null = null;
  if (claimTokenHash) {
    const claimRes = await supabaseAdmin
      .from("online_student_claim_tokens")
      .select("student_id, expires_at, consumed_at, revoked_at, students(id, name, record_type, account_owner_user_id)")
      .eq("tenant_id", tenantId)
      .eq("token_hash", claimTokenHash)
      .maybeSingle<ClaimLookupRow>();
    if (claimRes.error) {
      return jsonError(requestId, {
        error: "Unable to validate claim link.",
        code: "CLAIM_LOOKUP_FAILED",
        status: 500,
      });
    }

    const claim = claimRes.data;
    const student = Array.isArray(claim?.students) ? claim.students[0] : claim?.students;
    const isExpired = claim?.expires_at ? new Date(claim.expires_at).getTime() <= Date.now() : true;
    const isUnavailable =
      !claim?.student_id ||
      !student?.id ||
      student.record_type === "prospect" ||
      Boolean(student.account_owner_user_id) ||
      Boolean(claim.consumed_at) ||
      Boolean(claim.revoked_at) ||
      isExpired;

    if (isUnavailable) {
      return jsonError(requestId, {
        error: "Claim link is no longer available.",
        code: "CLAIM_NOT_AVAILABLE",
        status: 404,
      });
    }

    validatedClaim = {
      student_id: student.id,
      student_name: asTrimmedText(student.name, 120),
    };
  }

  const resolvedName = validatedClaim?.student_name ?? submittedName;
  if (!resolvedName) {
    return jsonError(requestId, {
      error: "name is required.",
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }

  const identityRate = await enforceRateLimit({
    key: `public:student-register:tenant:${tenantId}:${hashForRateLimit(email)}`,
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
      { p_email: email }
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
        user_metadata: { name: resolvedName },
      });
      if (createResult.error) {
        if (!isAuthUserAlreadyExistsError(createResult.error.message ?? "")) {
          return jsonError(requestId, {
            error: "Unable to create student account.",
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

    const [existingProfileRes, existingOwnedStudentRes, existingUserRes] = await Promise.all([
      supabaseAdmin
        .from("user_profiles")
        .select("tenant_id, role")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("students")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("account_owner_user_id", userId)
        .neq("record_type", "prospect")
        .maybeSingle(),
      supabaseAdmin.from("users").select("id, role").eq("id", userId).maybeSingle<ExistingUserRow>(),
    ]);

    if (existingProfileRes.error) {
      return jsonError(requestId, {
        error: "Unable to validate tenant membership.",
        code: "TENANT_MEMBERSHIP_LOOKUP_FAILED",
        status: 500,
      });
    }

    if (existingProfileRes.data?.tenant_id && existingProfileRes.data.tenant_id !== tenantId) {
      return jsonError(requestId, {
        error: "This account is already linked to another tenant.",
        code: "TENANT_MEMBERSHIP_CONFLICT",
        status: 409,
      });
    }

    if (existingUserRes.error) {
      return jsonError(requestId, {
        error: "Unable to validate account role.",
        code: "ACCOUNT_ROLE_LOOKUP_FAILED",
        status: 500,
      });
    }

    if (existingUserRes.data?.role && existingUserRes.data.role !== "student") {
      return jsonError(requestId, {
        error: "This account already exists with a non-student role.",
        code: "ROLE_CONFLICT",
        status: 409,
      });
    }

    if (
      existingProfileRes.data?.tenant_id === tenantId &&
      existingProfileRes.data.role !== "student"
    ) {
      return jsonError(requestId, {
        error: "This account already exists with a non-student role.",
        code: "ROLE_CONFLICT",
        status: 409,
      });
    }

    if (existingOwnedStudentRes.error) {
      return jsonError(requestId, {
        error: "Unable to verify student ownership.",
        code: "STUDENT_OWNERSHIP_LOOKUP_FAILED",
        status: 500,
      });
    }

    let studentId = existingOwnedStudentRes.data?.id ?? null;
    let signupCode = createdNewUser ? "STUDENT_REGISTERED" : "STUDENT_ALREADY_REGISTERED";
    let idempotent = !createdNewUser;

    if (validatedClaim) {
      if (studentId) {
        return jsonError(requestId, {
          error: "This account already owns a student record.",
          code: "STUDENT_ALREADY_LINKED",
          status: 409,
        });
      }
    }

    let userRowCreatedByRequest = false;
    let profileUpsertedByRequest = false;
    const cleanupClaimArtifacts = async () => {
      if (!validatedClaim) return;

      if (profileUpsertedByRequest) {
        const { error } = await supabaseAdmin
          .from("user_profiles")
          .delete()
          .eq("user_id", userId)
          .eq("tenant_id", tenantId)
          .eq("role", "student");
        if (error) {
          console.error("student/register claim cleanup failed to delete user profile", {
            requestId,
            userId,
            error,
          });
        }
      }

      if (userRowCreatedByRequest) {
        const { error } = await supabaseAdmin
          .from("users")
          .delete()
          .eq("id", userId)
          .eq("role", "student");
        if (error) {
          console.error("student/register claim cleanup failed to delete user row", {
            requestId,
            userId,
            error,
          });
        }
      }

      if (createdNewUser) {
        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (error) {
          console.error("student/register claim cleanup failed to delete auth user", {
            requestId,
            userId,
            error,
          });
        }
      }
    };

    const { error: userUpsertError } = await supabaseAdmin.from("users").upsert(
      {
        id: userId,
        name: resolvedName,
        email,
        role: "student",
      },
      { onConflict: "id" }
    );
    if (userUpsertError) {
      return jsonError(requestId, {
        error: "Unable to finalize student profile.",
        code: "STUDENT_PROFILE_UPSERT_FAILED",
        status: 500,
      });
    }
    userRowCreatedByRequest = !existingUserRes.data?.id;

    const upsertTenantProfile = async () => {
      const { error: profileUpsertError } = await supabaseAdmin.from("user_profiles").upsert(
        {
          user_id: userId,
          tenant_id: tenantId,
          role: "student",
          display_name: resolvedName,
          extra: phone ? { phone } : {},
        },
        { onConflict: "user_id" }
      );
      if (profileUpsertError) {
        return jsonError(requestId, {
          error: "Unable to finalize tenant student profile.",
          code: "TENANT_PROFILE_UPSERT_FAILED",
          status: 500,
        });
      }
      profileUpsertedByRequest = true;
      return null;
    };

    if (validatedClaim) {
      const claimStudentUpdate = await supabaseAdmin
        .from("students")
        .update({
          account_owner_user_id: userId,
        })
        .eq("tenant_id", tenantId)
        .eq("id", validatedClaim.student_id)
        .is("account_owner_user_id", null)
        .select("id")
        .maybeSingle();
      if (claimStudentUpdate.error) {
        await cleanupClaimArtifacts();
        return jsonError(requestId, {
          error: "Unable to attach this account to the selected student.",
          code: "CLAIM_ATTACH_FAILED",
          status: 500,
        });
      }
      if (!claimStudentUpdate.data?.id) {
        await cleanupClaimArtifacts();
        return jsonError(requestId, {
          error: "Claim link is no longer available.",
          code: "CLAIM_NOT_AVAILABLE",
          status: 409,
        });
      }

      const profileErrorResponse = await upsertTenantProfile();
      if (profileErrorResponse) {
        return profileErrorResponse;
      }

      const consumeClaimRes = await supabaseAdmin
        .from("online_student_claim_tokens")
        .update({
          consumed_at: new Date().toISOString(),
          consumed_by_user_id: userId,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenantId)
        .eq("token_hash", claimTokenHash)
        .is("consumed_at", null)
        .is("revoked_at", null);
      if (consumeClaimRes.error) {
        return jsonError(requestId, {
          error: "Unable to finalize claim.",
          code: "CLAIM_CONSUME_FAILED",
          status: 500,
        });
      }

      studentId = claimStudentUpdate.data.id;
      signupCode = "STUDENT_CLAIMED";
      idempotent = false;
    } else {
      const profileErrorResponse = await upsertTenantProfile();
      if (profileErrorResponse) {
        return profileErrorResponse;
      }

      if (!studentId) {
        const insertStudentRes = await supabaseAdmin
          .from("students")
          .insert({
            tenant_id: tenantId,
            name: resolvedName,
            record_type: "student",
            crm_stage: "interested",
            account_owner_user_id: userId,
            parent_name: null,
            parent_contact_number: phone,
          })
          .select("id")
          .single();
        if (insertStudentRes.error) {
          return jsonError(requestId, {
            error: "Unable to create student record.",
            code: "STUDENT_CREATE_FAILED",
            status: 500,
          });
        }
        studentId = insertStudentRes.data.id;
      }

      const { data: programRows, error: programError } = await supabaseAdmin
        .from("programs")
        .select("id, type")
        .eq("tenant_id", tenantId)
        .in("type", ["online", "hybrid"])
        .order("created_at", { ascending: true });
      if (programError) {
        return jsonError(requestId, {
          error: "Unable to provision student enrollment.",
          code: "ENROLLMENT_SETUP_FAILED",
          status: 500,
        });
      }

      const programId =
        (programRows ?? []).find((row) => row.type === "online")?.id ??
        (programRows ?? [])[0]?.id ??
        null;

      if (programId && studentId) {
        const { error: enrollmentError } = await supabaseAdmin.from("enrollments").upsert(
          {
            tenant_id: tenantId,
            student_id: studentId,
            program_id: programId,
            status: "pending_payment",
            start_date: new Date().toISOString().slice(0, 10),
            metadata: {
              status_reason: claimToken
                ? "Online student claimed through self-signup"
                : "Online student self-signup",
            },
          },
          { onConflict: "student_id,program_id,tenant_id" }
        );
        if (enrollmentError) {
          return jsonError(requestId, {
            error: "Unable to provision student enrollment.",
            code: "ENROLLMENT_CREATE_FAILED",
            status: 500,
          });
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,
        code: signupCode,
        request_id: requestId,
        tenant_id: tenantId,
        student_id: studentId,
        idempotent,
      },
      { status: idempotent ? 200 : 201 }
    );
  } catch (error: unknown) {
    console.error("student/register failed", { requestId, error });
    return jsonError(requestId, {
      error: "Internal server error.",
      code: "INTERNAL_ERROR",
      status: 500,
    });
  }
}
