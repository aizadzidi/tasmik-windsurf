"use client";
import { Line, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import type { ChartData, ChartOptions } from "chart.js";
import { Progress } from "@/components/ui/progress";
import React from "react";
import type { Report } from "@/types/teacher";
import { calculateAverageGrade, getWeekBoundaries, getWeekIdentifier } from "@/lib/gradeUtils";
import { MurajaahCircleChart } from "@/components/MurajaahCircleChart";
import { NewMurajaahRangeBar } from "@/components/NewMurajaahRangeBar";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

function gradeToNumber(grade: string | null) {
  if (!grade) return null;
  switch (grade.toLowerCase()) {
    case "mumtaz": return 3;
    case "jayyid jiddan": return 2;
    case "jayyid": return 1;
    default: return null;
  }
}

// Weekly summary interface for combined reports
interface WeeklySummary {
  weekIdentifier: string;
  weekRange: string;
  studentId: string;
  reportType: string;
  surah: string;
  combinedAyatFrom: number;
  combinedAyatTo: number;
  combinedPageFrom: number | null;
  combinedPageTo: number | null;
  averageGrade: string | null;
  sessionCount: number;
}

// Function to group individual reports into weekly summaries
function groupReportsIntoWeeklySummaries(reports: Report[]): WeeklySummary[] {
  const weeklyGroups: Record<string, Report[]> = {};
  
  // Group reports by week + student + type + surah
  reports.forEach(report => {
    const weekId = getWeekIdentifier(report.date);
    const groupKey = `${weekId}-${report.student_id}-${report.type}-${report.surah}`;
    
    if (!weeklyGroups[groupKey]) {
      weeklyGroups[groupKey] = [];
    }
    weeklyGroups[groupKey].push(report);
  });
  
  // Convert groups to weekly summaries
  return Object.entries(weeklyGroups).map(([, groupReports]) => {
    const firstReport = groupReports[0];
    const { weekRange } = getWeekBoundaries(firstReport.date);
    
    // Combine ayat ranges
    const ayatFromValues = groupReports.map(r => r.ayat_from);
    const ayatToValues = groupReports.map(r => r.ayat_to);
    const combinedAyatFrom = Math.min(...ayatFromValues);
    const combinedAyatTo = Math.max(...ayatToValues);
    
    // Combine page ranges - ensure proper from/to ordering for each report first
    const normalizedPageRanges = groupReports
      .filter(r => r.page_from !== null && r.page_to !== null)
      .map(r => ({
        from: Math.min(r.page_from!, r.page_to!),
        to: Math.max(r.page_from!, r.page_to!)
      }));
    
    const combinedPageFrom = normalizedPageRanges.length > 0 ? 
      Math.min(...normalizedPageRanges.map(p => p.from)) : null;
    const combinedPageTo = normalizedPageRanges.length > 0 ? 
      Math.max(...normalizedPageRanges.map(p => p.to)) : null;
    
    // Calculate average grade
    const grades = groupReports.map(r => r.grade);
    const averageGrade = calculateAverageGrade(grades);
    
    return {
      weekIdentifier: getWeekIdentifier(firstReport.date),
      weekRange,
      studentId: firstReport.student_id,
      reportType: firstReport.type,
      surah: firstReport.surah,
      combinedAyatFrom,
      combinedAyatTo,
      combinedPageFrom,
      combinedPageTo,
      averageGrade,
      sessionCount: groupReports.length
    };
  });
}

interface QuranProgressBarProps {
  reports: Report[];
  viewMode?: 'tasmik' | 'murajaah';
}

export function QuranProgressBar({ reports, viewMode = 'tasmik' }: QuranProgressBarProps) {
  // For murajaah mode, show circle chart instead
  if (viewMode === 'murajaah') {
    const tasmiReports = reports.filter(r => r.type === "Tasmi");
    const oldMurajaahReports = reports.filter(r => r.type === "Murajaah" || r.type === "Old Murajaah");
    const newMurajaahReports = reports.filter(r => r.type === "New Murajaah");
    const maxTasmiPage = Math.max(
      ...tasmiReports.map(r => (r.page_to !== null && !isNaN(r.page_to) ? r.page_to : 0)),
      0
    );
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
          <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Old Murajaah</div>
          {oldMurajaahReports.length > 0 ? (
            <MurajaahCircleChart
              reports={[...tasmiReports, ...oldMurajaahReports]}
              label="Old Murajaah"
              accentColor="#f59e0b"
            />
          ) : (
            <div className="py-8 text-center text-xs text-amber-700">No old murajaah records yet.</div>
          )}
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
          <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">New Murajaah</div>
          {newMurajaahReports.length > 0 ? (
            <NewMurajaahRangeBar
              reports={newMurajaahReports}
              accentColor="#10b981"
              maxTasmiPage={maxTasmiPage}
            />
          ) : (
            <div className="py-8 text-center text-xs text-emerald-700">No new murajaah records yet.</div>
          )}
        </div>
      </div>
    );
  }

  // Original Tasmi progress bar logic
  const tasmiReports = reports.filter(r => r.type === "Tasmi");
  const weeklySummaries = groupReportsIntoWeeklySummaries(tasmiReports);
  
  // Find the highest combined page_to value from weekly summaries
  const maxPage = Math.max(
    ...weeklySummaries.map(s => (s.combinedPageTo !== null && !isNaN(s.combinedPageTo) ? s.combinedPageTo : 0)),
    0
  );
  const percent = Math.min((maxPage / 604) * 100, 100);
  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-semibold">Quran Progress (Tasmi)</span>
        <span className="text-xs text-gray-600">{maxPage} / 604 pages ({percent.toFixed(1)}%)</span>
      </div>
      <Progress value={percent} />
    </div>
  );
}

