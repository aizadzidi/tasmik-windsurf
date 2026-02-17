type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const memoryStore = new Map<string, RateLimitEntry>();
const trustedProxyIps = new Set<string>(
  (process.env.RATE_LIMIT_TRUSTED_PROXY_IPS ?? process.env.TRUSTED_PROXY_IPS ?? "")
    .split(",")
    .map((value) => sanitizeIp(value))
    .filter((value): value is string => Boolean(value))
);

let dbLimiterDisabledUntil = 0;
let dbLimiterFailureCount = 0;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

function sanitizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  if (!first) return null;
  const withoutPort = first.replace(/^\[?([A-Fa-f0-9:.]+)\]?(:\d+)?$/, "$1");
  if (!/^[A-Fa-f0-9:.]+$/.test(withoutPort)) return null;
  if (withoutPort.length > 64) return null;
  return withoutPort;
}

async function enforceDbRateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult | null> {
  if (Date.now() < dbLimiterDisabledUntil) return null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { supabaseService } = await import("@/lib/supabaseServiceClient");
      const { data, error } = await supabaseService.rpc("check_rate_limit", {
        p_key: params.key,
        p_limit: params.limit,
        p_window_seconds: Math.max(1, Math.ceil(params.windowMs / 1000)),
      });

      if (error) {
        const message = (error.message ?? "").toLowerCase();
        const shouldRetry =
          attempt === 0 &&
          !(
            (message.includes("check_rate_limit") && message.includes("function")) ||
            message.includes("permission denied")
          );
        if (shouldRetry) {
          await new Promise((resolve) => setTimeout(resolve, 80));
          continue;
        }

        dbLimiterFailureCount += 1;
        const backoffMs = message.includes("check_rate_limit") && message.includes("function")
          ? 5 * 60 * 1000
          : Math.min(5 * 60 * 1000, 15_000 * 2 ** Math.min(dbLimiterFailureCount, 5));
        dbLimiterDisabledUntil = Date.now() + backoffMs;
        console.error("DB rate limit check failed:", error);
        return null;
      }

      const row =
        Array.isArray(data) && data.length > 0
          ? (data[0] as Record<string, unknown>)
          : (data as Record<string, unknown> | null);
      if (!row) return null;

      const allowed = row.allowed === true;
      const remaining = Number(row.remaining);
      const retryAfterSeconds = Number(row.retry_after_seconds);
      if (!Number.isFinite(remaining) || !Number.isFinite(retryAfterSeconds)) {
        return null;
      }

      dbLimiterFailureCount = 0;
      dbLimiterDisabledUntil = 0;
      return {
        allowed,
        remaining: Math.max(0, Math.trunc(remaining)),
        retryAfterSeconds: Math.max(1, Math.trunc(retryAfterSeconds)),
      };
    } catch (error) {
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 80));
        continue;
      }

      dbLimiterFailureCount += 1;
      dbLimiterDisabledUntil =
        Date.now() + Math.min(5 * 60 * 1000, 15_000 * 2 ** Math.min(dbLimiterFailureCount, 5));
      console.error("DB rate limit fallback to memory:", error);
      return null;
    }
  }

  return null;
}

export async function enforceRateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  const dbResult = await enforceDbRateLimit(params);
  if (dbResult) return dbResult;

  const now = Date.now();
  const { key, limit, windowMs } = params;

  const existing = memoryStore.get(key);
  if (!existing || now >= existing.resetAt) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      remaining: Math.max(limit - 1, 0),
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  const nextCount = existing.count + 1;
  existing.count = nextCount;
  memoryStore.set(key, existing);

  const remaining = Math.max(limit - nextCount, 0);
  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));

  return {
    allowed: nextCount <= limit,
    remaining,
    retryAfterSeconds,
  };
}

export function getClientIp(request: Request): string {
  const vercelForwarded = sanitizeIp(request.headers.get("x-vercel-forwarded-for"));
  if (vercelForwarded && request.headers.get("x-vercel-id")) {
    return vercelForwarded;
  }

  const cfConnecting = sanitizeIp(request.headers.get("cf-connecting-ip"));
  if (cfConnecting && request.headers.get("cf-ray")) {
    return cfConnecting;
  }

  const flyClient = sanitizeIp(request.headers.get("fly-client-ip"));
  if (flyClient && request.headers.get("fly-region")) {
    return flyClient;
  }

  const forwardedForRaw = request.headers.get("x-forwarded-for");
  if (forwardedForRaw) {
    const chain = forwardedForRaw
      .split(",")
      .map((value) => sanitizeIp(value))
      .filter((value): value is string => Boolean(value));
    if (chain.length > 0) {
      const lastHop = chain[chain.length - 1];
      const isTrustedProxyHop = Boolean(lastHop && trustedProxyIps.has(lastHop));
      if (isTrustedProxyHop) {
        return chain[0]!;
      }
    }
  }

  if ((process.env.RATE_LIMIT_TRUST_X_REAL_IP ?? "").toLowerCase() === "true") {
    const realIp = sanitizeIp(request.headers.get("x-real-ip"));
    if (realIp) return realIp;
  }

  return "unknown";
}
