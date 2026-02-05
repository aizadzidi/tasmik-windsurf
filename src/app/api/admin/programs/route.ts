import { NextRequest, NextResponse } from "next/server";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
import { requireAdminPermission } from "@/lib/adminPermissions";

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:users"]);
    if (!guard.ok) return guard.response;

    const data = await adminOperationSimple(async (client) => {
      const tenantId = await resolveTenantIdFromRequest(request, client);
      if (!tenantId) {
        throw new Error("Missing tenant context");
      }

      const { data, error } = await client
        .from("programs")
        .select("id, name, type")
        .eq("tenant_id", tenantId)
        .order("type");

      if (error) throw error;
      return data ?? [];
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("Admin programs fetch error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch programs";
    const status = message.includes("Admin access required") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