// Helper functions for weekly calculations
function getWeekOfMonth(date: Date) {
  const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstMondayOfMonth = new Date(firstDayOfMonth);
  const daysToFirstMonday = (1 - firstDayOfMonth.getDay() + 7) % 7;
  if (daysToFirstMonday === 7) {
    firstMondayOfMonth.setDate(1);
  } else {
    firstMondayOfMonth.setDate(1 + daysToFirstMonday);
  }
  
  if (date < firstMondayOfMonth) {
    if (date.getDate() <= 6) {
      return 1;
    }
    const lastDayOfPreviousMonth = new Date(date.getFullYear(), date.getMonth(), 0);
    return getWeekOfMonth(lastDayOfPreviousMonth);
  }
  
  const daysDiff = Math.floor((date.getTime() - firstMondayOfMonth.getTime()) / (1000 * 60 * 60 * 24));
  return Math.floor(daysDiff / 7) + 1;
}

function getWeekLabel(date: Date) {
  const weekNum = getWeekOfMonth(date);
  const monthName = date.toLocaleDateString('en-US', { month: 'long' });
  const year = date.getFullYear();
  return `Week ${weekNum} of ${monthName} ${year}`;
}

type WeekViewMode = 'all' | 'focus' | 'compare';
type WeekRangeMode = 'all' | '8w' | '4w';

function sortWeekLabels(labels: string[]) {
  return labels.sort((a, b) => {
    const weekA = a.match(/Week (\d+) of (\w+) (\d+)/);
    const weekB = b.match(/Week (\d+) of (\w+) (\d+)/);
    if (!weekA || !weekB) return 0;
    const yearA = parseInt(weekA[3]);
    const yearB = parseInt(weekB[3]);
    if (yearA !== yearB) return yearA - yearB;
    const monthA = new Date(weekA[2] + ' 1, 2025').getMonth();
    const monthB = new Date(weekB[2] + ' 1, 2025').getMonth();
    if (monthA !== monthB) return monthA - monthB;
    return parseInt(weekA[1]) - parseInt(weekB[1]);
  });
}

