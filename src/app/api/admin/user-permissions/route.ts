import { NextRequest, NextResponse } from "next/server";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
import { requireAdminPermission } from "@/lib/adminPermissions";

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

    return data[0].id as string;
  });

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:users"]);
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    const permissionKey = searchParams.get("permission_key");
    const tenantId = await resolveTenantIdOrThrow(request);

    const data = await adminOperationSimple(async (client) => {
      let query = client
        .from("user_permissions")
        .select("user_id, permission_key")
        .eq("tenant_id", tenantId);

      if (userId) {
        query = query.eq("user_id", userId);
      }
      if (permissionKey) {
        query = query.eq("permission_key", permissionKey);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    });

    return NextResponse.json(data ?? []);
  } catch (error: unknown) {
    console.error("Admin user permissions fetch error:", error);
    const { message, status } = adminErrorDetails(
      error,
      "Failed to fetch user permissions"
    );
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:users"]);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { user_id, permission_key, enabled } = body ?? {};

    if (!user_id || !permission_key || typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "user_id, permission_key, and enabled are required" },
        { status: 400 }
      );
    }

    const tenantId = await resolveTenantIdOrThrow(request);

    const data = await adminOperationSimple(async (client) => {
      if (enabled) {
        const { data, error } = await client
          .from("user_permissions")
          .upsert(
            {
              user_id,
              permission_key,
              tenant_id: tenantId,
            },
            { onConflict: "tenant_id,user_id,permission_key" }
          )
          .select("user_id, permission_key")
          .single();
        if (error) throw error;
        return data;
      }

      const { error } = await client
        .from("user_permissions")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("user_id", user_id)
        .eq("permission_key", permission_key);

      if (error) throw error;
      return { user_id, permission_key, removed: true };
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("Admin user permission update error:", error);
    const { message, status } = adminErrorDetails(
      error,
      "Failed to update user permission"
    );
    return NextResponse.json({ error: message }, { status });
  }
}
