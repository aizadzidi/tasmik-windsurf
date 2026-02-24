import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "2026-02-23_fix_bootstrap_tenant_id_ambiguity.sql"
);
const migrationSql = readFileSync(migrationPath, "utf8");

describe("tenant bootstrap ambiguity hotfix", () => {
  it("qualifies tenant_domains tenant_id to avoid plpgsql variable ambiguity", () => {
    expect(migrationSql).toMatch(/#variable_conflict use_column/i);

    expect(migrationSql).toMatch(
      /UPDATE public\.tenant_domains AS td[\s\S]*SET is_primary = \(td\.domain = v_domain\)[\s\S]*WHERE td\.tenant_id = v_tenant_id;/i
    );

    expect(migrationSql).not.toMatch(
      /UPDATE public\.tenant_domains[\s\S]*SET is_primary = \(domain = v_domain\)[\s\S]*WHERE tenant_id = v_tenant_id;/i
    );
  });

  it("re-links retryable signup rows when tenant was created before a prior failure", () => {
    expect(migrationSql).toMatch(
      /IF v_signup_tenant_id IS NULL THEN[\s\S]*v_signup_tenant_id := v_existing_tenant_id;/i
    );
  });
});
