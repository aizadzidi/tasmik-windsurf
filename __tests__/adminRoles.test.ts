import { describe, expect, it } from "vitest";
import { isGlobalAdminRole, isTenantAdminRole } from "@/lib/adminRoles";

describe("admin role helpers", () => {
  it("recognizes global admins from the users table", () => {
    expect(isGlobalAdminRole("admin")).toBe(true);
    expect(isGlobalAdminRole("school_admin")).toBe(false);
    expect(isGlobalAdminRole("teacher")).toBe(false);
    expect(isGlobalAdminRole(null)).toBe(false);
  });

  it("recognizes current and legacy tenant admin profile roles", () => {
    expect(isTenantAdminRole("school_admin")).toBe(true);
    expect(isTenantAdminRole("admin")).toBe(true);
    expect(isTenantAdminRole("teacher")).toBe(false);
    expect(isTenantAdminRole(undefined)).toBe(false);
  });
});
