import { describe, expect, it } from "vitest";
import {
  getProgramTypesForTeacherInviteScope,
  normalizeStaffInviteRole,
  normalizeTeacherInviteScope,
  validateTeacherInviteScope,
} from "@/lib/staffInvites";

describe("staff invite helpers", () => {
  it("normalizes supported invite roles and scopes", () => {
    expect(normalizeStaffInviteRole("teacher")).toBe("teacher");
    expect(normalizeStaffInviteRole("general_worker")).toBe("general_worker");
    expect(normalizeStaffInviteRole("admin")).toBeNull();

    expect(normalizeTeacherInviteScope("campus")).toBe("campus");
    expect(normalizeTeacherInviteScope("online")).toBe("online");
    expect(normalizeTeacherInviteScope("mixed")).toBeNull();
  });

  it("validates teacher scope rules", () => {
    expect(validateTeacherInviteScope("teacher", null)).toBe(
      "Teacher invites require a scope."
    );
    expect(validateTeacherInviteScope("general_worker", "campus")).toBe(
      "Only teacher invites can include a scope."
    );
    expect(validateTeacherInviteScope("teacher", "online")).toBeNull();
  });

  it("maps teacher invite scopes to program types", () => {
    expect(getProgramTypesForTeacherInviteScope("campus")).toEqual(["campus"]);
    expect(getProgramTypesForTeacherInviteScope("online")).toEqual(["online"]);
  });
});
