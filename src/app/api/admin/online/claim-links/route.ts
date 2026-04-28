import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminPermission } from "@/lib/adminPermissions";
import {
  getRequestHost,
  getTenantSubdomainBaseDomain,
  isLocalDevelopmentHost,
} from "@/lib/hostResolution";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { generateStudentClaimToken, hashStudentClaimToken, studentClaimExpiresAt } from "@/lib/studentClaims";

type CreateClaimLinkBody = {
  student_id?: string;
};

type StudentRow = {
  id: string;
  name: string | null;
  tenant_id: string;
  record_type: string | null;
  account_owner_user_id: string | null;
};

type TenantDomainRow = {
  domain: string;
};

type TenantRow = {
  slug: string | null;
};

const SIGNUP_ORIGIN_CACHE_TTL_MS = 60_000;
const signupOriginCache = new Map<string, { origin: string; expiresAtMs: number }>();

const resolveSignupOrigin = async (
  request: NextRequest,
  client: SupabaseClient,
  tenantId: string
) => {
  const requestHost = getRequestHost(request);
  if (isLocalDevelopmentHost(requestHost)) {
    return new URL(request.url).origin;
  }

  const cached = signupOriginCache.get(tenantId);
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.origin;
  }

  const [domainRes, tenantRes] = await Promise.all([
    client
      .from("tenant_domains")
      .select("domain")
      .eq("tenant_id", tenantId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1),
    client.from("tenants").select("slug").eq("id", tenantId).maybeSingle<TenantRow>(),
  ]);
  if (domainRes.error) throw domainRes.error;
  if (tenantRes.error) throw tenantRes.error;

  const primaryDomain = (domainRes.data?.[0] as TenantDomainRow | undefined)?.domain ?? null;
  const fallbackDomain = tenantRes.data?.slug
    ? `${tenantRes.data.slug}.${getTenantSubdomainBaseDomain()}`
    : null;
  const signupHost = primaryDomain ?? fallbackDomain;
  if (!signupHost) {
    throw new Error("Unable to resolve tenant signup domain.");
  }

  const origin = `https://${signupHost}`;
  signupOriginCache.set(tenantId, {
    origin,
    expiresAtMs: Date.now() + SIGNUP_ORIGIN_CACHE_TTL_MS,
  });
  return origin;
};

const adminErrorDetails = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const status = message.includes("Admin access required") ? 403 : 500;
  return { message, status };
};

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:online", "admin:dashboard"]);
    if (!guard.ok) return guard.response;

    const body = (await request.json()) as CreateClaimLinkBody;
    const studentId = (body.student_id ?? "").trim();
    if (!studentId) {
      return NextResponse.json({ error: "student_id is required" }, { status: 400 });
    }

    const payload = await adminOperationSimple(async (client) => {
      const rawToken = generateStudentClaimToken();
      const expiresAt = studentClaimExpiresAt();
      const tokenHash = hashStudentClaimToken(rawToken);
      let signupOriginError: unknown = null;
      const signupOriginPromise = resolveSignupOrigin(request, client, guard.tenantId).catch((error) => {
        signupOriginError = error;
        return null;
      });

      const [studentRes, enrollmentRes] = await Promise.all([
        client
          .from("students")
          .select("id, name, tenant_id, record_type, account_owner_user_id")
          .eq("tenant_id", guard.tenantId)
          .eq("id", studentId)
          .maybeSingle<StudentRow>(),
        client
          .from("enrollments")
          .select("id, programs(type)")
          .eq("tenant_id", guard.tenantId)
          .eq("student_id", studentId)
          .in("status", ["pending_payment", "active", "paused"]),
      ]);
      if (studentRes.error) throw studentRes.error;
      if (enrollmentRes.error) throw enrollmentRes.error;

      const student = studentRes.data;
      if (!student?.id || student.record_type === "prospect") {
        throw new Error("Student not found.");
      }
      if (student.account_owner_user_id) {
        throw new Error("This student has already been claimed.");
      }

      const hasOnlineEnrollment = (enrollmentRes.data ?? []).some((row) => {
        const program = Array.isArray(row.programs) ? row.programs[0] : row.programs;
        return program?.type === "online" || program?.type === "hybrid";
      });
      if (!hasOnlineEnrollment) {
        throw new Error("This student is not enrolled in an online or hybrid program.");
      }

      const revokeRes = await client
        .from("online_student_claim_tokens")
        .update({
          revoked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", guard.tenantId)
        .eq("student_id", student.id)
        .is("consumed_at", null)
        .is("revoked_at", null);
      if (revokeRes.error) throw revokeRes.error;

      const insertRes = await client
        .from("online_student_claim_tokens")
        .insert({
          tenant_id: guard.tenantId,
          student_id: student.id,
          token_hash: tokenHash,
          expires_at: expiresAt,
          created_by: guard.userId,
        })
        .select("id")
        .single();
      if (insertRes.error) throw insertRes.error;

      const signupOrigin = await signupOriginPromise;
      if (signupOriginError) throw signupOriginError;
      if (!signupOrigin) {
        throw new Error("Unable to resolve tenant signup domain.");
      }

      const claimUrl = new URL("/join/student", signupOrigin);
      claimUrl.searchParams.set("claim", rawToken);

      return {
        student_id: student.id,
        student_name: student.name ?? "Student",
        claim_url: claimUrl.toString(),
        expires_at: expiresAt,
      };
    });

    return NextResponse.json(payload, { status: 201 });
  } catch (error: unknown) {
    console.error("Admin online claim link create error:", error);
    const { message, status } = adminErrorDetails(error, "Failed to create claim link");
    return NextResponse.json({ error: message }, { status });
  }
}
