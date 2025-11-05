import { describe, expect, it } from "vitest";
import { formatMurajaahDisplay } from "@/lib/quranMapping";

describe("formatMurajaahDisplay", () => {
  it("returns ending page position within the juz", () => {
    // Juz 6 runs from page 102-121, so ending at page 111 -> 10/20
    expect(formatMurajaahDisplay(107, 111)).toBe("Juz 6 - 10/20");
  });

  it("falls back to single page when pageTo not provided", () => {
    // Page 107 is the 6th page inside Juz 6
    expect(formatMurajaahDisplay(107)).toBe("Juz 6 - 6/20");
  });

  it("handles ranges that cross into the next juz using the ending page", () => {
    // Ending on page 122 enters Juz 7 and is the first page inside that juz
    expect(formatMurajaahDisplay(118, 122)).toBe("Juz 7 - 1/20");
  });

  it("returns null for invalid page numbers", () => {
    expect(formatMurajaahDisplay(0, 0)).toBeNull();
  });
});
