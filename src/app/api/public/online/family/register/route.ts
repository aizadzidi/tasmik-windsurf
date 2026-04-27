import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";
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
import { hashFamilyClaimToken } from "@/lib/studentClaims";

type FamilyLearnerInput = {
  name?: unknown;
  relationship?: unknown;
};

type FamilyRegisterBody = {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  phone?: unknown;
  learners?: unknown;
  family_claim_token?: unknown;
};

type ExistingUserRow = {
  id: string;
  role: string | null;
};

type FamilyClaimTokenRow = {
  id: string;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
};

type ClaimStudentLinkRow = {
  student_id: string;
};

type ClaimStudentRow = {
  id: string;
  name: string | null;
  record_type: string | null;
  parent_id: string | null;
};

const normalizeLearners = (value: unknown) => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): { name: string; relationship: "self" | "child" } | null => {
      const row = item as FamilyLearnerInput;
      const name = asTrimmedText(row.name, 120);
      const relationship = row.relationship === "self" ? "self" : "child";
      if (!name) return null;
      return { name, relationship };
    })
    .filter((item): item is { name: string; relationship: "self" | "child" } => Boolean(item));
};

async function resolveOnlineProgramId(
  client: ReturnType<typeof getSupabaseAdminClient>,
  tenantId: string
) {
  const { data: programRows, error: programError } = await client
    .from("programs")
    .select("id, type")
    .eq("tenant_id", tenantId)
    .in("type", ["online", "hybrid"])
    .order("created_at", { ascending: true });
  if (programError) throw programError;

  return (
    (programRows ?? []).find((row) => row.type === "online")?.id ??
    (programRows ?? [])[0]?.id ??
    null
  );
}

