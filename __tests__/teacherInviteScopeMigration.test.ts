import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const migrationSql = readFileSync(
  join(process.cwd(), "migrations", "2026-04-16_add_teacher_scope_to_invites.sql"),
  "utf8"
);

describe("teacher invite scope migration", () => {
  it("adds the teacher_scope column and restricts allowed values", () => {
    expect(migrationSql).toMatch(/add column if not exists teacher_scope text/i);
    expect(migrationSql).toMatch(
      /check \(teacher_scope is null or teacher_scope in \('campus', 'online'\)\) not valid/i
    );
  });

  it("enforces role-specific scope rules for future rows", () => {
    expect(migrationSql).toMatch(
      /\(target_role = 'teacher' and teacher_scope is not null\)/i
    );
    expect(migrationSql).toMatch(
      /\(target_role = 'general_worker' and teacher_scope is null\)/i
    );
    expect(migrationSql).toMatch(/not valid/i);
  });
});