function applyWeekRange(sortedWeeks: string[], rangeMode: WeekRangeMode) {
  if (rangeMode === 'all') return sortedWeeks;
  const count = rangeMode === '4w' ? 4 : 8;
  return sortedWeeks.slice(-count);
}

function getSortedWeekLabels(weeklySummaries: WeeklySummary[]) {
  const weekLabels = Array.from(new Set(
    weeklySummaries.map(s => convertToWeekLabel(s.weekRange))
  ));
  return sortWeekLabels(weekLabels);
}

// Convert week range format back to week number format for charts
function convertToWeekLabel(weekRange: string): string {
  // Parse "Dec 9-13, 2024" format back to "Week X of Month Year"
  const parts = weekRange.split(' ');
  if (parts.length >= 3) {
    const month = parts[0]; // "Dec"
    const year = parts[2].replace(',', ''); // "2024"
    const dayRange = parts[1]; // "9-13"
    const startDay = parseInt(dayRange.split('-')[0]);
    
    // Create a date from the start day to calculate week number
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthIndex = monthNames.indexOf(month);
    if (monthIndex !== -1) {
      const sampleDate = new Date(parseInt(year), monthIndex, startDay);
      return getWeekLabel(sampleDate);
    }
  }
  return weekRange; // fallback
}

