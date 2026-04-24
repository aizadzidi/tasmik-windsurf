import { NextRequest, NextResponse } from "next/server";
import {
  getRequestHost,
  isLocalDevelopmentHost,
  isPublicSaasRegistrationHost,
} from "@/lib/hostResolution";
import { getSupabaseAdminClient } from "@/lib/supabaseAdminClient";
import { jsonError } from "@/lib/publicApi";
import { hashStudentClaimToken } from "@/lib/studentClaims";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";

type ClaimLookupRow = {
  tenant_id: string;
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
      error: "Student claim is only available on tenant subdomains.",
      code: "TENANT_HOST_REQUIRED",
      status: 400,
    });
  }

  try {
    const supabaseAdmin = getSupabaseAdminClient();
    const tenantId = await resolveTenantIdFromRequest(request, supabaseAdmin);
    const tokenHash = hashStudentClaimToken(token);

    let claimRes;
    if (tenantId) {
      claimRes = await supabaseAdmin
        .from("online_student_claim_tokens")
        .select("tenant_id, student_id, expires_at, consumed_at, revoked_at, students(id, name, record_type, account_owner_user_id)")
        .eq("tenant_id", tenantId)
        .eq("token_hash", tokenHash)
        .maybeSingle<ClaimLookupRow>();
    } else if (isLocalHost) {
      claimRes = await supabaseAdmin
        .from("online_student_claim_tokens")
        .select("tenant_id, student_id, expires_at, consumed_at, revoked_at, students(id, name, record_type, account_owner_user_id)")
        .eq("token_hash", tokenHash)
        .maybeSingle<ClaimLookupRow>();
    } else {
      return jsonError(requestId, {
        error: "Tenant not found for this host.",
        code: "TENANT_NOT_FOUND",
        status: 404,
      });
    }

    if (claimRes.error) {
      return jsonError(requestId, {
        error: "Unable to validate claim link.",
        code: "CLAIM_LOOKUP_FAILED",
        status: 500,
      });
    }

    const claim = claimRes.data;
    const student = Array.isArray(claim?.students) ? claim.students[0] : claim?.students;
    const studentName = (student?.name ?? "").trim();
    const hasLockedName = studentName.length > 0;
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

    return NextResponse.json({
      ok: true,
      student: {
        id: student.id,
        name: studentName,
        display_name: hasLockedName ? studentName : "Student",
        name_locked: hasLockedName,
      },
      expires_at: claim.expires_at,
      request_id: requestId,
    });
  } catch (error) {
    console.error("student/claim validation failed", { requestId, error });
    return jsonError(requestId, {
      error: "Internal server error.",
      code: "INTERNAL_ERROR",
      status: 500,
    });
  }
}
