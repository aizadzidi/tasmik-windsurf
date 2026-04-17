import { describe, expect, it } from "vitest";
import {
  resolveParentProgramScope,
  resolveTeacherProgramScope,
} from "@/lib/programScope";

describe("program scope helpers", () => {
  it("treats teachers with no assignments as unknown", () => {
    expect(resolveTeacherProgramScope([])).toBe("unknown");
  });

  it("keeps parent fallback as campus when no programs are found", () => {
    expect(resolveParentProgramScope([])).toBe("campus");
  });

  it("resolves mixed only when online is combined with another program type", () => {
    expect(resolveTeacherProgramScope(["online", "campus"])).toBe("mixed");
    expect(resolveTeacherProgramScope(["online", "hybrid"])).toBe("mixed");
    expect(resolveTeacherProgramScope(["online"])).toBe("online");
    expect(resolveTeacherProgramScope(["campus"])).toBe("campus");
  });
});