export function ActivityBarChart({
  reports,
  groupByStudent = false,
  studentNamesMap,
  weekViewMode = 'all',
  weekRangeMode = 'all',
  selectedWeek,
  onWeekSelect
}: {
  reports: Report[];
  groupByStudent?: boolean;
  studentNamesMap?: Record<string, string>;
  weekViewMode?: WeekViewMode;
  weekRangeMode?: WeekRangeMode;
  selectedWeek?: string | null;
  onWeekSelect?: (weekLabel: string) => void;
}) {
  if (groupByStudent) {
    // Grouped by student per week (clustered bars per week)
    const weeklySummaries = groupReportsIntoWeeklySummaries(reports);

    const sortedWeeks = getSortedWeekLabels(weeklySummaries);
    const rangedWeeks = applyWeekRange(sortedWeeks, weekRangeMode);
    const latestWeek = sortedWeeks[sortedWeeks.length - 1] || null;
    const activeWeek = selectedWeek && sortedWeeks.includes(selectedWeek) ? selectedWeek : latestWeek;
    const activeWeekIndex = activeWeek ? sortedWeeks.indexOf(activeWeek) : -1;
    const previousWeek = activeWeekIndex > 0 ? sortedWeeks[activeWeekIndex - 1] : null;

    // Build pages per student per week
    const studentIds = Array.from(new Set(weeklySummaries.map(s => s.studentId))).sort((a, b) => {
      const nameA = (studentNamesMap?.[a] || a).toLowerCase();
      const nameB = (studentNamesMap?.[b] || b).toLowerCase();
      return nameA.localeCompare(nameB);
    });

    const pagesByStudentWeek: Record<string, Record<string, number>> = {};
    weeklySummaries.forEach(summary => {
      const weekLabel = convertToWeekLabel(summary.weekRange);
      const pages = summary.combinedPageTo && summary.combinedPageFrom
        ? (summary.combinedPageTo - summary.combinedPageFrom + 1)
        : 0;
      if (!pagesByStudentWeek[summary.studentId]) pagesByStudentWeek[summary.studentId] = {};
      pagesByStudentWeek[summary.studentId][weekLabel] = (pagesByStudentWeek[summary.studentId][weekLabel] || 0) + pages;
    });

    // Simple color palette
    const palette = [
      '#ef4444', // red-500
      '#22c55e', // green-500
      '#3b82f6', // blue-500
      '#f59e0b', // amber-500
      '#a855f7', // purple-500
      '#06b6d4', // cyan-500
      '#84cc16', // lime-500
      '#ec4899', // pink-500
    ];

    const datasets = studentIds.map((studentId, index) => ({
      label: studentNamesMap?.[studentId] || studentId,
      data: rangedWeeks.map(week => pagesByStudentWeek[studentId]?.[week] || 0),
      backgroundColor: palette[index % palette.length],
    }));

    let data: ChartData<"bar", number[], string> = { labels: rangedWeeks, datasets };
    let options: ChartOptions<"bar"> = {
      responsive: true,
      plugins: { legend: { display: true, position: 'right' as const } },
      scales: {
        x: { ticks: { maxRotation: 45, minRotation: 45 } },
        y: { title: { display: true, text: 'Pages' } }
      }
    };

    if (weekViewMode === 'focus' && activeWeek) {
      data = {
        labels: studentIds.map(id => studentNamesMap?.[id] || id),
        datasets: [
          {
            label: activeWeek,
            data: studentIds.map(id => pagesByStudentWeek[id]?.[activeWeek] || 0),
            backgroundColor: studentIds.map((_, index) => palette[index % palette.length]),
          }
        ]
      };
      options = {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxRotation: 45, minRotation: 45 } },
          y: { title: { display: true, text: 'Pages' } }
        }
      };
    }

    if (weekViewMode === 'compare' && activeWeek) {
      data = {
        labels: studentIds.map(id => studentNamesMap?.[id] || id),
        datasets: [
          ...(previousWeek ? [{
            label: previousWeek,
            data: studentIds.map(id => pagesByStudentWeek[id]?.[previousWeek] || 0),
            backgroundColor: '#93c5fd',
          }] : []),
          {
            label: activeWeek,
            data: studentIds.map(id => pagesByStudentWeek[id]?.[activeWeek] || 0),
            backgroundColor: '#2563eb',
          }
        ]
      };
      options = {
        responsive: true,
        plugins: { legend: { display: true, position: 'top' as const } },
        scales: {
          x: { ticks: { maxRotation: 45, minRotation: 45 } },
          y: { title: { display: true, text: 'Pages' } }
        }
      };
    }

    return (
      <div className="mb-4">
        <div className="text-sm font-semibold mb-1">Activity by Student</div>
        <Bar
          data={data}
          options={{
            ...options,
            onClick: weekViewMode === 'all' ? (_event, elements, chart) => {
              if (!onWeekSelect || elements.length === 0) return;
              const index = elements[0].index;
              const label = chart.data.labels?.[index];
              if (typeof label === 'string') onWeekSelect(label);
            } : undefined
          }}
          height={120}
        />
      </div>
    );
  }

  // Fallback to weekly aggregation
  const weeklySummaries = groupReportsIntoWeeklySummaries(reports);
  const weeklyPages: Record<string, number> = {};
  weeklySummaries.forEach(summary => {
    const pages = summary.combinedPageTo && summary.combinedPageFrom
      ? (summary.combinedPageTo - summary.combinedPageFrom + 1)
      : 0;
    const weekLabel = convertToWeekLabel(summary.weekRange);
    if (!weeklyPages[weekLabel]) weeklyPages[weekLabel] = 0;
    weeklyPages[weekLabel] += pages;
  });

  const sortedWeeks = Object.keys(weeklyPages).sort((a, b) => {
    const weekA = a.match(/Week (\d+) of (\w+) (\d+)/);
    const weekB = b.match(/Week (\d+) of (\w+) (\d+)/);
    if (!weekA || !weekB) return 0;
    const yearA = parseInt(weekA[3]);
    const yearB = parseInt(weekB[3]);
    if (yearA !== yearB) return yearA - yearB;
    const monthA = new Date(weekA[2] + ' 1, 2025').getMonth();
    const monthB = new Date(weekB[2] + ' 1, 2025').getMonth();
    if (monthA !== monthB) return monthA - monthB;
    return parseInt(weekA[1]) - parseInt(weekB[1]);
  });

  const data = {
    labels: sortedWeeks,
    datasets: [
      {
        label: "Pages",
        data: sortedWeeks.map(week => weeklyPages[week]),
        backgroundColor: "#2563eb",
      },
    ],
  };

  return (
    <div className="mb-4">
      <div className="text-sm font-semibold mb-1">Activity</div>
      <Bar data={data} options={{
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxRotation: 45, minRotation: 45 } },
          y: { title: { display: true, text: 'Pages per Week' } }
        }
      }} height={120} />
    </div>
  );
}

