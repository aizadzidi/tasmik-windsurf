import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
import { DEFAULT_ENTITLEMENTS } from "@/types/leave";

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

      // Auto-seed missing defaults (handles both empty table and new leave types)
      const existingKeys = new Set(
        (entitlements ?? []).map((e) => `${e.position}__${e.leave_type}`)
      );
      const missing = DEFAULT_ENTITLEMENTS.filter(
        (d) => !existingKeys.has(`${d.position}__${d.leave_type}`)
      );

      if (missing.length > 0) {
        const { error: seedErr } = await client
          .from("leave_entitlements")
          .upsert(
            missing.map((d) => ({ ...d, tenant_id: tenantId })),
            { onConflict: "tenant_id,position,leave_type" }
          );
        if (seedErr) throw seedErr;

        const { data: refreshed, error: refreshErr } = await client
          .from("leave_entitlements")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("position")
          .order("leave_type");
        if (refreshErr) throw refreshErr;
        return refreshed;
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

      // Sync existing leave_balances for current year:
      // Update entitled_days for all users with this position + leave_type
      const currentYear = new Date().getFullYear();

      // Find users with this position
      const { data: matchingUsers } = await client
        .from("users")
        .select("id")
        .eq("role", position);

      const userIds = (matchingUsers ?? []).map((u) => u.id).filter(Boolean);

      // Also check user_profiles for tenant-scoped roles
      const { data: matchingProfiles } = await client
        .from("user_profiles")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .eq("role", position);

      const profileUserIds = (matchingProfiles ?? []).map((p) => p.user_id).filter(Boolean);
      const allUserIds = [...new Set([...userIds, ...profileUserIds])];

      if (allUserIds.length > 0) {
        await client
          .from("leave_balances")
          .update({ entitled_days: days_per_year })
          .eq("tenant_id", tenantId)
          .eq("leave_type", leave_type)
          .eq("year", currentYear)
          .in("user_id", allUserIds);
      }

      return data;
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const { message, status } = adminErrorDetails(error, "Failed to update leave entitlement");
    return NextResponse.json({ error: message }, { status });
  }
}
