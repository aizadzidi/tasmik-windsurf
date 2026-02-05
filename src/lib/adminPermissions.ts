import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const resolveTenantIdOrThrow = async (request: NextRequest) => {
  const tenantId = await resolveTenantIdFromRequest(request, supabaseAdmin);
  if (tenantId) return tenantId;

  const { data, error } = await supabaseAdmin.from("tenants").select("id").limit(2);
  if (error) throw error;
  if (!data || data.length !== 1) {
    throw new Error("Tenant context missing");
  }

  return data[0].id as string;
};

export type AdminPermissionGuardResult =
  | { ok: true; userId: string; tenantId: string; isAdmin: boolean }
  | { ok: false; response: NextResponse };

export async function requireAdminPermission(
  request: NextRequest,
  allowedPermissions: string[]
): Promise<AdminPermissionGuardResult> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: authData, error: authError } = await supabaseAuth.auth.getUser(token);
  if (authError || !authData?.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const userId = authData.user.id;

  let tenantId: string;
  try {
    tenantId = await resolveTenantIdOrThrow(request);
  } catch (error) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: error instanceof Error ? error.message : "Tenant context missing" },
        { status: 400 }
      ),
    };
  }

  const [userRowRes, profileRes] = await Promise.all([
    supabaseAdmin.from("users").select("role").eq("id", userId).maybeSingle(),
    supabaseAdmin
      .from("user_profiles")
      .select("role, tenant_id")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  const isAdmin =
    userRowRes.data?.role === "admin" || profileRes.data?.role === "school_admin";

  if (isAdmin) {
    return { ok: true, userId, tenantId, isAdmin: true };
  }

  if (!profileRes.data?.tenant_id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  if (!allowedPermissions.length) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const { data: permissions, error: permissionError } = await supabaseAdmin
    .from("user_permissions")
    .select("permission_key")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .in("permission_key", allowedPermissions);

  if (permissionError || !permissions || permissions.length === 0) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, userId, tenantId, isAdmin: false };
}
