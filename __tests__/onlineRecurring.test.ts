import { describe, expect, it } from "vitest";
import { nextMonthKey } from "@/lib/online/recurring";

describe("nextMonthKey", () => {
  it("rolls December over to January of the next year", () => {
    expect(nextMonthKey("2026-12")).toBe("2027-01");
  });

  it("increments regular months without changing the year", () => {
    expect(nextMonthKey("2026-03")).toBe("2026-04");
  });
});
