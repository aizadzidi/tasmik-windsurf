import type { Report } from "@/types/teacher";
import { calculateAverageGrade, getWeekBoundaries } from "@/lib/gradeUtils";
import {
  getMurajaahModeFromReport,
  getMurajaahModeLabel,
  getMurajaahTestAssessmentFromReport
} from "@/lib/murajaahMode";

export interface WeeklyReportSummary {
  weekKey: string;
  weekLabel: string;
  weekRange: string;
  monthLabel: string;
  typeLabel: string;
  modeDisplay: string;
  surahDisplay: string;
  juzDisplay: string;
  ayatDisplay: string;
  pageDisplay: string;
  grade: string | null;
}

const formatWeekLabelFromMonday = (mondayDate: Date) => {
  const weekIndex = Math.floor((mondayDate.getDate() - 1) / 7) + 1;
  const monthName = mondayDate.toLocaleDateString("en-US", { month: "short" });
  return `W${weekIndex} ${monthName}`;
};

const formatWeekRangeFromBoundaries = (mondayDate: Date, fridayDate: Date) => {
  const startMonth = mondayDate.toLocaleDateString("en-US", { month: "short" });
  const endMonth = fridayDate.toLocaleDateString("en-US", { month: "short" });
  const startYear = mondayDate.getFullYear();
  const endYear = fridayDate.getFullYear();

  if (startMonth === endMonth && startYear === endYear) {
    return `${mondayDate.getDate()}-${fridayDate.getDate()} ${startMonth} ${startYear}`;
  }

  if (startYear === endYear) {
    return `${mondayDate.getDate()} ${startMonth}-${fridayDate.getDate()} ${endMonth} ${startYear}`;
  }

  return `${mondayDate.getDate()} ${startMonth} ${startYear}-${fridayDate.getDate()} ${endMonth} ${endYear}`;
};

export const formatWeekLabel = (date: Date | string) => {
  const { monday } = getWeekBoundaries(date);
  return formatWeekLabelFromMonday(new Date(monday));
};

export const formatWeekRange = (date: Date | string) => {
  const { monday, friday } = getWeekBoundaries(date);
  return formatWeekRangeFromBoundaries(new Date(monday), new Date(friday));
};

export const formatGradeLabel = (grade: string | null) => {
  if (!grade) return "-";
  const normalized = grade.trim();
  if (/^\d+%\s+(PASS|FAIL)$/i.test(normalized)) {
    return normalized.toUpperCase();
  }
  return grade
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
};

const getReportPageRange = (report: Report) => {
  const pageValues = [report.page_from, report.page_to].filter(
    (value): value is number => typeof value === "number" && !Number.isNaN(value)
  );
  if (pageValues.length === 0) return null;
  const minPage = Math.min(...pageValues);
  const maxPage = Math.max(...pageValues);
  return { minPage, maxPage };
};

