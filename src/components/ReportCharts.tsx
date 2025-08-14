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
import { Progress } from "@/components/ui/progress";
import React from "react";
import type { Report } from "@/types/teacher";
import { calculateAverageGrade, getWeekBoundaries, getWeekIdentifier } from "@/lib/gradeUtils";
import { MurajaahCircleChart } from "@/components/MurajaahCircleChart";

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
    return (
      <div className="mb-4">
        <div className="text-sm font-semibold mb-2 text-center">Murajaah Progress</div>
        <MurajaahCircleChart reports={reports} />
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

export function ActivityBarChart({ reports }: { reports: Report[] }) {
  // Get weekly summaries and calculate combined pages per week
  const weeklySummaries = groupReportsIntoWeeklySummaries(reports);
  const weeklyPages: Record<string, number> = {};
  
  weeklySummaries.forEach(summary => {
    const pages = summary.combinedPageTo && summary.combinedPageFrom 
      ? (summary.combinedPageTo - summary.combinedPageFrom + 1) 
      : 0;
    
    // Convert week range to week label format
    const weekLabel = convertToWeekLabel(summary.weekRange);
    
    if (!weeklyPages[weekLabel]) {
      weeklyPages[weekLabel] = 0;
    }
    weeklyPages[weekLabel] += pages;
  });
  
  // Sort weeks chronologically (same logic as before)
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
          x: {
            ticks: {
              maxRotation: 45,
              minRotation: 45
            }
          },
          y: {
            title: {
              display: true,
              text: 'Pages per Week'
            }
          }
        }
      }} height={120} />
    </div>
  );
}

export function GradeChart({ reports }: { reports: Report[] }) {
  // Get weekly summaries with pre-calculated average grades
  const weeklySummaries = groupReportsIntoWeeklySummaries(reports);
  const weeklyAverages: Record<string, number> = {};
  
  weeklySummaries.forEach(summary => {
    if (summary.averageGrade) {
      const gradeValue = gradeToNumber(summary.averageGrade);
      if (gradeValue !== null) {
        // Convert week range to week label format
        const weekLabel = convertToWeekLabel(summary.weekRange);
        
        if (!weeklyAverages[weekLabel]) {
          weeklyAverages[weekLabel] = 0;
        }
        // For multiple report types in same week, take average
        weeklyAverages[weekLabel] = gradeValue;
      }
    }
  });
  
  // Sort weeks chronologically (same logic as activity chart)
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
          x: {
            ticks: {
              maxRotation: 45,
              minRotation: 45
            }
          },
          y: {
            title: {
              display: true,
              text: 'Average Grade'
            },
            min: 1,
            max: 3,
            ticks: {
              stepSize: 1,
              callback: function(value) {
                const tickLabels: Record<number, string> = {
                  1: 'Jayyid',
                  2: 'Jayyid Jiddan', 
                  3: 'Mumtaz'
                };
                return tickLabels[value as number] || value;
              }
            }
          }
        }
      }} height={120} />
    </div>
  );
}

export function ChartTabs({ reports }: { reports: Report[] }) {
  const [tab, setTab] = React.useState("activity");
  return (
    <div className="mb-6">
      <div className="flex gap-2 mb-2">
        <button
          className={`px-3 py-1 rounded ${tab === "activity" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"}`}
          onClick={() => setTab("activity")}
        >
          Activity
        </button>
        <button
          className={`px-3 py-1 rounded ${tab === "grades" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"}`}
          onClick={() => setTab("grades")}
        >
          Grades
        </button>
      </div>
      {tab === "activity" ? <ActivityBarChart reports={reports} /> : <GradeChart reports={reports} />}
    </div>
  );
}
