"use client";

import { useMemo, useState } from "react";
import type { Report } from "@/types/teacher";
import { getWeekBoundaries } from "@/lib/gradeUtils";
import {
  getMurajaahModeFromReport,
  getMurajaahTestAssessmentFromReport
} from "@/lib/murajaahMode";

interface OldMurajaahTestResult {
  id: string;
  date: string;
  juzDisplay: string;
  pageDisplay: string;
  score: number | null;
  passed: boolean;
  threshold: number;
  weekRange: string;
}

interface OldMurajaahTestResultsPanelProps {
  studentName: string;
  reports: Report[];
  className?: string;
}

const isOldMurajaahType = (type: string | null | undefined) => {
  const normalized = (type ?? "").trim().toLowerCase();
  return normalized === "murajaah" || normalized === "old murajaah";
};

const formatDisplayDate = (date: string) => {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};

const formatFileName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export default function OldMurajaahTestResultsPanel({
  studentName,
  reports,
  className = ""
}: OldMurajaahTestResultsPanelProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const results = useMemo<OldMurajaahTestResult[]>(() => {
    return reports
      .filter((report) => isOldMurajaahType(report.type))
      .filter((report) => getMurajaahModeFromReport(report) === "test")
      .map((report) => {
        const testAssessment = getMurajaahTestAssessmentFromReport(report);
        const threshold =
          typeof testAssessment?.pass_threshold === "number"
            ? testAssessment.pass_threshold
            : 60;
        const score =
          typeof testAssessment?.total_percentage === "number"
            ? Math.round(testAssessment.total_percentage)
            : null;
        const passed =
          typeof testAssessment?.passed === "boolean"
            ? testAssessment.passed
            : score !== null
              ? score >= threshold
              : false;
        const pageValues = [report.page_from, report.page_to].filter(
          (value): value is number =>
            typeof value === "number" && !Number.isNaN(value)
        );
        const pageDisplay = pageValues.length
          ? `${Math.min(...pageValues)}-${Math.max(...pageValues)}`
          : "-";

        return {
          id: report.id,
          date: report.date,
          score,
          passed,
          threshold,
          pageDisplay,
          juzDisplay:
            typeof report.juzuk === "number" && !Number.isNaN(report.juzuk)
              ? String(report.juzuk)
              : "-",
          weekRange: getWeekBoundaries(report.date).weekRange
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [reports]);

  const stats = useMemo(() => {
    const total = results.length;
    const passed = results.filter((result) => result.passed).length;
    const scores = results
      .map((result) => result.score)
      .filter((score): score is number => score !== null);
    const avgScore = scores.length
      ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
      : null;
    const latestScore = results.find((result) => result.score !== null)?.score ?? null;

    return {
      total,
      passed,
      passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
      avgScore,
      latestScore
    };
  }, [results]);

  const handleDownloadPdf = async () => {
    if (results.length === 0 || isDownloading) return;
    setIsDownloading(true);

    try {
      const [{ default: JsPdf }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable")
      ]);

      const doc = new JsPdf({ orientation: "p", unit: "mm", format: "a4" });
      const generatedAt = new Date();
      const pageHeight = doc.internal.pageSize.getHeight();

      doc.setFillColor(250, 248, 243);
      doc.rect(0, 0, 210, 297, "F");
      doc.setDrawColor(215, 203, 172);
      doc.roundedRect(10, 10, 190, 277, 3, 3, "S");

      doc.setFont("helvetica", "bold");
      doc.setTextColor(37, 35, 31);
      doc.setFontSize(17);
      doc.text("Old Murajaah Test Results", 16, 24);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(87, 83, 78);
      doc.text(`Student: ${studentName}`, 16, 32);
      doc.text(
        `Generated: ${generatedAt.toLocaleDateString("en-GB")}`,
        16,
        38
      );

      doc.setFillColor(255, 255, 255);
      doc.roundedRect(16, 45, 178, 26, 2, 2, "F");
      doc.setDrawColor(229, 224, 214);
      doc.roundedRect(16, 45, 178, 26, 2, 2, "S");

      doc.setFont("helvetica", "bold");
      doc.setTextColor(47, 43, 38);
      doc.setFontSize(10);
      doc.text(`Total Tests: ${stats.total}`, 22, 54);
      doc.text(`Pass Rate: ${stats.passRate}%`, 68, 54);
      doc.text(
        `Average Score: ${stats.avgScore !== null ? `${stats.avgScore}%` : "-"}`,
        118,
        54
      );
      doc.text(
        `Latest Score: ${
          stats.latestScore !== null ? `${stats.latestScore}%` : "-"
        }`,
        22,
        63
      );
      doc.text(`Passed: ${stats.passed} / ${stats.total}`, 68, 63);

      autoTable(doc, {
        startY: 79,
        margin: { left: 16, right: 16 },
        head: [["Date", "Week", "Juz", "Page", "Score", "Status"]],
        body: results.map((result) => [
          formatDisplayDate(result.date),
          result.weekRange,
          result.juzDisplay,
          result.pageDisplay,
          result.score !== null ? `${result.score}%` : "-",
          result.passed ? "PASS" : `FAIL (<${result.threshold}%)`
        ]),
        styles: {
          font: "helvetica",
          fontSize: 9.5,
          textColor: [47, 43, 38],
          cellPadding: 2.5
        },
        headStyles: {
          fillColor: [214, 196, 157],
          textColor: [39, 34, 29],
          fontStyle: "bold"
        },
        alternateRowStyles: { fillColor: [252, 250, 245] }
      });

      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 114, 104);
      doc.setFontSize(9);
      doc.text("Tasmik Windsurf • Old Murajaah", 16, pageHeight - 12);
      doc.text(
        `Page ${doc.getNumberOfPages()}`,
        194,
        pageHeight - 12,
        { align: "right" }
      );

      const safeStudentName = formatFileName(studentName || "student");
      const suffix = generatedAt.toISOString().slice(0, 10);
      doc.save(`${safeStudentName}-old-murajaah-test-results-${suffix}.pdf`);
    } catch (error) {
      console.error("Failed to download old murajaah test PDF:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <section
      className={`rounded-2xl border border-[#e7dcc3] bg-gradient-to-br from-[#f9f6ef] via-[#f7f3ea] to-[#f2ecdf] p-4 sm:p-5 ${className}`}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-semibold tracking-tight text-[#25211d]">
            Old Murajaah Test Results
          </h4>
          <p className="mt-1 text-xs text-[#6e665c]">
            Premium summary for old murajaah test performance.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={results.length === 0 || isDownloading}
          className="inline-flex items-center gap-2 rounded-full border border-[#cab88d] bg-[#2f2b26] px-4 py-2 text-xs font-semibold text-[#f6efe0] transition hover:bg-[#1f1c18] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isDownloading ? "Preparing PDF..." : "Download PDF"}
        </button>
      </div>

      {results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d9ccb1] bg-white/70 px-4 py-5 text-center text-sm text-[#7b7268]">
          No old murajaah test result found yet.
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-[#e6dbc3] bg-white/80 p-3">
              <div className="text-[11px] uppercase tracking-wide text-[#8b826f]">
                Total Tests
              </div>
              <div className="mt-1 text-xl font-semibold text-[#25211d]">
                {stats.total}
              </div>
            </div>
            <div className="rounded-xl border border-[#e6dbc3] bg-white/80 p-3">
              <div className="text-[11px] uppercase tracking-wide text-[#8b826f]">
                Pass Rate
              </div>
              <div className="mt-1 text-xl font-semibold text-[#25211d]">
                {stats.passRate}%
              </div>
            </div>
            <div className="rounded-xl border border-[#e6dbc3] bg-white/80 p-3">
              <div className="text-[11px] uppercase tracking-wide text-[#8b826f]">
                Avg Score
              </div>
              <div className="mt-1 text-xl font-semibold text-[#25211d]">
                {stats.avgScore !== null ? `${stats.avgScore}%` : "-"}
              </div>
            </div>
            <div className="rounded-xl border border-[#e6dbc3] bg-white/80 p-3">
              <div className="text-[11px] uppercase tracking-wide text-[#8b826f]">
                Latest Score
              </div>
              <div className="mt-1 text-xl font-semibold text-[#25211d]">
                {stats.latestScore !== null ? `${stats.latestScore}%` : "-"}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {results.slice(0, 6).map((result) => (
              <div
                key={result.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e7ddc9] bg-white/80 px-3 py-2.5"
              >
                <div className="min-w-[132px]">
                  <div className="text-xs font-semibold text-[#3b342c]">
                    {formatDisplayDate(result.date)}
                  </div>
                  <div className="text-[11px] text-[#7f756a]">{result.weekRange}</div>
                </div>
                <div className="text-xs text-[#3b342c]">Juz {result.juzDisplay}</div>
                <div className="text-xs text-[#3b342c]">Page {result.pageDisplay}</div>
                <div className="text-sm font-semibold text-[#1f1a15]">
                  {result.score !== null ? `${result.score}%` : "-"}
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    result.passed
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {result.passed ? "PASS" : "FAIL"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
