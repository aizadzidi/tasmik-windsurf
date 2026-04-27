import { NextRequest, NextResponse } from "next/server";
import {
  getRequestHost,
  isLocalDevelopmentHost,
  isPublicSaasRegistrationHost,
} from "@/lib/hostResolution";
import { jsonError } from "@/lib/publicApi";
import { hashFamilyClaimToken } from "@/lib/studentClaims";
import { getSupabaseAdminClient } from "@/lib/supabaseAdminClient";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";

type FamilyClaimTokenRow = {
  id: string;
  tenant_id: string;
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
  account_owner_user_id: string | null;
};

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const host = getRequestHost(request);
  const isLocalHost = isLocalDevelopmentHost(host);
  const token = (new URL(request.url).searchParams.get("token") ?? "").trim();

  if (!token) {
    return jsonError(requestId, {
      error: "token is required.",
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }

  if (isPublicSaasRegistrationHost(host) && !isLocalHost) {
    return jsonError(requestId, {
      error: "Family claim is only available on tenant subdomains.",
      code: "TENANT_HOST_REQUIRED",
      status: 400,
    });
  }

  try {
    const supabaseAdmin = getSupabaseAdminClient();
    const tokenHash = hashFamilyClaimToken(token);
    let tenantId = await resolveTenantIdFromRequest(request, supabaseAdmin);

    if (!tenantId && isLocalHost) {
      const claimTenantRes = await supabaseAdmin
        .from("online_family_claim_tokens")
        .select("tenant_id")
        .eq("token_hash", tokenHash)
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

    const claimRes = await supabaseAdmin
      .from("online_family_claim_tokens")
      .select("id, tenant_id, expires_at, consumed_at, revoked_at")
      .eq("tenant_id", tenantId)
      .eq("token_hash", tokenHash)
      .maybeSingle<FamilyClaimTokenRow>();

    if (claimRes.error) {
      return jsonError(requestId, {
        error: "Unable to validate family claim link.",
        code: "FAMILY_CLAIM_LOOKUP_FAILED",
        status: 500,
      });
    }

    const claim = claimRes.data;
    const isExpired = claim?.expires_at ? new Date(claim.expires_at).getTime() <= Date.now() : true;
    if (!claim?.id || claim.consumed_at || claim.revoked_at || isExpired) {
      return jsonError(requestId, {
        error: "Family claim link is no longer available.",
        code: "FAMILY_CLAIM_NOT_AVAILABLE",
        status: 404,
      });
    }

    const linkRes = await supabaseAdmin
      .from("online_family_claim_token_students")
      .select("student_id")
      .eq("tenant_id", tenantId)
      .eq("family_claim_token_id", claim.id);
    if (linkRes.error) {
      return jsonError(requestId, {
        error: "Unable to load family claim students.",
        code: "FAMILY_CLAIM_STUDENTS_FAILED",
        status: 500,
      });
    }

    const studentIds = ((linkRes.data ?? []) as ClaimStudentLinkRow[])
      .map((row) => row.student_id)
      .filter(Boolean);
    if (studentIds.length === 0) {
      return jsonError(requestId, {
        error: "Family claim link has no students.",
        code: "FAMILY_CLAIM_EMPTY",
        status: 404,
      });
    }

    const studentsRes = await supabaseAdmin
      .from("students")
      .select("id, name, record_type, parent_id, account_owner_user_id")
      .eq("tenant_id", tenantId)
      .in("id", studentIds);
    if (studentsRes.error) {
      return jsonError(requestId, {
        error: "Unable to load family claim students.",
        code: "FAMILY_CLAIM_STUDENTS_FAILED",
        status: 500,
      });
    }

    const students = ((studentsRes.data ?? []) as ClaimStudentRow[]).map((student) => {
      const unavailableReason =
        student.record_type === "prospect"
          ? "Prospect records cannot be claimed."
          : student.parent_id
            ? "Already linked to a family account."
            : null;

      return {
        id: student.id,
        name: student.name?.trim() || "Student",
        available: !unavailableReason,
        unavailable_reason: unavailableReason,
        has_student_login: Boolean(student.account_owner_user_id),
      };
    });

    return NextResponse.json({
      ok: true,
      expires_at: claim.expires_at,
      students,
      request_id: requestId,
    });
  } catch (error) {
    console.error("family claim validation failed", { requestId, error });
    return jsonError(requestId, {
      error: "Internal server error.",
      code: "INTERNAL_ERROR",
      status: 500,
    });
  }
}
