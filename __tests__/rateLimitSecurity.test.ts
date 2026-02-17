import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("rate-limit trusted proxy strategy", () => {
  const originalTrusted = process.env.RATE_LIMIT_TRUSTED_PROXY_IPS;
  const originalTrustRealIp = process.env.RATE_LIMIT_TRUST_X_REAL_IP;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.RATE_LIMIT_TRUSTED_PROXY_IPS;
    delete process.env.RATE_LIMIT_TRUST_X_REAL_IP;
  });

  it("ignores x-forwarded-for chain from untrusted proxy", async () => {
    const { getClientIp } = await import("@/lib/rateLimit");
    const request = new Request("https://example.test", {
      headers: {
        "x-forwarded-for": "203.0.113.8, 10.0.0.9",
      },
    });

    expect(getClientIp(request)).toBe("unknown");
  });

  it("accepts x-forwarded-for only when last hop is trusted proxy", async () => {
    process.env.RATE_LIMIT_TRUSTED_PROXY_IPS = "10.0.0.9";
    const { getClientIp } = await import("@/lib/rateLimit");
    const request = new Request("https://example.test", {
      headers: {
        "x-forwarded-for": "203.0.113.8, 10.0.0.9",
      },
    });

    expect(getClientIp(request)).toBe("203.0.113.8");
  });

  it("still trusts managed edge headers with platform markers", async () => {
    const { getClientIp } = await import("@/lib/rateLimit");
    const request = new Request("https://example.test", {
      headers: {
        "cf-ray": "abc",
        "cf-connecting-ip": "198.51.100.12",
      },
    });

    expect(getClientIp(request)).toBe("198.51.100.12");
  });

  afterEach(() => {
    if (typeof originalTrusted === "string") {
      process.env.RATE_LIMIT_TRUSTED_PROXY_IPS = originalTrusted;
    } else {
      delete process.env.RATE_LIMIT_TRUSTED_PROXY_IPS;
    }
    if (typeof originalTrustRealIp === "string") {
      process.env.RATE_LIMIT_TRUST_X_REAL_IP = originalTrustRealIp;
    } else {
      delete process.env.RATE_LIMIT_TRUST_X_REAL_IP;
    }
  });
});
