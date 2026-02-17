import { describe, expect, it } from "vitest";
import {
  computeNewMurajaahRange,
  DEFAULT_NEW_MURAJAAH_LAST_N
} from "@/lib/murajaahRange";

describe("computeNewMurajaahRange", () => {
  it("computes latest tasmi + last N window", () => {
    const result = computeNewMurajaahRange({
      sourceMode: "latest_tasmi",
      rangeMode: "last_n",
      latestTasmiPage: 136,
      specificPage: null,
      lastN: DEFAULT_NEW_MURAJAAH_LAST_N,
      manualFrom: null,
      manualTo: null
    });

    expect(result.isValid).toBe(true);
    expect(result.pageFrom).toBe(134);
    expect(result.pageTo).toBe(136);
    expect(result.count).toBe(3);
    expect(result.juz).toBe(7);
  });

  it("computes specific page + manual range", () => {
    const result = computeNewMurajaahRange({
      sourceMode: "specific_page",
      rangeMode: "manual_range",
      latestTasmiPage: null,
      specificPage: 130,
      lastN: null,
      manualFrom: 122,
      manualTo: 126
    });

    expect(result.isValid).toBe(true);
    expect(result.pageFrom).toBe(122);
    expect(result.pageTo).toBe(126);
    expect(result.count).toBe(5);
    expect(result.juz).toBe(7);
  });

  it("fails when latest tasmi is unavailable", () => {
    const result = computeNewMurajaahRange({
      sourceMode: "latest_tasmi",
      rangeMode: "last_n",
      latestTasmiPage: null,
      specificPage: null,
      lastN: 3,
      manualFrom: null,
      manualTo: null
    });

    expect(result.isValid).toBe(false);
    expect(result.error).toContain("Latest tasmi page");
  });

  it("fails when manual range is reversed", () => {
    const result = computeNewMurajaahRange({
      sourceMode: "specific_page",
      rangeMode: "manual_range",
      latestTasmiPage: null,
      specificPage: 200,
      lastN: null,
      manualFrom: 150,
      manualTo: 140
    });

    expect(result.isValid).toBe(false);
    expect(result.error).toContain("less than or equal");
  });

  it("fails when manual range exceeds max span", () => {
    const result = computeNewMurajaahRange({
      sourceMode: "specific_page",
      rangeMode: "manual_range",
      latestTasmiPage: null,
      specificPage: 200,
      lastN: null,
      manualFrom: 100,
      manualTo: 130
    });

    expect(result.isValid).toBe(false);
    expect(result.error).toContain("cannot exceed");
  });
});
