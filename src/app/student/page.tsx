"use client";

import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import Navbar from "@/components/Navbar";
import ParentFullRecordsModal from "@/components/parent/ParentFullRecordsModal";
import { MultiMurajaahConcentricChart } from "@/components/MultiMurajaahConcentricChart";
import { QuranProgressBar, ChartTabs } from "@/components/ReportCharts";
import JuzTestProgressLineChart from "@/components/teacher/JuzTestProgressLineChart";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authFetch } from "@/lib/authFetch";
import { downloadBlob } from "@/lib/browserDownload";
import { formatJuzTestLabel, formatJuzTestPageRange } from "@/lib/juzTestUtils";
import {
  formatGradeLabel,
  formatWeekLabel,
  summarizeReportsByWeek,
  type WeeklyReportSummary,
} from "@/lib/parentReportUtils";
import { formatMurajaahDisplay } from "@/lib/quranMapping";
import {
  StudentProgressData,
  calculateDaysSinceLastRead,
  formatAbsoluteDate,
  filterStudentsBySearch,
  getInactivityRowClass,
  getSummaryStats,
  type SummaryStats,
} from "@/lib/reportUtils";
import type { Report, ViewMode } from "@/types/teacher";

type StudentPayload = {
  id: string;
  name: string;
  teacher_name: string | null;
  class_name: string | null;
  memorization_completed?: boolean;
  memorization_completed_date?: string | null;
};

type JuzTestRecord = {
  id: string;
  student_id: string;
  juz_number: number;
  test_date: string;
  total_percentage: number;
  passed: boolean;
  examiner_name?: string;
  remarks?: string;
  test_hizb?: boolean;
  hizb_number?: number | null;
  page_from?: number | null;
  page_to?: number | null;
};

type HafazanPayload = {
  student: StudentPayload;
  reports: Report[];
  juz_tests: JuzTestRecord[];
  error?: string;
};

type ExtendedStudentProgress = StudentProgressData & {
  highest_memorized_juz?: number;
  highest_passed_juz?: number;
  juz_test_gap?: number;
  latest_test_result?: JuzTestRecord | null;
};

