import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// DELETE - Revoke an invite
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  const guard = await requireAdminPermission(request, ["admin:users"]);
  if (!guard.ok) return guard.response;

  const tenantId = guard.tenantId;
  const { id } = await context.params;

  try {
    await adminOperationSimple(async (client) => {
      const { error } = await client
        .from("tenant_invites")
        .update({ is_active: false })
        .eq("id", id)
        .eq("tenant_id", tenantId);

      if (error) throw error;
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/admin/invites/[id] failed", error);
    return NextResponse.json({ error: "Failed to revoke invite" }, { status: 500 });
  }
}
