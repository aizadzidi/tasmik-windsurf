import { describe, expect, it } from "vitest";
import { getMurajaahTestResultBadge } from "@/lib/murajaahMode";

describe("getMurajaahTestResultBadge", () => {
  it("returns pass state with green badge for known passing score", () => {
    expect(
      getMurajaahTestResultBadge({
        total_percentage: 86,
        passed: true,
      })
    ).toEqual({
      state: "pass",
      label: "86% PASS",
      className: "bg-green-100 text-green-800",
    });
  });

  it("returns fail state with red badge for known failing score", () => {
    expect(
      getMurajaahTestResultBadge({
        total_percentage: 42,
        passed: false,
      })
    ).toEqual({
      state: "fail",
      label: "42% FAIL",
      className: "bg-red-100 text-red-700",
    });
  });

  it("returns unknown neutral badge when assessment is missing", () => {
    expect(getMurajaahTestResultBadge(null)).toEqual({
      state: "unknown",
      label: "-",
      className: "bg-gray-100 text-gray-700",
    });
  });

  it("returns unknown neutral badge when pass/fail status is missing", () => {
    expect(
      getMurajaahTestResultBadge({
        total_percentage: 75,
      })
    ).toEqual({
      state: "unknown",
      label: "-",
      className: "bg-gray-100 text-gray-700",
    });
  });
});