export function GradeChart({
  reports,
  groupByStudent = false,
  studentNamesMap,
  weekViewMode = 'all',
  weekRangeMode = 'all',
  selectedWeek
}: {
  reports: Report[];
  groupByStudent?: boolean;
  studentNamesMap?: Record<string, string>;
  weekViewMode?: WeekViewMode;
  weekRangeMode?: WeekRangeMode;
  selectedWeek?: string | null;
}) {
  if (groupByStudent) {
    const weeklySummaries = groupReportsIntoWeeklySummaries(reports);
    const sortedWeeks = getSortedWeekLabels(weeklySummaries);
    const rangedWeeks = applyWeekRange(sortedWeeks, weekRangeMode);
    const latestWeek = sortedWeeks[sortedWeeks.length - 1] || null;
    const activeWeek = selectedWeek && sortedWeeks.includes(selectedWeek) ? selectedWeek : latestWeek;
    const activeWeekIndex = activeWeek ? sortedWeeks.indexOf(activeWeek) : -1;
    const previousWeek = activeWeekIndex > 0 ? sortedWeeks[activeWeekIndex - 1] : null;

    const gradesPerStudent: Record<string, { sum: number; count: number }> = {};
    const gradesByStudentWeek: Record<string, Record<string, { sum: number; count: number }>> = {};
    weeklySummaries.forEach(summary => {
      if (!summary.averageGrade) return;
      const val = gradeToNumber(summary.averageGrade);
      if (val === null) return;
      const weekLabel = convertToWeekLabel(summary.weekRange);
      if (!gradesByStudentWeek[summary.studentId]) gradesByStudentWeek[summary.studentId] = {};
      if (!gradesByStudentWeek[summary.studentId][weekLabel]) {
        gradesByStudentWeek[summary.studentId][weekLabel] = { sum: 0, count: 0 };
      }
      gradesByStudentWeek[summary.studentId][weekLabel].sum += val;
      gradesByStudentWeek[summary.studentId][weekLabel].count += 1;
      if (weekViewMode === 'all' && rangedWeeks.includes(weekLabel)) {
        if (!gradesPerStudent[summary.studentId]) gradesPerStudent[summary.studentId] = { sum: 0, count: 0 };
        gradesPerStudent[summary.studentId].sum += val;
        gradesPerStudent[summary.studentId].count += 1;
      }
    });

    const baseStudentIds = weekViewMode === 'all'
      ? Object.keys(gradesPerStudent)
      : Object.keys(gradesByStudentWeek);
    const studentIds = baseStudentIds.sort((a, b) => {
      const nameA = (studentNamesMap?.[a] || a).toLowerCase();
      const nameB = (studentNamesMap?.[b] || b).toLowerCase();
      return nameA.localeCompare(nameB);
    });

    let data = {
      labels: studentIds.map(id => studentNamesMap?.[id] || id),
      datasets: [
        {
          label: "Average Grade",
          data: studentIds.map(id => {
            const g = gradesPerStudent[id];
            return g && g.count > 0 ? g.sum / g.count : null;
          }),
          backgroundColor: "#22c55e",
        },
      ],
    };

    if (weekViewMode === 'focus' && activeWeek) {
      data = {
        labels: studentIds.map(id => studentNamesMap?.[id] || id),
        datasets: [
          {
            label: activeWeek,
            data: studentIds.map(id => {
              const g = gradesByStudentWeek[id]?.[activeWeek];
              return g && g.count > 0 ? g.sum / g.count : null;
            }),
            backgroundColor: "#22c55e",
          },
        ],
      };
    }

    if (weekViewMode === 'compare' && activeWeek) {
      data = {
        labels: studentIds.map(id => studentNamesMap?.[id] || id),
        datasets: [
          ...(previousWeek ? [{
            label: previousWeek,
            data: studentIds.map(id => {
              const g = gradesByStudentWeek[id]?.[previousWeek];
              return g && g.count > 0 ? g.sum / g.count : null;
            }),
            backgroundColor: "#86efac",
          }] : []),
          {
            label: activeWeek,
            data: studentIds.map(id => {
              const g = gradesByStudentWeek[id]?.[activeWeek];
              return g && g.count > 0 ? g.sum / g.count : null;
            }),
            backgroundColor: "#22c55e",
          }
        ],
      };
    }

    return (
      <div className="mb-4">
        <div className="text-sm font-semibold mb-1">Grades by Student</div>
        <Bar data={data} options={{
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { maxRotation: 45, minRotation: 45 } },
            y: {
              title: { display: true, text: 'Average Grade' },
              min: 1,
              max: 3,
              ticks: {
                stepSize: 1,
                callback: function(value) {
                  const tickLabels: Record<number, string> = { 1: 'Jayyid', 2: 'Jayyid Jiddan', 3: 'Mumtaz' };
                  return tickLabels[value as number] || String(value);
                }
              }
            }
          }
        }} height={120} />
      </div>
    );
  }

  // Weekly averages chart
  const weeklySummaries = groupReportsIntoWeeklySummaries(reports);
  const weeklyAverages: Record<string, number> = {};
  weeklySummaries.forEach(summary => {
    if (summary.averageGrade) {
      const gradeValue = gradeToNumber(summary.averageGrade);
      if (gradeValue !== null) {
        const weekLabel = convertToWeekLabel(summary.weekRange);
        weeklyAverages[weekLabel] = gradeValue;
      }
    }
  });

  const sortedWeeks = Object.keys(weeklyAverages).sort((a, b) => {
    const weekA = a.match(/Week (\d+) of (\w+) (\d+)/);
    const weekB = b.match(/Week (\d+) of (\w+) (\d+)/);
    if (!weekA || !weekB) return 0;
    const yearA = parseInt(weekA[3]);
    const yearB = parseInt(weekB[3]);
    if (yearA !== yearB) return yearA - yearB;
    const monthA = new Date(weekA[2] + ' 1, 2025').getMonth();
    const monthB = new Date(weekB[2] + ' 1, 2025').getMonth();
    if (monthA !== monthB) return monthA - monthB;
    return parseInt(weekA[1]) - parseInt(weekB[1]);
  });

  const data = {
    labels: sortedWeeks,
    datasets: [
      {
        label: "Average Grade",
        data: sortedWeeks.map(week => weeklyAverages[week]),
        borderColor: "#22c55e",
        backgroundColor: "rgba(34, 197, 94, 0.1)",
        tension: 0.4,
        fill: true
      },
    ],
  };

  return (
    <div className="mb-4">
      <div className="text-sm font-semibold mb-1">Grades</div>
      <Line data={data} options={{
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxRotation: 45, minRotation: 45 } },
          y: {
            title: { display: true, text: 'Average Grade' },
            min: 1,
            max: 3,
            ticks: {
              stepSize: 1,
              callback: function(value) {
                const tickLabels: Record<number, string> = { 1: 'Jayyid', 2: 'Jayyid Jiddan', 3: 'Mumtaz' };
                return tickLabels[value as number] || String(value);
              }
            }
          }
        }
      }} height={120} />
    </div>
  );
}