async function ensureOnlineEnrollment({
  client,
  tenantId,
  studentId,
  reason,
}: {
  client: ReturnType<typeof getSupabaseAdminClient>;
  tenantId: string;
  studentId: string;
  reason: string;
}) {
  const programId = await resolveOnlineProgramId(client, tenantId);
  if (!programId) return;

  const { error } = await client.from("enrollments").upsert(
    {
      tenant_id: tenantId,
      student_id: studentId,
      program_id: programId,
      status: "pending_payment",
      start_date: new Date().toISOString().slice(0, 10),
      metadata: { status_reason: reason },
    },
    { onConflict: "student_id,program_id,tenant_id" }
  );
  if (error) throw error;
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const host = getRequestHost(request);
  const isLocalHost = isLocalDevelopmentHost(host);

  if (isPublicSaasRegistrationHost(host) && !isLocalHost) {
    return jsonError(requestId, {
      error: "Family signup is only available on tenant subdomains.",
      code: "TENANT_HOST_REQUIRED",
      status: 400,
    });
  }

  const ipRate = await enforcePublicRateLimit({
    request,
    keyPrefix: "public:family-register:ip",
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

  let body: FamilyRegisterBody;
  try {
    body = (await request.json()) as FamilyRegisterBody;
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
  const learners = normalizeLearners(body.learners);
  const familyClaimToken = asTrimmedText(body.family_claim_token, 255);
  const familyClaimTokenHash = familyClaimToken ? hashFamilyClaimToken(familyClaimToken) : null;

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
  if (learners.length === 0 && !familyClaimTokenHash) {
    return jsonError(requestId, {
      error: "Add at least one learner or provide a family claim code.",
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  let tenantId = await resolveTenantIdFromRequest(request, supabaseAdmin);
  if (!tenantId && isLocalHost && familyClaimTokenHash) {
    const claimTenantRes = await supabaseAdmin
      .from("online_family_claim_tokens")
      .select("tenant_id")
      .eq("token_hash", familyClaimTokenHash)
      .maybeSingle<{ tenant_id: string }>();
    if (!claimTenantRes.error) tenantId = claimTenantRes.data?.tenant_id ?? null;
  }
  if (!tenantId) {
    return jsonError(requestId, {
      error: "Tenant not found for this host.",
      code: "TENANT_NOT_FOUND",
      status: 404,
    });
  }

  const identityRate = await enforceRateLimit({
    key: `public:family-register:tenant:${tenantId}:${hashForRateLimit(email)}`,
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
    let claimRow: FamilyClaimTokenRow | null = null;
    let claimStudentIds: string[] = [];

    if (familyClaimTokenHash) {
      const claimRes = await supabaseAdmin
        .from("online_family_claim_tokens")
        .select("id, expires_at, consumed_at, revoked_at")
        .eq("tenant_id", tenantId)
        .eq("token_hash", familyClaimTokenHash)
        .maybeSingle<FamilyClaimTokenRow>();
      if (claimRes.error) {
        return jsonError(requestId, {
          error: "Unable to validate family claim link.",
          code: "FAMILY_CLAIM_LOOKUP_FAILED",
          status: 500,
        });
      }

      const isExpired = claimRes.data?.expires_at
        ? new Date(claimRes.data.expires_at).getTime() <= Date.now()
        : true;
      if (!claimRes.data?.id || claimRes.data.consumed_at || claimRes.data.revoked_at || isExpired) {
        return jsonError(requestId, {
          error: "Family claim link is no longer available.",
          code: "FAMILY_CLAIM_NOT_AVAILABLE",
          status: 404,
        });
      }
      claimRow = claimRes.data;

      const linkRes = await supabaseAdmin
        .from("online_family_claim_token_students")
        .select("student_id")
        .eq("tenant_id", tenantId)
        .eq("family_claim_token_id", claimRow.id);
      if (linkRes.error) {
        return jsonError(requestId, {
          error: "Unable to load family claim students.",
          code: "FAMILY_CLAIM_STUDENTS_FAILED",
          status: 500,
        });
      }

      claimStudentIds = ((linkRes.data ?? []) as ClaimStudentLinkRow[])
        .map((row) => row.student_id)
        .filter(Boolean);
      if (claimStudentIds.length === 0) {
        return jsonError(requestId, {
          error: "Family claim link has no students.",
          code: "FAMILY_CLAIM_EMPTY",
          status: 404,
        });
      }
    }

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
        user_metadata: { name },
      });
      if (createResult.error) {
        if (!isAuthUserAlreadyExistsError(createResult.error.message ?? "")) {
          return jsonError(requestId, {
            error: "Unable to create family account.",
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

    const [existingProfileRes, existingUserRes, ownedStudentRes] = await Promise.all([
      supabaseAdmin
        .from("user_profiles")
        .select("tenant_id, role")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin.from("users").select("id, role").eq("id", userId).maybeSingle<ExistingUserRow>(),
      supabaseAdmin
        .from("students")
        .select("id, parent_id")
        .eq("tenant_id", tenantId)
        .eq("account_owner_user_id", userId)
        .neq("record_type", "prospect"),
    ]);

    if (existingProfileRes.error) throw existingProfileRes.error;
    if (existingUserRes.error) throw existingUserRes.error;
    if (ownedStudentRes.error) throw ownedStudentRes.error;

    if (existingProfileRes.data?.tenant_id && existingProfileRes.data.tenant_id !== tenantId) {
      return jsonError(requestId, {
        error: "This account is already linked to another tenant.",
        code: "TENANT_MEMBERSHIP_CONFLICT",
        status: 409,
      });
    }

    const currentRole = existingUserRes.data?.role ?? existingProfileRes.data?.role ?? null;
    if (currentRole && currentRole !== "parent" && currentRole !== "student") {
      return jsonError(requestId, {
        error: "This account already exists with an incompatible role.",
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
        error: "Unable to finalize family account.",
        code: "FAMILY_PROFILE_UPSERT_FAILED",
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
        error: "Unable to finalize tenant family profile.",
        code: "TENANT_PROFILE_UPSERT_FAILED",
        status: 500,
      });
    }

    const linkedStudentIds: string[] = [];
    const skippedStudentIds: string[] = [];

    if (claimStudentIds.length > 0) {
      const studentsRes = await supabaseAdmin
        .from("students")
        .select("id, name, record_type, parent_id")
        .eq("tenant_id", tenantId)
        .in("id", claimStudentIds);
      if (studentsRes.error) throw studentsRes.error;

      const claimStudents = (studentsRes.data ?? []) as ClaimStudentRow[];
      for (const student of claimStudents) {
        if (student.record_type === "prospect" || (student.parent_id && student.parent_id !== userId)) {
          skippedStudentIds.push(student.id);
          continue;
        }

        let linkedId: string | null = null;
        if (student.parent_id === userId) {
          linkedId = student.id;
        } else {
          const { data: linked, error: linkError } = await supabaseAdmin
            .from("students")
            .update({ parent_id: userId })
            .eq("tenant_id", tenantId)
            .eq("id", student.id)
            .is("parent_id", null)
            .select("id")
            .maybeSingle();
          if (linkError) throw linkError;
          linkedId = linked?.id ?? null;
        }

        if (linkedId) {
          linkedStudentIds.push(linkedId);
          await ensureOnlineEnrollment({
            client: supabaseAdmin,
            tenantId,
            studentId: linkedId,
            reason: "Online student linked through family claim",
          });
        }
      }

      if (linkedStudentIds.length === 0) {
        return jsonError(requestId, {
          error: "No students from this family claim link are available to claim.",
          code: "FAMILY_CLAIM_NO_AVAILABLE_STUDENTS",
          status: 409,
        });
      }

      if (claimRow) {
        const { error: consumeError } = await supabaseAdmin
          .from("online_family_claim_tokens")
          .update({
            consumed_at: new Date().toISOString(),
            consumed_by_user_id: userId,
            updated_at: new Date().toISOString(),
          })
          .eq("tenant_id", tenantId)
          .eq("id", claimRow.id)
          .is("consumed_at", null)
          .is("revoked_at", null);
        if (consumeError) throw consumeError;
      }
    }

    const ownedStudents = (ownedStudentRes.data ?? []) as Array<{
      id: string;
      parent_id: string | null;
    }>;
    for (const ownedStudent of ownedStudents) {
      if (ownedStudent.parent_id === userId) {
        linkedStudentIds.push(ownedStudent.id);
        continue;
      }
      if (ownedStudent.parent_id) continue;

      const { error: ownLinkError } = await supabaseAdmin
        .from("students")
        .update({ parent_id: userId })
        .eq("tenant_id", tenantId)
        .eq("id", ownedStudent.id)
        .is("parent_id", null);
      if (ownLinkError) throw ownLinkError;
      linkedStudentIds.push(ownedStudent.id);
    }

    for (const learner of learners) {
      const { data: insertedStudent, error: insertStudentError } = await supabaseAdmin
        .from("students")
        .insert({
          tenant_id: tenantId,
          name: learner.name,
          record_type: "student",
          crm_stage: "interested",
          parent_id: userId,
          parent_name: name,
          parent_contact_number: phone,
        })
        .select("id")
        .single();
      if (insertStudentError) throw insertStudentError;

      linkedStudentIds.push(insertedStudent.id);
      await ensureOnlineEnrollment({
        client: supabaseAdmin,
        tenantId,
        studentId: insertedStudent.id,
        reason:
          learner.relationship === "self"
            ? "Online self learner created through family signup"
            : "Online child learner created through family signup",
      });
    }

    return NextResponse.json(
      {
        ok: true,
        code: createdNewUser ? "FAMILY_REGISTERED" : "FAMILY_ALREADY_REGISTERED",
        request_id: requestId,
        tenant_id: tenantId,
        family_user_id: userId,
        linked_student_ids: Array.from(new Set(linkedStudentIds)),
        skipped_student_ids: skippedStudentIds,
        idempotent: !createdNewUser,
      },
      { status: createdNewUser ? 201 : 200 }
    );
  } catch (error) {
    console.error("family/register failed", { requestId, error });
    return jsonError(requestId, {
      error: "Internal server error.",
      code: "INTERNAL_ERROR",
      status: 500,
    });
  }
}
