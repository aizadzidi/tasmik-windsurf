import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractTenantSlugFromHost,
  getRequestHost,
  normalizeHost as normalizeHostValue,
} from "@/lib/hostResolution";

type UserRow = {
  name: string | null;
  role: string | null;
};

type UserProfileRow = {
  tenant_id: string | null;
  role: string | null;
};

export class TenantReassignmentError extends Error {
  existingTenantId: string;
  resolvedTenantId: string;

  constructor(params: { existingTenantId: string; resolvedTenantId: string }) {
    super("Cross-tenant profile reassignment attempt was blocked.");
    this.name = "TenantReassignmentError";
    this.existingTenantId = params.existingTenantId;
    this.resolvedTenantId = params.resolvedTenantId;
  }
}

export function normalizeHost(host: string | null) {
  return normalizeHostValue(host);
}

export async function resolveTenantIdFromRequest(
  request: NextRequest,
  supabaseAdmin: SupabaseClient
) {
  const host = getRequestHost(request);
  if (!host) return null;

  const { data: byDomain, error: domainError } = await supabaseAdmin
    .from("tenant_domains")
    .select("tenant_id")
    .eq("domain", host)
    .maybeSingle();
  if (domainError) return null;
  if (byDomain?.tenant_id) return byDomain.tenant_id as string;

  const slug = extractTenantSlugFromHost(host);
  if (!slug) return null;

  const { data: bySlug, error: slugError } = await supabaseAdmin
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (slugError || !bySlug?.id) return null;
  return bySlug.id as string;
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
  const requestHost = getRequestHost(request);
  const tenantId = await resolveTenantIdFromRequest(request, supabaseAdmin);
  if (!tenantId) return null;

  const { data: userRow, error: userError } = await supabaseAdmin
    .from("users")
    .select("name, role")
    .eq("id", userId)
    .maybeSingle<UserRow>();
  if (userError) {
    console.error("Failed to load user row for profile provisioning", userError);
    throw new Error("Failed to load user profile");
  }
  if (!userRow) {
    console.error("User row missing for profile provisioning", { userId });
    throw new Error("User profile not found");
  }

  const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .maybeSingle<UserProfileRow>();
  if (existingProfileError) {
    console.error("Failed to load existing user profile for provisioning", existingProfileError);
    throw new Error("Failed to validate existing profile");
  }
  if (existingProfile?.tenant_id && existingProfile.tenant_id !== tenantId) {
    console.error("Security event: blocked cross-tenant profile reassignment", {
      userId,
      requestHost,
      existingTenantId: existingProfile.tenant_id,
      resolvedTenantId: tenantId,
    });
    throw new TenantReassignmentError({
      existingTenantId: existingProfile.tenant_id,
      resolvedTenantId: tenantId,
    });
  }

  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .upsert(
      {
        user_id: userId,
        tenant_id: tenantId,
        role: mapUserRoleToProfile(userRow.role),
        display_name: userRow.name,
      },
      { onConflict: "user_id" }
    )
    .select("tenant_id, role")
    .single();

  if (error || !data?.tenant_id) return null;
  return data;
}
