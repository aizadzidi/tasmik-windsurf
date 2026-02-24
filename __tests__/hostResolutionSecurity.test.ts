import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("host resolution trusted forwarding strategy", () => {
  const originalTrusted = process.env.HOST_TRUSTED_PROXY_IPS;
  const originalGlobalTrusted = process.env.TRUSTED_PROXY_IPS;
  const originalTrustAll = process.env.TRUST_X_FORWARDED_HOST;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.HOST_TRUSTED_PROXY_IPS;
    delete process.env.TRUSTED_PROXY_IPS;
    delete process.env.TRUST_X_FORWARDED_HOST;
  });

  it("ignores x-forwarded-host without a trusted proxy signal", async () => {
    const { getRequestHost } = await import("@/lib/hostResolution");
    const request = new Request("https://origin.example.com", {
      headers: {
        host: "origin.example.com",
        "x-forwarded-host": "evil.example.com",
      },
    });

    expect(getRequestHost(request)).toBe("origin.example.com");
  });

  it("trusts managed edge signals for forwarded host", async () => {
    const { getRequestHost } = await import("@/lib/hostResolution");
    const request = new Request("https://origin.example.com", {
      headers: {
        host: "origin.example.com",
        "x-forwarded-host": "tenant.eclazz.com",
        "cf-ray": "abc123",
      },
    });

    expect(getRequestHost(request)).toBe("tenant.eclazz.com");
  });

  it("trusts x-forwarded-host when proxy hop is explicitly trusted", async () => {
    process.env.HOST_TRUSTED_PROXY_IPS = "10.0.0.9";
    const { getRequestHost } = await import("@/lib/hostResolution");
    const request = new Request("https://origin.example.com", {
      headers: {
        host: "origin.example.com",
        "x-forwarded-host": "tenant.eclazz.com",
        "x-forwarded-for": "203.0.113.4, 10.0.0.9",
      },
    });

    expect(getRequestHost(request)).toBe("tenant.eclazz.com");
  });

  afterEach(() => {
    if (typeof originalTrusted === "string") {
      process.env.HOST_TRUSTED_PROXY_IPS = originalTrusted;
    } else {
      delete process.env.HOST_TRUSTED_PROXY_IPS;
    }
    if (typeof originalGlobalTrusted === "string") {
      process.env.TRUSTED_PROXY_IPS = originalGlobalTrusted;
    } else {
      delete process.env.TRUSTED_PROXY_IPS;
    }
    if (typeof originalTrustAll === "string") {
      process.env.TRUST_X_FORWARDED_HOST = originalTrustAll;
    } else {
      delete process.env.TRUST_X_FORWARDED_HOST;
    }
  });
});
