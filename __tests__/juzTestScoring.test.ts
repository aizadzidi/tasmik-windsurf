import { describe, expect, it } from "vitest";
import {
  calculateNormalModeScore,
  createNormalQuestionMap,
  getNormalQuestionCount,
  normalizeJuzTestMode
} from "@/lib/juzTestScoring";

describe("juzTestScoring", () => {
  it("normalizes unknown mode to pmmm", () => {
    expect(normalizeJuzTestMode(undefined)).toBe("pmmm");
    expect(normalizeJuzTestMode("anything")).toBe("pmmm");
    expect(normalizeJuzTestMode("normal_memorization")).toBe("normal_memorization");
  });

  it("normal mode question count is 4 for juz, 2 for hizb", () => {
    expect(getNormalQuestionCount(false)).toBe(4);
    expect(getNormalQuestionCount(true)).toBe(2);
  });

  it("builds deterministic 5-page capped blocks", () => {
    const map = createNormalQuestionMap({
      pageFrom: 582,
      pageTo: 604,
      isHizbTest: false
    });

    expect(map["1"]).toMatchObject({ block_from: 582, block_to: 586 });
    expect(map["4"]).toMatchObject({ block_from: 600, block_to: 604 });
  });

  it("calculates 4+1 normal score and pass threshold", () => {
    const result = calculateNormalModeScore(false, {
      "1": { hafazan: 2, quality: 1 },
      "2": { hafazan: 2, quality: 1 },
      "3": { hafazan: 2, quality: 1 },
      "4": { hafazan: 2, quality: 1 }
    });

    expect(result.totalPercentage).toBe(60);
    expect(result.passed).toBe(true);
    expect(result.memorization["1"]).toBe(3);
  });
});
