import type { NextRequest } from "next/server";

export const LEGACY_SCHOOL_HOST = "class.akademialkhayr.com";
const DEFAULT_TENANT_BASE_DOMAIN = "eclazz.com";

function stripPort(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("[")) {
    const closing = trimmed.indexOf("]");
    if (closing > 0) {
      return trimmed.slice(1, closing).trim().toLowerCase();
    }
  }
  const firstColon = trimmed.indexOf(":");
  const lastColon = trimmed.lastIndexOf(":");
  if (firstColon > -1 && firstColon === lastColon) {
    return trimmed.slice(0, firstColon).trim().toLowerCase();
  }
  return trimmed.toLowerCase();
}

export function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const normalized = stripPort(host.split(",")[0] ?? "");
  return normalized.length > 0 ? normalized : null;
}

function normalizeFirstHeaderValue(value: string | null): string | null {
  return normalizeHost(value?.split(",")[0] ?? null);
}

function sanitizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  if (!first) return null;
  const withoutPort = first.replace(/^\[?([A-Fa-f0-9:.]+)\]?(:\d+)?$/, "$1");
  if (!/^[A-Fa-f0-9:.]+$/.test(withoutPort)) return null;
  if (withoutPort.length > 64) return null;
  return withoutPort;
}

function parseTrustedProxyIps(): Set<string> {
  const trusted = new Set<string>();
  const raw = process.env.HOST_TRUSTED_PROXY_IPS ?? process.env.TRUSTED_PROXY_IPS ?? "";
  raw
    .split(",")
    .map((value) => sanitizeIp(value))
    .filter((value): value is string => Boolean(value))
    .forEach((value) => trusted.add(value));
  return trusted;
}

function hasTrustedForwardedProxy(request: NextRequest | Request): boolean {
  const chainRaw = request.headers.get("x-forwarded-for");
  if (!chainRaw) return false;
  const chain = chainRaw
    .split(",")
    .map((value) => sanitizeIp(value))
    .filter((value): value is string => Boolean(value));
  if (chain.length === 0) return false;
  const lastHop = chain[chain.length - 1];
  if (!lastHop) return false;
  return parseTrustedProxyIps().has(lastHop);
}

function canTrustForwardedHost(request: NextRequest | Request): boolean {
  if ((process.env.TRUST_X_FORWARDED_HOST ?? "").toLowerCase() === "true") return true;
  if (request.headers.get("x-vercel-id")) return true;
  if (request.headers.get("cf-ray")) return true;
  if (request.headers.get("fly-region")) return true;
  return hasTrustedForwardedProxy(request);
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
  if (canTrustForwardedHost(request)) {
    const forwardedHost = normalizeFirstHeaderValue(request.headers.get("x-forwarded-host"));
    if (forwardedHost) return forwardedHost;
  }

  const hostHeader = normalizeFirstHeaderValue(request.headers.get("host"));
  if (hostHeader) return hostHeader;

  try {
    return normalizeHost(new URL(request.url).hostname);
  } catch {
    return null;
  }
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
