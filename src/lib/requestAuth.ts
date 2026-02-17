import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

export type AuthGuardResult =
  | { ok: true; userId: string; email: string | null }
  | { ok: false; response: NextResponse };

export type TenantAuthGuardResult =
  | { ok: true; userId: string; email: string | null; tenantId: string }
  | { ok: false; response: NextResponse };

export async function requireAuthenticatedUser(request: NextRequest): Promise<AuthGuardResult> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true, userId: data.user.id, email: data.user.email ?? null };
}

export async function requireAuthenticatedTenantUser(
  request: NextRequest
): Promise<TenantAuthGuardResult> {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth;

  if (!supabaseAdmin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY is required for tenant resolution" },
        { status: 500 }
      ),
    };
  }

  const requestedTenantId = await resolveTenantIdFromRequest(request, supabaseAdmin);
  if (requestedTenantId) {
    const { data, error } = await supabaseAdmin
      .from("user_profiles")
      .select("tenant_id")
      .eq("user_id", auth.userId)
      .eq("tenant_id", requestedTenantId)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        response: NextResponse.json({ error: error.message }, { status: 500 }),
      };
    }
    if (!data?.tenant_id) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }

    return { ok: true, userId: auth.userId, email: auth.email, tenantId: data.tenant_id as string };
  }

  const { data: profiles, error: profileError } = await supabaseAdmin
    .from("user_profiles")
    .select("tenant_id")
    .eq("user_id", auth.userId)
    .limit(2);

  if (profileError) {
    return {
      ok: false,
      response: NextResponse.json({ error: profileError.message }, { status: 500 }),
    };
  }

  const tenantIds = Array.from(
    new Set((profiles ?? []).map((row) => row.tenant_id).filter((id): id is string => !!id))
  );
  if (tenantIds.length === 1) {
    return { ok: true, userId: auth.userId, email: auth.email, tenantId: tenantIds[0] };
  }
  if (tenantIds.length > 1) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Tenant context required for this request" },
        { status: 400 }
      ),
    };
  }

  const { data: tenants, error: tenantError } = await supabaseAdmin
    .from("tenants")
    .select("id")
    .limit(2);
  if (tenantError) {
    return {
      ok: false,
      response: NextResponse.json({ error: tenantError.message }, { status: 500 }),
    };
  }
  if (!tenants || tenants.length !== 1) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Tenant context missing" }, { status: 400 }),
    };
  }

  return { ok: true, userId: auth.userId, email: auth.email, tenantId: tenants[0].id as string };
}