export function ChartTabs({ reports, selectedStudentId, studentNamesMap, groupByStudentOverride }: { reports: Report[]; selectedStudentId?: string | null; studentNamesMap?: Record<string, string>; groupByStudentOverride?: boolean; }) {
  const [tab, setTab] = React.useState("activity");
  const [weekViewMode, setWeekViewMode] = React.useState<WeekViewMode>('all');
  const [weekRangeMode, setWeekRangeMode] = React.useState<WeekRangeMode>('all');
  const [selectedWeek, setSelectedWeek] = React.useState<string | null>(null);
  const groupByStudent = typeof groupByStudentOverride === 'boolean' ? groupByStudentOverride : !selectedStudentId;
  const weeklySummaries = React.useMemo(() => groupReportsIntoWeeklySummaries(reports), [reports]);
  const sortedWeeks = React.useMemo(() => getSortedWeekLabels(weeklySummaries), [weeklySummaries]);
  const latestWeek = sortedWeeks[sortedWeeks.length - 1] || null;

  React.useEffect(() => {
    if (!latestWeek) return;
    if (!selectedWeek || !sortedWeeks.includes(selectedWeek)) {
      setSelectedWeek(latestWeek);
    }
  }, [latestWeek, selectedWeek, sortedWeeks]);

  return (
    <div className="mb-6">
      {groupByStudent && sortedWeeks.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap gap-2">
            <button
              className={`px-2.5 py-1 rounded text-xs font-medium ${weekViewMode === 'all' ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
              onClick={() => setWeekViewMode('all')}
            >
              All Weeks
            </button>
            <button
              className={`px-2.5 py-1 rounded text-xs font-medium ${weekViewMode === 'focus' ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
              onClick={() => setWeekViewMode('focus')}
            >
              Single Week
            </button>
            <button
              className={`px-2.5 py-1 rounded text-xs font-medium ${weekViewMode === 'compare' ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
              onClick={() => setWeekViewMode('compare')}
            >
              This vs Last
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {weekViewMode === 'all' ? (
              <>
                <button
                  className={`px-2.5 py-1 rounded text-xs font-medium ${weekRangeMode === 'all' ? "bg-slate-200 text-slate-900" : "bg-gray-100 text-gray-700"}`}
                  onClick={() => setWeekRangeMode('all')}
                >
                  All
                </button>
                <button
                  className={`px-2.5 py-1 rounded text-xs font-medium ${weekRangeMode === '8w' ? "bg-slate-200 text-slate-900" : "bg-gray-100 text-gray-700"}`}
                  onClick={() => setWeekRangeMode('8w')}
                >
                  Last 8w
                </button>
                <button
                  className={`px-2.5 py-1 rounded text-xs font-medium ${weekRangeMode === '4w' ? "bg-slate-200 text-slate-900" : "bg-gray-100 text-gray-700"}`}
                  onClick={() => setWeekRangeMode('4w')}
                >
                  Last 4w
                </button>
                <div className="text-[11px] text-gray-500">Tip: click a week bar to view it alone</div>
              </>
            ) : (
              <>
                <label className="text-[11px] text-gray-500">Week</label>
                <select
                  value={selectedWeek ?? ''}
                  onChange={(e) => setSelectedWeek(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-xs"
                >
                  {sortedWeeks.map(week => (
                    <option key={week} value={week}>{week}</option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>
      )}
      <div className="flex gap-2 mb-2">
        <button
          className={`px-3 py-1 rounded ${tab === "activity" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"}`}
          onClick={() => setTab("activity")}
        >
          {groupByStudent ? 'Activity by Student' : 'Activity'}
        </button>
        <button
          className={`px-3 py-1 rounded ${tab === "grades" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"}`}
          onClick={() => setTab("grades")}
        >
          {groupByStudent ? 'Grades by Student' : 'Grades'}
        </button>
      </div>
      {tab === "activity" 
        ? (
          <ActivityBarChart
            reports={reports}
            groupByStudent={groupByStudent}
            studentNamesMap={studentNamesMap}
            weekViewMode={weekViewMode}
            weekRangeMode={weekRangeMode}
            selectedWeek={selectedWeek}
            onWeekSelect={(week) => {
              setSelectedWeek(week);
              setWeekViewMode('focus');
            }}
          />
        ) : (
          <GradeChart
            reports={reports}
            groupByStudent={groupByStudent}
            studentNamesMap={studentNamesMap}
            weekViewMode={weekViewMode}
            weekRangeMode={weekRangeMode}
            selectedWeek={selectedWeek}
          />
        )}
    </div>
  );
}
