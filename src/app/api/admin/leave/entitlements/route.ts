import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";

const resolveTenantIdOrThrow = async (
  request: NextRequest,
  client: Parameters<Parameters<typeof adminOperationSimple>[0]>[0]
) => {
  const tenantId = await resolveTenantIdFromRequest(request, client);
  if (tenantId) return tenantId;
  const { data, error } = await client.from("tenants").select("id").limit(2);
  if (error) throw error;
  if (!data || data.length !== 1) throw new Error("Tenant context missing");
  return data[0].id as string;
};

const adminErrorDetails = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const status = message.includes("Admin access required") ? 403 : 500;
  return { message, status };
};

const DEFAULT_ENTITLEMENTS = [
  { position: "admin", leave_type: "annual_leave", days_per_year: 14 },
  { position: "admin", leave_type: "medical_leave", days_per_year: 14 },
  { position: "admin", leave_type: "unpaid_leave", days_per_year: 0 },
  { position: "teacher", leave_type: "annual_leave", days_per_year: 12 },
  { position: "teacher", leave_type: "medical_leave", days_per_year: 14 },
  { position: "teacher", leave_type: "unpaid_leave", days_per_year: 0 },
  { position: "general_worker", leave_type: "annual_leave", days_per_year: 10 },
  { position: "general_worker", leave_type: "medical_leave", days_per_year: 14 },
  { position: "general_worker", leave_type: "unpaid_leave", days_per_year: 0 },
];

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:leave"]);
    if (!guard.ok) return guard.response;

    const data = await adminOperationSimple(async (client) => {
      const tenantId = await resolveTenantIdOrThrow(request, client);

      const { data: entitlements, error } = await client
        .from("leave_entitlements")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("position")
        .order("leave_type");

      if (error) throw error;

      // Auto-seed defaults if none exist
      if (!entitlements || entitlements.length === 0) {
        const { error: seedErr } = await client
          .from("leave_entitlements")
          .upsert(
            DEFAULT_ENTITLEMENTS.map((d) => ({ ...d, tenant_id: tenantId })),
            { onConflict: "tenant_id,position,leave_type" }
          );
        if (seedErr) throw seedErr;

        const { data: seeded, error: seededErr } = await client
          .from("leave_entitlements")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("position")
          .order("leave_type");
        if (seededErr) throw seededErr;
        return seeded;
      }

      return entitlements;
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    const { message, status } = adminErrorDetails(error, "Failed to fetch leave entitlements");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:leave"]);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { position, leave_type, days_per_year } = body;

    if (!position || !leave_type || days_per_year === undefined) {
      return NextResponse.json(
        { error: "position, leave_type, and days_per_year are required" },
        { status: 400 }
      );
    }

    const result = await adminOperationSimple(async (client) => {
      const tenantId = await resolveTenantIdOrThrow(request, client);

      const { data, error } = await client
        .from("leave_entitlements")
        .upsert(
          {
            tenant_id: tenantId,
            position,
            leave_type,
            days_per_year,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id,position,leave_type" }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const { message, status } = adminErrorDetails(error, "Failed to update leave entitlement");
    return NextResponse.json({ error: message }, { status });
  }
}
