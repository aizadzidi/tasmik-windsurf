import { describe, expect, it } from "vitest";
import { isReservedTenantSlug, isValidSlug } from "@/lib/publicApi";
import { getTenantPlanCap, resolveTenantPlanCode } from "@/lib/tenantPlans";

describe("tenant registration validation helpers", () => {
  it("rejects reserved slugs even when slug format is valid", () => {
    expect(isValidSlug("api")).toBe(true);
    expect(isReservedTenantSlug("api")).toBe(true);
    expect(isReservedTenantSlug("acme-school")).toBe(false);
  });

  it("validates canonical plan codes and derives caps", () => {
    expect(resolveTenantPlanCode(undefined)).toBe("enterprise");
    expect(resolveTenantPlanCode("growth")).toBe("growth");
    expect(resolveTenantPlanCode("ENTERPRISE")).toBe("enterprise");
    expect(resolveTenantPlanCode("unknown-plan")).toBeNull();
    expect(getTenantPlanCap("starter")).toBe(300);
    expect(getTenantPlanCap("growth")).toBe(1000);
    expect(getTenantPlanCap("enterprise")).toBe(2000);
  });
});
