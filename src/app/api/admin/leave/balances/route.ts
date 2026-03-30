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

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:leave"]);
    if (!guard.ok) return guard.response;

    const currentYear = new Date().getFullYear();

    const data = await adminOperationSimple(async (client) => {
      const tenantId = await resolveTenantIdOrThrow(request, client);

      // Fetch all leave balances for this tenant/year
      const { data: balances, error: balErr } = await client
        .from("leave_balances")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("year", currentYear);

      if (balErr) throw balErr;

      if (!balances || balances.length === 0) return [];

      // Get unique user IDs
      const userIds = [...new Set(balances.map((b) => b.user_id).filter(Boolean))];

      const { data: users, error: usersErr } = await client
        .from("users")
        .select("id, name, email, role")
        .in("id", userIds);

      if (usersErr) throw usersErr;

      const userMap = new Map(
        (users ?? []).map((u) => [u.id, { name: u.name, email: u.email, role: u.role }])
      );

      // Group balances by user
      const grouped: Record<
        string,
        {
          user_id: string;
          user_name: string;
          user_email: string;
          user_role: string;
          balances: { leave_type: string; entitled_days: number; used_days: number }[];
        }
      > = {};

      for (const b of balances) {
        if (!grouped[b.user_id]) {
          const user = userMap.get(b.user_id);
          grouped[b.user_id] = {
            user_id: b.user_id,
            user_name: user?.name ?? "Unknown",
            user_email: user?.email ?? "",
            user_role: user?.role ?? "",
            balances: [],
          };
        }
        grouped[b.user_id].balances.push({
          leave_type: b.leave_type,
          entitled_days: b.entitled_days,
          used_days: b.used_days,
        });
      }

      return Object.values(grouped);
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch balances";
    const status = message.includes("Admin access required") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
