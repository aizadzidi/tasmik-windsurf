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
  // Example logic: count unique surahs/pages completed
  const surahSet = new Set(reports.map(r => r.surah));
  const percent = Math.min(100, Math.round((surahSet.size / 114) * 100));
  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-semibold">Quran Progress</span>
        <span className="text-xs text-gray-600">{surahSet.size}/114 Surahs</span>
      </div>
      <Progress value={percent} />
    </div>
  );
}

export function ActivityBarChart({ reports }: { reports: Report[] }) {
  // Group by date
  const activity: Record<string, number> = {};
  reports.forEach(r => {
    activity[r.date] = (activity[r.date] || 0) + 1;
  });
  const dates = Object.keys(activity).sort();
  const data = {
    labels: dates,
    datasets: [
      {
        label: "Reports",
        data: dates.map(d => activity[d]),
        backgroundColor: "#2563eb",
      },
    ],
  };
  return (
    <div className="mb-4">
      <div className="text-sm font-semibold mb-1">Activity</div>
      <Bar data={data} options={{ responsive: true, plugins: { legend: { display: false } } }} height={120} />
    </div>
  );
}

export function GradeChart({ reports }: { reports: Report[] }) {
  // Group by grade
  const gradeCounts: Record<string, number> = { mumtaz: 0, "jayyid jiddan": 0, jayyid: 0 };
  reports.forEach(r => {
    if (r.grade && gradeCounts[r.grade.toLowerCase()] !== undefined) {
      gradeCounts[r.grade.toLowerCase()]++;
    }
  });
  const data = {
    labels: ["Mumtaz", "Jayyid Jiddan", "Jayyid"],
    datasets: [
      {
        label: "Count",
        data: [gradeCounts.mumtaz, gradeCounts["jayyid jiddan"], gradeCounts.jayyid],
        backgroundColor: ["#22c55e", "#2563eb", "#fbbf24"],
      },
    ],
  };
  return (
    <div className="mb-4">
      <div className="text-sm font-semibold mb-1">Grades</div>
      <Bar data={data} options={{ responsive: true, plugins: { legend: { display: false } } }} height={120} />
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