export const summarizeReportsByWeek = (
  reports: Report[],
  typeLabel: string
): WeeklyReportSummary[] => {
  const grouped = new Map<
    string,
    { monday: string; friday: string; items: Report[] }
  >();

  reports.forEach((report) => {
    const { monday, friday } = getWeekBoundaries(report.date);
    const entry = grouped.get(monday) ?? { monday, friday, items: [] };
    entry.items.push(report);
    grouped.set(monday, entry);
  });

  const summaries = Array.from(grouped.values()).map((group) => {
    const TEST_PASS_THRESHOLD_DEFAULT = 60;
    const sorted = [...group.items].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const surahSet = new Set(
      sorted.map((report) => report.surah).filter(Boolean)
    );
    const modeValues = sorted
      .map((report) => getMurajaahModeFromReport(report))
      .filter((value): value is "recitation" | "test" => value !== null);
    const modeDisplay = (() => {
      if (modeValues.length === 0) return "-";
      const unique = Array.from(new Set(modeValues));
      if (unique.length === 1) return getMurajaahModeLabel(unique[0]);
      return "Mixed";
    })();
    const testAssessments = sorted
      .map((report) => (
        getMurajaahModeFromReport(report) === "test"
          ? getMurajaahTestAssessmentFromReport(report)
          : null
      ))
      .filter((assessment): assessment is NonNullable<typeof assessment> => Boolean(assessment));
    const isAllTestRecords = sorted.length > 0 && testAssessments.length === sorted.length;
    const firstReport = sorted[0];
    const lastReport = sorted[sorted.length - 1];
    const surahDisplay =
      isAllTestRecords
        ? "-"
        : surahSet.size === 0
        ? "-"
        : surahSet.size === 1
          ? firstReport?.surah ?? "-"
          : firstReport?.surah && lastReport?.surah
            ? `${firstReport.surah} -> ${lastReport.surah}`
            : "Multiple";

    const juzValues = sorted
      .map((report) => report.juzuk)
      .filter(
        (value): value is number =>
          typeof value === "number" && !Number.isNaN(value)
      );
    const minJuz = juzValues.length ? Math.min(...juzValues) : null;
    const maxJuz = juzValues.length ? Math.max(...juzValues) : null;
    const juzDisplay =
      minJuz === null || maxJuz === null
        ? "-"
        : minJuz === maxJuz
          ? String(minJuz)
          : `${minJuz}-${maxJuz}`;

    let ayatDisplay = "-";
    if (isAllTestRecords) {
      ayatDisplay = "-";
    } else if (surahSet.size === 1 && sorted.length > 0) {
      const ayatValues = sorted.flatMap((report) => [
        report.ayat_from,
        report.ayat_to
      ]);
      const minAyat = Math.min(...ayatValues);
      const maxAyat = Math.max(...ayatValues);
      ayatDisplay = `${minAyat}-${maxAyat}`;
    } else if (surahSet.size > 1 && firstReport && lastReport) {
      ayatDisplay = `${firstReport.ayat_from}-${lastReport.ayat_to}`;
    }

    const pageRanges = sorted
      .map(getReportPageRange)
      .filter(
        (value): value is { minPage: number; maxPage: number } => Boolean(value)
      );
    let pageDisplay = "-";
    if (pageRanges.length > 0) {
      const minPage = Math.min(...pageRanges.map((range) => range.minPage));
      const maxPage = Math.max(...pageRanges.map((range) => range.maxPage));
      pageDisplay = minPage === maxPage ? String(minPage) : `${minPage}-${maxPage}`;
    }

    const grade = isAllTestRecords
      ? (() => {
          const percentages = testAssessments
            .map((assessment) => assessment.total_percentage)
            .filter((value): value is number => typeof value === "number");
          if (percentages.length === 0) return "-";
          const average = Math.round(
            percentages.reduce((sum, value) => sum + value, 0) / percentages.length
          );
          const threshold = testAssessments.find(
            (assessment) => typeof assessment.pass_threshold === "number"
          )?.pass_threshold ?? TEST_PASS_THRESHOLD_DEFAULT;
          return `${average}% ${average >= threshold ? "PASS" : "FAIL"}`;
        })()
      : calculateAverageGrade(sorted.map((report) => report.grade));
    const mondayDate = new Date(group.monday);
    const fridayDate = new Date(group.friday);
    const weekLabel = formatWeekLabelFromMonday(mondayDate);
    const weekRange = formatWeekRangeFromBoundaries(mondayDate, fridayDate);
    const monthLabel = mondayDate.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric"
    });

    return {
      weekKey: group.monday,
      weekLabel,
      weekRange,
      monthLabel,
      typeLabel,
      modeDisplay,
      surahDisplay,
      juzDisplay,
      ayatDisplay,
      pageDisplay,
      grade
    };
  });

  return summaries.sort(
    (a, b) => new Date(b.weekKey).getTime() - new Date(a.weekKey).getTime()
  );
};
