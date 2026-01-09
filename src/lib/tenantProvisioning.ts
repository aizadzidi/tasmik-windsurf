import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type UserRow = {
  name: string | null;
  role: string | null;
};

export function normalizeHost(host: string | null) {
  if (!host) return null;
  return host.split(":")[0]?.trim().toLowerCase() || null;
}

export async function resolveTenantIdFromRequest(
  request: NextRequest,
  supabaseAdmin: SupabaseClient
) {
  const host =
    normalizeHost(request.headers.get("x-forwarded-host")) ||
    normalizeHost(request.headers.get("host")) ||
    normalizeHost(new URL(request.url).hostname);
  if (!host) return null;

  const { data, error } = await supabaseAdmin
    .from("tenant_domains")
    .select("tenant_id")
    .eq("domain", host)
    .maybeSingle();
  if (error || !data?.tenant_id) return null;
  return data.tenant_id as string;
}

export function mapUserRoleToProfile(role?: string | null) {
  if (role === "admin") return "school_admin";
  if (role === "teacher") return "teacher";
  if (role === "parent") return "parent";
  return "parent";
}

export async function ensureUserProfile(params: {
  request: NextRequest;
  userId: string;
  supabaseAdmin: SupabaseClient;
}) {
  const { request, userId, supabaseAdmin } = params;
  const tenantId = await resolveTenantIdFromRequest(request, supabaseAdmin);
  if (!tenantId) return null;

  const { data: userRow } = await supabaseAdmin
    .from("users")
    .select("name, role")
    .eq("id", userId)
    .maybeSingle<UserRow>();

  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .upsert(
      {
        user_id: userId,
        tenant_id: tenantId,
        role: mapUserRoleToProfile(userRow?.role),
        display_name: userRow?.name ?? null,
      },
      { onConflict: "user_id" }
    )
    .select("tenant_id, role")
    .single();

  if (error || !data?.tenant_id) return null;
  return data;
}
