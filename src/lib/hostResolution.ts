import type { NextRequest } from "next/server";

export const LEGACY_SCHOOL_HOST = "class.akademialkhayr.com";
const DEFAULT_TENANT_BASE_DOMAIN = "eclazz.com";

function stripPort(value: string): string {
  return value.split(":")[0]?.trim().toLowerCase() ?? "";
}

export function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const normalized = stripPort(host);
  return normalized.length > 0 ? normalized : null;
}

function parseHosts(rawValue: string | null | undefined): Set<string> {
  const hosts = new Set<string>();
  (rawValue ?? "")
    .split(",")
    .map((value) => normalizeHost(value))
    .filter((value): value is string => Boolean(value))
    .forEach((value) => hosts.add(value));
  return hosts;
}

export function getTenantSubdomainBaseDomain(): string {
  return normalizeHost(process.env.TENANT_SUBDOMAIN_BASE_DOMAIN) ?? DEFAULT_TENANT_BASE_DOMAIN;
}

export function getMarketingHosts(): Set<string> {
  const hosts = parseHosts(process.env.APP_MARKETING_HOSTS);
  hosts.add(getTenantSubdomainBaseDomain());
  hosts.add("localhost");
  hosts.add("127.0.0.1");
  return hosts;
}

export function getRequestHost(request: NextRequest | Request): string | null {
  const forwardedHost = normalizeHost(request.headers.get("x-forwarded-host"));
  if (forwardedHost) return forwardedHost;

  const hostHeader = normalizeHost(request.headers.get("host"));
  if (hostHeader) return hostHeader;

  return normalizeHost(new URL(request.url).hostname);
}

export function isLegacySchoolHost(host: string | null): boolean {
  return host === LEGACY_SCHOOL_HOST;
}

export function isMarketingHost(host: string | null): boolean {
  if (!host) return false;
  return getMarketingHosts().has(host);
}

export function isTenantSubdomainHost(host: string | null): boolean {
  if (!host) return false;
  const baseDomain = getTenantSubdomainBaseDomain();
  return host !== baseDomain && host.endsWith(`.${baseDomain}`);
}

export function extractTenantSlugFromHost(host: string | null): string | null {
  if (!host || !isTenantSubdomainHost(host)) return null;
  const baseDomain = getTenantSubdomainBaseDomain();
  const suffix = `.${baseDomain}`;
  const slug = host.slice(0, -suffix.length).trim().toLowerCase();
  if (!slug || slug.includes(".")) return null;
  if (!/^[a-z0-9-]{3,63}$/.test(slug)) return null;
  if (slug === "www" || slug === "app" || slug === "api") return null;
  return slug;
}

export function isPublicSaasRegistrationHost(host: string | null): boolean {
  if (!host) return false;
  return isMarketingHost(host);
}

