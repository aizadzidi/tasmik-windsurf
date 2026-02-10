import { NextRequest, NextResponse } from "next/server";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
import { requireAdminPermission } from "@/lib/adminPermissions";
import type { ProgramType } from "@/types/programs";

const adminErrorDetails = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const status = message.includes("Admin access required") ? 403 : 500;
  return { message, status };
};

const resolveTenantIdOrThrow = async (request: NextRequest) =>
  adminOperationSimple(async (client) => {
    const tenantId = await resolveTenantIdFromRequest(request, client);
    if (tenantId) return tenantId;

    const { data, error } = await client.from("tenants").select("id").limit(2);
    if (error) throw error;
    if (!data || data.length !== 1) {
      throw new Error("Tenant context missing");
    }

    return data[0].id;
  });

const normalizeProgramType = (value?: string | null): ProgramType | null => {
  if (value === "campus" || value === "online" || value === "hybrid") return value;
  return null;
};

type EnrollmentRow = {
  student_id: string | null;
  status?: string | null;
  programs?: { type?: string | null } | null;
};

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, [
      "admin:dashboard",
      "admin:crm",
      "admin:certificates",
      "admin:historical",
    ]);
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("include_inactive") === "true";
    const tenantId = await resolveTenantIdOrThrow(request);

    const data = await adminOperationSimple(async (client) => {
      let query = client
        .from("enrollments")
        .select("student_id, status, programs(type)")
        .eq("tenant_id", tenantId);

      if (!includeInactive) {
        query = query.in("status", ["active", "paused", "pending_payment"]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    });

    const grouped = new Map<string, Set<ProgramType>>();
    (data as EnrollmentRow[]).forEach((row) => {
      if (!row.student_id) return;
      const programType = normalizeProgramType(row.programs?.type ?? null);
      if (!programType) return;
      const types = grouped.get(row.student_id) ?? new Set<ProgramType>();
      types.add(programType);
      grouped.set(row.student_id, types);
    });

    const payload = Array.from(grouped.entries()).map(([student_id, types]) => ({
      student_id,
      program_types: Array.from(types.values()),
    }));

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("Admin enrollments fetch error:", error);
    const { message, status } = adminErrorDetails(error, "Failed to fetch enrollments");
    return NextResponse.json({ error: message }, { status });
  }
}
