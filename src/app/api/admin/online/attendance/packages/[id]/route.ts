import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";

const resolveTenantIdOrThrow = async (request: NextRequest) =>
  adminOperationSimple(async (client) => {
    const tenantId = await resolveTenantIdFromRequest(request, client);
    if (tenantId) return tenantId;
    const { data, error } = await client.from("tenants").select("id").limit(2);
    if (error) throw error;
    if (!data || data.length !== 1) throw new Error("Tenant context missing");
    return data[0].id;
  });

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireAdminPermission(request, ["admin:online"]);
    if (!guard.ok) return guard.response;

    const { id } = await context.params;
    const tenantId = await resolveTenantIdOrThrow(request);

    const payload = await adminOperationSimple(async (client) => {
      const updateSlots = await client
        .from("online_recurring_package_slots")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("package_id", id);
      if (updateSlots.error) throw updateSlots.error;

      const updatePackage = await client
        .from("online_recurring_packages")
        .update({
          status: "cancelled",
          effective_to: new Date().toISOString().slice(0, 10),
          updated_at: new Date().toISOString(),
          updated_by: guard.userId,
        })
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .select("*")
        .single();
      if (updatePackage.error) throw updatePackage.error;

      return updatePackage.data;
    });

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("Admin online package delete error:", error);
    const message = error instanceof Error ? error.message : "Failed to remove package";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
