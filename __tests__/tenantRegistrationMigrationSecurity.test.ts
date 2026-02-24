import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "2026-02-23_tenant_registration_security_hardening.sql"
);
const migrationSql = readFileSync(migrationPath, "utf8");

describe("tenant registration SQL security assertions", () => {
  it("enforces slug collision protection without mutating existing tenants", () => {
    expect(migrationSql).toMatch(/ON CONFLICT \(slug\) DO NOTHING/i);
    expect(migrationSql).not.toMatch(/ON CONFLICT \(slug\)\s+DO UPDATE/i);
    expect(migrationSql).toMatch(/Tenant slug already assigned to another tenant/i);
    expect(migrationSql).toMatch(/Idempotency key replay mismatch/i);
  });

  it("contains legacy-safe onboarding/subscription/limit backfills", () => {
    expect(migrationSql).toMatch(/INSERT INTO public\.tenant_signup_requests/i);
    expect(migrationSql).toMatch(/INSERT INTO public\.tenant_subscription_states/i);
    expect(migrationSql).toMatch(/INSERT INTO public\.tenant_plan_limit_states/i);
    expect(migrationSql).toMatch(/legacy-backfill:/i);
  });

  it("derives plan limits from canonical catalog instead of hardcoded cap", () => {
    expect(migrationSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.tenant_plan_catalog/i);
    expect(migrationSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.check_tenant_plan_limit[\s\S]*?FROM public\.tenant_plan_catalog c/i
    );
    expect(migrationSql).toMatch(/student_staff_cap = v_cap/i);
    expect(migrationSql).not.toMatch(/v_cap\s+INTEGER\s*:=\s*2000/i);
  });

  it("revokes function execute grants from anon and authenticated roles", () => {
    const targets = [
      "find_auth_user_id_by_email\\(TEXT\\)",
      "bootstrap_tenant_self_serve\\(",
      "start_tenant_trial_on_first_admin_login\\(UUID, UUID\\)",
      "check_tenant_plan_limit\\(UUID, INTEGER, INTEGER\\)",
      "check_rate_limit\\(TEXT, INTEGER, INTEGER\\)",
    ];

    for (const target of targets) {
      expect(migrationSql).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${target}[\\s\\S]*?FROM PUBLIC`, "i")
      );
      expect(migrationSql).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${target}[\\s\\S]*?FROM anon`, "i")
      );
      expect(migrationSql).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${target}[\\s\\S]*?FROM authenticated`, "i")
      );
      expect(migrationSql).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${target}[\\s\\S]*TO service_role`, "i")
      );
    }
  });
});
