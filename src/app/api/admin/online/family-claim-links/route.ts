import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import {
  getRequestHost,
  getTenantSubdomainBaseDomain,
  isLocalDevelopmentHost,
} from "@/lib/hostResolution";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import {
  familyClaimExpiresAt,
  generateFamilyClaimToken,
  hashFamilyClaimToken,
} from "@/lib/studentClaims";

type CreateFamilyClaimLinkBody = {
  student_ids?: unknown;
};

type StudentRow = {
  id: string;
  name: string | null;
  tenant_id: string;
  parent_id: string | null;
  record_type: string | null;
};

type TenantDomainRow = {
  domain: string;
};

type TenantRow = {
  slug: string | null;
};

class RequestValidationError extends Error {}

const adminErrorDetails = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const status = error instanceof RequestValidationError
    ? 400
    : message.includes("Admin access required")
      ? 403
      : 500;
  return { message, status };
};

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:online", "admin:dashboard"]);
    if (!guard.ok) return guard.response;

    const body = (await request.json()) as CreateFamilyClaimLinkBody;
    const studentIds = Array.from(
      new Set(
        (Array.isArray(body.student_ids) ? body.student_ids : [])
          .map(String)
          .map((value) => value.trim())
          .filter(Boolean)
      )
    );

    if (studentIds.length < 2) {
      return NextResponse.json(
        { error: "Select at least two students for a family claim link." },
        { status: 400 }
      );
    }

    const payload = await adminOperationSimple(async (client) => {
      const studentRes = await client
        .from("students")
        .select("id, name, tenant_id, parent_id, record_type")
        .eq("tenant_id", guard.tenantId)
        .in("id", studentIds);
      if (studentRes.error) throw studentRes.error;

      const students = (studentRes.data ?? []) as StudentRow[];
      if (
        students.length !== studentIds.length ||
        students.some((student) => student.record_type === "prospect")
      ) {
        throw new RequestValidationError("One or more selected students were not found.");
      }

      const linkedStudents = students.filter((student) => student.parent_id);
      if (linkedStudents.length > 0) {
        throw new RequestValidationError(
          "One or more selected students are already linked to a parent account."
        );
      }

      const enrollmentRes = await client
        .from("enrollments")
        .select("student_id, programs(type)")
        .eq("tenant_id", guard.tenantId)
        .in("student_id", studentIds)
        .in("status", ["pending_payment", "active", "paused"]);
      if (enrollmentRes.error) throw enrollmentRes.error;

      const onlineStudentIds = new Set(
        (enrollmentRes.data ?? [])
          .filter((row) => {
            const program = Array.isArray(row.programs) ? row.programs[0] : row.programs;
            return program?.type === "online" || program?.type === "hybrid";
          })
          .map((row) => row.student_id)
          .filter(Boolean)
      );

      const nonOnlineStudents = students.filter((student) => !onlineStudentIds.has(student.id));
      if (nonOnlineStudents.length > 0) {
        throw new RequestValidationError(
          "All selected students must be enrolled in an online or hybrid program."
        );
      }

      const rawToken = generateFamilyClaimToken();
      const expiresAt = familyClaimExpiresAt();
      const insertTokenRes = await client
        .from("online_family_claim_tokens")
        .insert({
          tenant_id: guard.tenantId,
          token_hash: hashFamilyClaimToken(rawToken),
          expires_at: expiresAt,
          created_by: guard.userId,
        })
        .select("id")
        .single();
      if (insertTokenRes.error) throw insertTokenRes.error;

      const insertLinksRes = await client.from("online_family_claim_token_students").insert(
        students.map((student) => ({
          tenant_id: guard.tenantId,
          family_claim_token_id: insertTokenRes.data.id,
          student_id: student.id,
        }))
      );
      if (insertLinksRes.error) throw insertLinksRes.error;

      const requestHost = getRequestHost(request);
      let signupOrigin = new URL(request.url).origin;

      if (!isLocalDevelopmentHost(requestHost)) {
        const [domainRes, tenantRes] = await Promise.all([
          client
            .from("tenant_domains")
            .select("domain")
            .eq("tenant_id", guard.tenantId)
            .order("is_primary", { ascending: false })
            .order("created_at", { ascending: true })
            .limit(1),
          client.from("tenants").select("slug").eq("id", guard.tenantId).maybeSingle<TenantRow>(),
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
        signupOrigin = `https://${signupHost}`;
      }

      const claimUrl = new URL("/join/family", signupOrigin);
      claimUrl.searchParams.set("claim", rawToken);

      return {
        student_ids: students.map((student) => student.id),
        student_names: students.map((student) => student.name ?? "Student"),
        claim_url: claimUrl.toString(),
        expires_at: expiresAt,
      };
    });

    return NextResponse.json(payload, { status: 201 });
  } catch (error: unknown) {
    console.error("Admin online family claim link create error:", error);
    const { message, status } = adminErrorDetails(error, "Failed to create family claim link");
    return NextResponse.json({ error: message }, { status });
  }
}
