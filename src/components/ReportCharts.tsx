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
} from "chart.js";
import { Progress } from "@/components/ui/progress";
import React from "react";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

export interface Report {
  id: string;
  student_id: string;
  type: string;
  surah: string;
  juzuk: number | null;
  ayat_from: number;
  ayat_to: number;
  page_from: number | null;
  page_to: number | null;
  grade: string | null;
  date: string;
  student_name?: string;
}

function gradeToNumber(grade: string | null) {
  if (!grade) return null;
  switch (grade.toLowerCase()) {
    case "mumtaz": return 3;
    case "jayyid jiddan": return 2;
    case "jayyid": return 1;
    default: return null;
  }
}

export function QuranProgressBar({ reports }: { reports: Report[] }) {
  // Filter to only include "Tasmi" type reports
  const tasmiReports = reports.filter(r => r.type === "Tasmi");
  
  // Find the highest page_to value from Tasmi reports only
  const maxPage = Math.max(
    ...tasmiReports.map(r => (r.page_to !== null && !isNaN(r.page_to) ? r.page_to : 0)),
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

export function ActivityBarChart({ reports }: { reports: Report[] }) {
  // Group by week and sum pages
  const weeklyPages: Record<string, number> = {};
  
  reports.forEach(r => {
    const reportDate = new Date(r.date);
    const weekLabel = getWeekLabel(reportDate);
    const pages = r.page_to && r.page_from ? (r.page_to - r.page_from + 1) : 0;
    weeklyPages[weekLabel] = (weeklyPages[weekLabel] || 0) + pages;
  });
  
  // Sort by date for proper chronological order
  const sortedWeeks = Object.keys(weeklyPages).sort((a, b) => {
    // Extract date info for sorting
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
  // Group reports by week and calculate average grade per week
  const weeklyGrades: Record<string, number[]> = {};
  
  reports.forEach(r => {
    if (!r.grade) return;
    const reportDate = new Date(r.date);
    const weekLabel = getWeekLabel(reportDate);
    const gradeValue = gradeToNumber(r.grade);
    
    if (gradeValue !== null) {
      if (!weeklyGrades[weekLabel]) {
        weeklyGrades[weekLabel] = [];
      }
      weeklyGrades[weekLabel].push(gradeValue);
    }
  });
  
  // Calculate average grade per week and sort chronologically
  const weeklyAverages: Record<string, number> = {};
  Object.keys(weeklyGrades).forEach(week => {
    const grades = weeklyGrades[week];
    weeklyAverages[week] = grades.reduce((sum, grade) => sum + grade, 0) / grades.length;
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