export default function StudentPage() {
  const [student, setStudent] = useState<StudentPayload | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [juzTests, setJuzTests] = useState<JuzTestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("tasmik");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [showFullRecordsModal, setShowFullRecordsModal] = useState(false);
  const [fullRecordsChild, setFullRecordsChild] = useState<ExtendedStudentProgress | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await authFetch("/api/student/hafazan-report");
        const payload = (await response.json()) as HafazanPayload;
        if (!response.ok || !payload.student) {
          throw new Error(payload.error || "Failed to load hafazan report");
        }
        setStudent(payload.student);
        setReports(Array.isArray(payload.reports) ? payload.reports : []);
        setJuzTests(Array.isArray(payload.juz_tests) ? payload.juz_tests : []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load hafazan report");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const studentProgress = useMemo<ExtendedStudentProgress | null>(() => {
    if (!student) return null;

    if (viewMode === "juz_tests") {
      const highestMemorizedJuz = Math.max(
        ...reports
          .filter((report) => report.type === "Tasmi")
          .map((report) => report.juzuk || 0),
        0,
      );
      const latestTest = juzTests[0] ?? null;
      const passedTests = juzTests.filter((test) => test.passed);
      const highestPassedJuz = passedTests.length > 0
        ? Math.max(...passedTests.map((test) => test.juz_number || 0))
        : 0;

      return {
        id: student.id,
        name: student.name,
        teacher_name: student.teacher_name,
        class_name: student.class_name,
        latest_reading: `Memorized: Juz ${highestMemorizedJuz}`,
        last_read_date: latestTest?.test_date || null,
        days_since_last_read: latestTest?.test_date
          ? calculateDaysSinceLastRead(latestTest.test_date)
          : 999,
        report_type: "juz_test",
        memorization_completed: student.memorization_completed,
        memorization_completed_date: student.memorization_completed_date ?? undefined,
        highest_memorized_juz: highestMemorizedJuz,
        highest_passed_juz: highestPassedJuz,
        juz_test_gap: highestMemorizedJuz - highestPassedJuz,
        latest_test_result: latestTest,
      };
    }

    const latestReport =
      viewMode === "murajaah"
        ? reports.find((report) =>
            ["Murajaah", "Old Murajaah", "New Murajaah"].includes(report.type),
          ) ?? null
        : reports.find((report) => report.type === "Tasmi") ?? null;
    const daysSinceLastRead = latestReport ? calculateDaysSinceLastRead(latestReport.date) : 999;

    let latestReading: string | null = null;
    if (latestReport) {
      if (latestReport.type === "Tasmi") {
        latestReading = `${latestReport.surah} (${latestReport.ayat_from}-${latestReport.ayat_to})`;
      } else {
        const fallbackReading = latestReport.juzuk ? `Juz ${latestReport.juzuk}` : latestReport.surah;
        const pageFrom = latestReport.page_from ?? latestReport.page_to ?? null;
        const pageTo = latestReport.page_to ?? latestReport.page_from ?? undefined;
        latestReading = pageFrom !== null
          ? formatMurajaahDisplay(pageFrom, pageTo) ?? fallbackReading
          : fallbackReading;
      }
    } else if (viewMode === "murajaah") {
      latestReading = "No Murajaah record";
    }

    return {
      id: student.id,
      name: student.name,
      teacher_name: student.teacher_name,
      class_name: student.class_name,
      latest_reading: latestReading,
      last_read_date: latestReport?.date || null,
      days_since_last_read: daysSinceLastRead,
      report_type:
        (latestReport?.type as StudentProgressData["report_type"]) ??
        (viewMode === "murajaah" ? "Murajaah" : null),
      memorization_completed: student.memorization_completed,
      memorization_completed_date: student.memorization_completed_date ?? undefined,
    };
  }, [juzTests, reports, student, viewMode]);

  const children = useMemo<ExtendedStudentProgress[]>(
    () => (studentProgress ? [studentProgress] : []),
    [studentProgress],
  );

  const filteredChildren = useMemo(() => {
    const filtered = filterStudentsBySearch(children, debouncedSearchTerm) as ExtendedStudentProgress[];
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [children, debouncedSearchTerm]);

  const summaryStats: SummaryStats = useMemo(() => {
    if (viewMode === "juz_tests") {
      const childrenWithGaps = filteredChildren.filter((child) => (child.juz_test_gap || 0) > 0);
      const childrenWithLargeGaps = filteredChildren.filter((child) => (child.juz_test_gap || 0) >= 3);

      return {
        totalStudents: filteredChildren.length,
        inactive7Days: childrenWithGaps.length,
        inactive14Days: childrenWithLargeGaps.length,
      };
    }

    return getSummaryStats(filteredChildren);
  }, [filteredChildren, viewMode]);

  const selectedIdsForCharts =
    selectedStudentIds.length > 0 ? selectedStudentIds : filteredChildren.map((child) => child.id);

  const chartReports = useMemo(
    () =>
      reports.filter((report) => {
        if (!selectedIdsForCharts.includes(report.student_id)) return false;
        if (viewMode === "tasmik") return report.type === "Tasmi";
        if (viewMode === "murajaah") {
          return ["Murajaah", "Old Murajaah", "New Murajaah"].includes(report.type);
        }
        return true;
      }),
    [reports, selectedIdsForCharts, viewMode],
  );

  const handleFullRecords = (child: ExtendedStudentProgress) => {
    setFullRecordsChild(child);
    setShowFullRecordsModal(true);
  };

  const downloadCSV = (child: StudentProgressData, childReports: Report[]) => {
    const tasmikReports = childReports.filter((report) => report.type === "Tasmi");
    const weeklySummaries = summarizeReportsByWeek(tasmikReports, "Tasmi");
    const summariesByMonth = weeklySummaries.reduce(
      (acc, summary) => {
        if (!acc[summary.monthLabel]) {
          acc[summary.monthLabel] = [];
        }
        acc[summary.monthLabel].push(summary);
        return acc;
      },
      {} as Record<string, WeeklyReportSummary[]>,
    );

    const sortedMonths = Object.keys(summariesByMonth).sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime(),
    );
    const headers = ["Week", "Date Range", "Type", "Surah", "Juz", "Ayat", "Page", "Grade"];
    let csvString = `Tasmik Weekly Summary for ${child.name}\n\n`;

    for (const month of sortedMonths) {
      csvString += `${month}\n`;
      const summaries = summariesByMonth[month];
      if (summaries.length === 0) continue;

      csvString += "Tasmik Weekly Summary\n";
      csvString += `${headers.join(",")}\n`;
      summaries.forEach((summary) => {
        const row = [
          summary.weekLabel,
          summary.weekRange,
          summary.typeLabel,
          summary.surahDisplay,
          summary.juzDisplay,
          summary.ayatDisplay,
          summary.pageDisplay,
          formatGradeLabel(summary.grade),
        ];
        csvString += `${row.map((value) => `"${value}"`).join(",")}\n`;
      });
      csvString += "\n";
    }

    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, `${child.name}_report_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const downloadPDF = async (child: StudentProgressData, childReports: Report[]) => {
    const tasmikReports = childReports.filter((report) => report.type === "Tasmi");
    const doc = new jsPDF();

    const loadImageAsBase64 = async (url: string): Promise<string> => {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    };

    const weeklySummaries = summarizeReportsByWeek(tasmikReports, "Tasmi");
    const summariesByMonth = weeklySummaries.reduce(
      (acc, summary) => {
        if (!acc[summary.monthLabel]) {
          acc[summary.monthLabel] = [];
        }
        acc[summary.monthLabel].push(summary);
        return acc;
      },
      {} as Record<string, WeeklyReportSummary[]>,
    );

    const sortedMonths = Object.keys(summariesByMonth).sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime(),
    );
    const pageHeight = doc.internal.pageSize.height;

    try {
      const logoImg = await loadImageAsBase64("/logo-akademi.png");
      doc.addImage(logoImg, "PNG", 14, 12, 20, 20);
    } catch {}

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("AKADEMI AL-KHAYR", 40, 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("White Resort Camp, Mukim 7 & Mukim J, Kampung Genting,", 40, 23);
    doc.text("11000 Balik Pulau, Penang | 019-381 8616", 40, 28);
    doc.setDrawColor(200);
    doc.line(14, 38, 196, 38);

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Tasmik Weekly Progress Report", 14, 50);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Student: ${child.name}`, 14, 58);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 196, 58, { align: "right" });

    const maxPage = Math.max(
      ...tasmikReports.map((report) =>
        report.page_to !== null && !Number.isNaN(report.page_to) ? report.page_to : 0,
      ),
      0,
    );
    const percent = Math.min((maxPage / 604) * 100, 100);

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Overall Quran Completion Progress", 14, 70);
    doc.setFillColor(240, 240, 240);
    doc.rect(14, 72, 170, 6, "F");

    if (percent > 0) {
      doc.setFillColor(34, 197, 94);
      doc.rect(14, 72, (170 * percent) / 100, 6, "F");
    }

    doc.setFont("helvetica", "normal");
    doc.text(`${maxPage} / 604 pages (${percent.toFixed(1)}%)`, 196, 76, { align: "right" });

    let yPos = 85;
    const addFooter = () => {
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(9);
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, pageHeight - 10);
      doc.text(`Page ${pageCount}`, 196, pageHeight - 10, { align: "right" });
    };

    for (const month of sortedMonths) {
      if (yPos > pageHeight - 40) {
        addFooter();
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(month, 14, yPos);
      yPos += 8;

      const summaries = summariesByMonth[month];
      if (summaries.length === 0) continue;

      autoTable(doc, {
        startY: yPos,
        head: [[{
          content: "Tasmik Weekly Summary",
          colSpan: 6,
          styles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: "bold" },
        }], ["Week", "Range", "Surah", "Ayat", "Page", "Grade"]],
        body: summaries.map((summary) => [
          summary.weekLabel,
          summary.weekRange,
          summary.surahDisplay,
          summary.ayatDisplay,
          summary.pageDisplay,
          formatGradeLabel(summary.grade),
        ]),
        theme: "grid",
        headStyles: { fillColor: [240, 240, 240], textColor: 30, fontStyle: "bold" },
      });

      yPos = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY
        ? ((doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? yPos) + 10
        : yPos + 20;
    }

    addFooter();
    const pdfBlob = doc.output("blob");
    downloadBlob(pdfBlob, `${child.name}_report_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9] flex items-center justify-center">
        <div className="text-xl text-gray-800">Loading hafazan report...</div>
      </div>
    );
  }

  if (error || !student || !studentProgress) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9]">
        <Navbar />
        <div className="relative p-4 sm:p-6">
          <div className="max-w-5xl mx-auto">
            <Card className="border border-red-200 bg-red-50 p-6 text-red-700">
              {error || "Student profile not found."}
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9]">
      <Navbar />
      <div className="relative p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <header className="mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Hafazan Report</h1>
              <p className="text-gray-600">Track your Quran memorization progress using the same report view as campus parents.</p>
            </div>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold text-gray-900">{summaryStats.totalStudents}</div>
                  <div className="text-gray-600 font-medium">Total Children</div>
                </div>
                <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold text-amber-600">{summaryStats.inactive7Days}</div>
                  <div className="text-gray-600 font-medium">Need Attention</div>
                </div>
                <div className="h-12 w-12 bg-amber-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.664-.833-2.464 0L4.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
              </div>
            </Card>
          </div>

          {viewMode !== "juz_tests" ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Children Progress Overview</h3>
                {filteredChildren.length > 0 && (
                  selectedStudentIds.length === 0 && viewMode === "murajaah" ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
                        <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Old Murajaah</div>
                        <MultiMurajaahConcentricChart
                          students={filteredChildren.map((child) => ({ id: child.id, name: child.name }))}
                          reports={reports.filter((report) =>
                            filteredChildren.some((child) => child.id === report.student_id),
                          )}
                          variant="old"
                          title="Old Murajaah"
                        />
                      </div>
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                        <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">New Murajaah</div>
                        <MultiMurajaahConcentricChart
                          students={filteredChildren.map((child) => ({ id: child.id, name: child.name }))}
                          reports={reports.filter((report) =>
                            filteredChildren.some((child) => child.id === report.student_id),
                          )}
                          variant="new"
                          title="New Murajaah"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(() => {
                        const ids = selectedStudentIds.length > 0
                          ? selectedStudentIds
                          : filteredChildren.map((child) => child.id);

                        return filteredChildren
                          .filter((child) => ids.includes(child.id))
                          .map((child) => {
                            const childReports = reports.filter((report) => {
                              if (report.student_id !== child.id) return false;
                              if (viewMode === "tasmik") return report.type === "Tasmi";
                              if (viewMode === "murajaah") {
                                return report.type === "Tasmi" ||
                                  ["Murajaah", "Old Murajaah", "New Murajaah"].includes(report.type);
                              }
                              return true;
                            });

                            return (
                              <div key={child.id}>
                                <div className="text-sm font-semibold text-gray-800 mb-1">{child.name}</div>
                                <QuranProgressBar reports={childReports} viewMode={viewMode} />
                              </div>
                            );
                          });
                      })()}
                    </div>
                  )
                )}
              </Card>

              <Card className="p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Activity Analytics</h3>
                <ChartTabs
                  selectedStudentId={student.id}
                  studentNamesMap={Object.fromEntries(filteredChildren.map((child) => [child.id, child.name]))}
                  groupByStudentOverride={false}
                  reports={chartReports}
                />
              </Card>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 mb-6">
              <JuzTestProgressLineChart className="col-span-1" tests={juzTests} />
            </div>
          )}

          <Card className="p-4">
            <div className="flex items-center justify-center mb-6">
              <div className="bg-gray-100 rounded-full p-1">
                <div className="flex">
                  <button
                    onClick={() => setViewMode("tasmik")}
                    className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                      viewMode === "tasmik" ? "bg-blue-600 text-white shadow-md" : "text-gray-600 hover:text-gray-800"
                    }`}
                  >
                    Tasmik
                  </button>
                  <button
                    onClick={() => setViewMode("murajaah")}
                    className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                      viewMode === "murajaah" ? "bg-blue-600 text-white shadow-md" : "text-gray-600 hover:text-gray-800"
                    }`}
                  >
                    Murajaah
                  </button>
                  <button
                    onClick={() => setViewMode("juz_tests")}
                    className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                      viewMode === "juz_tests" ? "bg-blue-600 text-white shadow-md" : "text-gray-600 hover:text-gray-800"
                    }`}
                  >
                    Juz Tests
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 mb-6">
              <div>
                <input
                  type="text"
                  placeholder="Search children..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
                />
              </div>
            </div>

            {children.length === 0 ? (
              <div className="text-center py-8 text-gray-600">
                <p>No children registered in the system.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      {viewMode === "juz_tests" ? (
                        <>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Progress</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Latest Test</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Gap</th>
                        </>
                      ) : (
                        <>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Latest Reading</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Week</th>
                        </>
                      )}
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredChildren.map((child) => {
                      const childReports = reports.filter((report) => report.student_id === child.id);
                      const rowClass = viewMode === "juz_tests"
                        ? (child.juz_test_gap && child.juz_test_gap > 0
                            ? child.juz_test_gap >= 3
                              ? "bg-red-50/80"
                              : child.juz_test_gap >= 1
                                ? "bg-yellow-50/80"
                                : ""
                            : "")
                        : getInactivityRowClass(child.days_since_last_read, child.memorization_completed);

                      return (
                        <tr key={child.id} className={rowClass}>
                          <td className="px-4 py-3 font-medium text-gray-900">
                            <div className="flex items-start gap-2">
                              {selectedStudentIds.length > 0 ? (
                                <input
                                  type="checkbox"
                                  checked={selectedStudentIds.includes(child.id)}
                                  onChange={() => {
                                    setSelectedStudentIds((previous) =>
                                      previous.includes(child.id)
                                        ? previous.filter((id) => id !== child.id)
                                        : [...previous, child.id],
                                    );
                                  }}
                                  className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded"
                                  aria-label={`Select ${child.name}`}
                                />
                              ) : null}

                              <div>
                                <button
                                  onClick={() => {
                                    setSelectedStudentIds((previous) =>
                                      previous.includes(child.id)
                                        ? previous.filter((id) => id !== child.id)
                                        : [...previous, child.id],
                                    );
                                  }}
                                  className={`font-semibold underline-offset-2 ${
                                    selectedStudentIds.includes(child.id)
                                      ? "text-blue-700 underline"
                                      : "text-blue-600 hover:underline"
                                  }`}
                                  title={selectedStudentIds.includes(child.id) ? "Selected for charts" : "Select for charts"}
                                >
                                  {child.name}
                                </button>
                                {child.class_name ? (
                                  <div className="text-xs text-gray-600">{child.class_name}</div>
                                ) : null}
                                {child.teacher_name ? (
                                  <div className="text-xs text-gray-500">Teacher: {child.teacher_name}</div>
                                ) : null}
                                {child.memorization_completed ? (
                                  <div className="mt-1">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                      Completed
                                    </span>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </td>

                          {viewMode === "juz_tests" ? (
                            <>
                              <td className="px-4 py-3 text-gray-600">
                                <div className="text-sm font-medium">
                                  {child.latest_test_result?.passed && child.latest_test_result?.test_hizb
                                    ? formatJuzTestLabel(child.latest_test_result)
                                    : `Juz ${child.highest_memorized_juz || 0}`}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {child.latest_test_result?.passed && child.latest_test_result?.test_hizb
                                    ? "Passed Hizb Test"
                                    : "Memorized"}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center text-gray-600">
                                {child.latest_test_result ? (
                                  <>
                                    <div className="font-medium">
                                      {formatJuzTestLabel(child.latest_test_result)}
                                    </div>
                                    {formatJuzTestPageRange(child.latest_test_result) ? (
                                      <div className="text-xs text-gray-500">
                                        {formatJuzTestPageRange(child.latest_test_result)}
                                      </div>
                                    ) : null}
                                    <div className={`text-xs font-medium ${
                                      child.latest_test_result.passed ? "text-green-600" : "text-red-600"
                                    }`}>
                                      {child.latest_test_result.examiner_name === "Historical Entry"
                                        ? (child.latest_test_result.passed ? "PASSED" : "FAILED")
                                        : `${child.latest_test_result.total_percentage}% (${child.latest_test_result.passed ? "PASSED" : "FAILED"})`}
                                    </div>
                                    {child.latest_test_result.examiner_name !== "Historical Entry" ? (
                                      <div className="text-xs text-gray-500">
                                        {formatAbsoluteDate(child.last_read_date)}
                                      </div>
                                    ) : null}
                                  </>
                                ) : (
                                  <div className="text-gray-400 italic">No tests</div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex flex-col items-center">
                                  <span className={`text-lg font-bold ${
                                    (child.juz_test_gap || 0) >= 3
                                      ? "text-red-600"
                                      : (child.juz_test_gap || 0) >= 1
                                        ? "text-yellow-600"
                                        : "text-green-600"
                                  }`}>
                                    {child.juz_test_gap || 0}
                                  </span>
                                  <span className={`text-xs font-medium ${
                                    (child.juz_test_gap || 0) >= 3
                                      ? "text-red-500"
                                      : (child.juz_test_gap || 0) >= 1
                                        ? "text-yellow-500"
                                        : "text-green-500"
                                  }`}>
                                    {(child.juz_test_gap || 0) === 0 ? "Up to date" : `${child.juz_test_gap} behind`}
                                  </span>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3 text-gray-800">
                                {child.latest_reading || <span className="italic text-gray-400">No records</span>}
                              </td>
                              <td className="px-4 py-3 text-center text-gray-700">
                                <div className="text-sm">
                                  {child.last_read_date ? <div>{formatWeekLabel(child.last_read_date)}</div> : "-"}
                                </div>
                              </td>
                            </>
                          )}

                          <td className="px-4 py-3 text-center">
                            <div className="flex flex-col gap-1">
                              {viewMode === "tasmik" && childReports.length > 0 ? (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                                    >
                                      Export
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => downloadCSV(child, childReports)}>
                                      Download as CSV
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => void downloadPDF(child, childReports)}>
                                      Download as PDF
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              ) : null}

                              {(childReports.length > 0 || viewMode === "juz_tests") ? (
                                <button
                                  onClick={() => handleFullRecords(child)}
                                  className="bg-orange-100 hover:bg-orange-200 text-orange-700 px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                                >
                                  View Records
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredChildren.length === 0 ? (
                      <tr>
                        <td colSpan={viewMode === "juz_tests" ? 5 : 4} className="text-center py-8 text-gray-600">
                          <p>No children match the current filters.</p>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      {showFullRecordsModal && fullRecordsChild ? (
        <ParentFullRecordsModal
          student={fullRecordsChild}
          onClose={() => {
            setShowFullRecordsModal(false);
            setFullRecordsChild(null);
          }}
          onRefresh={() => undefined}
          userId={student.id}
          viewMode={viewMode}
          preloadedReports={reports}
          preloadedJuzTests={juzTests}
        />
      ) : null}
    </div>
  );
}
