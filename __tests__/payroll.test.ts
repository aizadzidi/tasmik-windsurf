import { describe, expect, it } from "vitest";
import {
  countBusinessDays,
  countBusinessDaysInMonth,
  getMonthBounds,
} from "@/lib/dateUtils";
import { roundMoney } from "@/types/payroll";

describe("countBusinessDays", () => {
  it("counts weekdays in a full week", () => {
    // Mon 2026-04-06 to Fri 2026-04-10 = 5 weekdays
    expect(countBusinessDays("2026-04-06", "2026-04-10")).toBe(5);
  });

  it("excludes weekends", () => {
    // Mon 2026-04-06 to Sun 2026-04-12 = 5 weekdays (skip Sat+Sun)
    expect(countBusinessDays("2026-04-06", "2026-04-12")).toBe(5);
  });

  it("returns 0 for weekend-only range", () => {
    // Sat 2026-04-04 to Sun 2026-04-05
    expect(countBusinessDays("2026-04-04", "2026-04-05")).toBe(0);
  });

  it("returns 1 for a single weekday", () => {
    expect(countBusinessDays("2026-04-06", "2026-04-06")).toBe(1);
  });

  it("returns 0 for a single weekend day", () => {
    expect(countBusinessDays("2026-04-04", "2026-04-04")).toBe(0);
  });
});

describe("countBusinessDaysInMonth", () => {
  it("counts days fully within the month", () => {
    const { start, end } = getMonthBounds("2026-04");
    // Leave from Apr 6 (Mon) to Apr 10 (Fri)
    expect(countBusinessDaysInMonth("2026-04-06", "2026-04-10", start, end)).toBe(5);
  });

  it("clamps cross-month leave to month boundaries", () => {
    const { start, end } = getMonthBounds("2026-04");
    // Leave from Mar 28 to Apr 3 - only Apr 1 (Wed), Apr 2 (Thu), Apr 3 (Fri) count
    expect(countBusinessDaysInMonth("2026-03-28", "2026-04-03", start, end)).toBe(3);
  });

  it("returns 0 for leave fully outside the month", () => {
    const { start, end } = getMonthBounds("2026-04");
    // Leave entirely in March
    expect(countBusinessDaysInMonth("2026-03-01", "2026-03-15", start, end)).toBe(0);
  });

  it("handles leave spanning entire month", () => {
    const { start, end } = getMonthBounds("2026-04");
    // Leave from Mar 1 to May 31 - count all April weekdays
    const result = countBusinessDaysInMonth("2026-03-01", "2026-05-31", start, end);
    expect(result).toBe(22); // April 2026 has 22 weekdays
  });

  it("handles leave ending on weekend within month", () => {
    const { start, end } = getMonthBounds("2026-04");
    // Apr 1 (Wed) to Apr 5 (Sun) - 3 weekdays (Wed, Thu, Fri)
    expect(countBusinessDaysInMonth("2026-04-01", "2026-04-05", start, end)).toBe(3);
  });
});

describe("roundMoney", () => {
  it("rounds to 2 decimal places", () => {
    expect(roundMoney(100.555)).toBe(100.56);
    expect(roundMoney(100.554)).toBe(100.55);
    expect(roundMoney(100.5)).toBe(100.5);
  });

  it("handles typical EPF calculation", () => {
    // 3000 * 11% = 330.00 exactly
    expect(roundMoney(3000 * 11 / 100)).toBe(330.0);
  });

  it("handles SOCSO calculation with float precision", () => {
    // 3000 * 0.5% = 15.00
    expect(roundMoney(3000 * 0.5 / 100)).toBe(15.0);
  });

  it("handles EIS calculation", () => {
    // 3000 * 0.2% = 6.00
    expect(roundMoney(3000 * 0.2 / 100)).toBe(6.0);
  });

  it("handles daily rate with repeating decimals", () => {
    // 3000 / 22 = 136.363636...
    expect(roundMoney(3000 / 22)).toBe(136.36);
  });

  it("handles zero", () => {
    expect(roundMoney(0)).toBe(0);
  });
});

describe("payroll calculation", () => {
  const calculate = (basic: number, workingDays: number, uplDays: number, customDeduction: number) => {
    const dailyRate = roundMoney(basic / workingDays);
    const totalAllowances = 0;
    const grossSalary = roundMoney(basic + totalAllowances);
    const uplDeduction = roundMoney(dailyRate * uplDays);
    const epfEmployee = roundMoney(basic * 11 / 100);
    const socsoEmployee = roundMoney(basic * 0.5 / 100);
    const eisEmployee = roundMoney(basic * 0.2 / 100);
    const totalDeductions = roundMoney(epfEmployee + socsoEmployee + eisEmployee + uplDeduction + customDeduction);
    const netSalary = roundMoney(grossSalary - totalDeductions);
    return { dailyRate, grossSalary, uplDeduction, epfEmployee, socsoEmployee, eisEmployee, totalDeductions, netSalary };
  };

  it("calculates basic payroll correctly", () => {
    const result = calculate(3000, 22, 0, 0);
    expect(result.dailyRate).toBe(136.36);
    expect(result.grossSalary).toBe(3000);
    expect(result.epfEmployee).toBe(330);
    expect(result.socsoEmployee).toBe(15);
    expect(result.eisEmployee).toBe(6);
    expect(result.totalDeductions).toBe(351);
    expect(result.netSalary).toBe(2649);
  });

  it("handles UPL deduction", () => {
    const result = calculate(3000, 22, 2, 0);
    expect(result.uplDeduction).toBe(272.72); // 136.36 * 2
    expect(result.totalDeductions).toBe(623.72);
    expect(result.netSalary).toBe(2376.28);
  });

  it("handles custom deduction", () => {
    const result = calculate(3000, 22, 0, 100);
    expect(result.totalDeductions).toBe(451);
    expect(result.netSalary).toBe(2549);
  });

  it("handles zero salary", () => {
    const result = calculate(0, 22, 0, 0);
    expect(result.dailyRate).toBe(0);
    expect(result.grossSalary).toBe(0);
    expect(result.netSalary).toBe(0);
  });

  it("can produce negative net salary", () => {
    // Salary 500, UPL 20 days = 454.40 deduction, plus statutory
    const result = calculate(500, 22, 20, 0);
    expect(result.netSalary).toBeLessThan(0);
  });
});

describe("getMonthBounds", () => {
  it("returns correct bounds for a regular month", () => {
    const { start, end } = getMonthBounds("2026-04");
    expect(start.toISOString().split("T")[0]).toBe("2026-04-01");
    expect(end.toISOString().split("T")[0]).toBe("2026-04-30");
  });

  it("handles February in non-leap year", () => {
    const { start, end } = getMonthBounds("2026-02");
    expect(start.toISOString().split("T")[0]).toBe("2026-02-01");
    expect(end.toISOString().split("T")[0]).toBe("2026-02-28");
  });

  it("handles December to January boundary", () => {
    const { start, end } = getMonthBounds("2026-12");
    expect(start.toISOString().split("T")[0]).toBe("2026-12-01");
    expect(end.toISOString().split("T")[0]).toBe("2026-12-31");
  });
});
