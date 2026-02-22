import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getRequestHost, getTenantSubdomainBaseDomain } from "@/lib/hostResolution";
import { getSupabaseAdminClient } from "@/lib/supabaseAdminClient";
import {
  assertPublicRegistrationHost,
  hashForRateLimit,
  isValidSlug,
  jsonError,
  normalizeSlug,
} from "@/lib/publicApi";

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const host = getRequestHost(request);
  if (!assertPublicRegistrationHost(host)) {
    return jsonError(requestId, {
      error: "Slug availability is only available on the SaaS onboarding host.",
      code: "HOST_NOT_ALLOWED",
      status: 403,
    });
  }

  const { searchParams } = new URL(request.url);
  const rawSlug = searchParams.get("slug") ?? "";
  const slug = normalizeSlug(rawSlug);
  if (!isValidSlug(slug)) {
    return jsonError(requestId, {
      error: "slug must be 3-63 chars, lowercase letters, numbers, and hyphens only.",
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }

  const rateKey = hashForRateLimit(slug);
  const rate = await enforceRateLimit({
    key: `public:slug-availability:${rateKey}`,
    limit: 40,
    windowMs: 60 * 1000,
  });
  if (!rate.allowed) {
    return jsonError(requestId, {
      error: "Too many checks. Please retry later.",
      code: "RATE_LIMITED",
      status: 429,
      extra: { retry_after_seconds: rate.retryAfterSeconds },
    });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const baseDomain = getTenantSubdomainBaseDomain();
  const fqdn = `${slug}.${baseDomain}`;

  const [{ data: tenantRow, error: tenantError }, { data: domainRow, error: domainError }] =
    await Promise.all([
      supabaseAdmin.from("tenants").select("id").eq("slug", slug).maybeSingle(),
      supabaseAdmin.from("tenant_domains").select("id").eq("domain", fqdn).maybeSingle(),
    ]);

  if (tenantError || domainError) {
    return jsonError(requestId, {
      error: "Unable to verify slug availability.",
      code: "SLUG_LOOKUP_FAILED",
      status: 500,
    });
  }

  const available = !tenantRow?.id && !domainRow?.id;
  return NextResponse.json({
    ok: true,
    request_id: requestId,
    slug,
    domain: fqdn,
    available,
  });
}

