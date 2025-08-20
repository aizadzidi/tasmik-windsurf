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
import React from "react";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

interface Report {
  id: string;
  student_id: string;
  type: string;
  surah: string;
  juzuk?: number;
  ayat_from: number;
  ayat_to: number;
  page_from?: number;
  page_to?: number;
  grade: string;
  date: string;
}

interface Student {
  id: string;
  name: string;
  assigned_teacher_id: string | null;
}

interface Teacher {
  id: string;
  name: string;
  email: string;
}

interface AdminChartTabsProps {
  reports: Report[];
  students: Student[];
  teachers: Teacher[];
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

export function AdminActivityBarChart({ reports, students, teachers }: AdminChartTabsProps) {
  // Group reports by teacher
  const reportsByTeacher: Record<string, { pages: number; reports: Report[] }> = {};
  
  reports.forEach(report => {
    const student = students.find(s => s.id === report.student_id);
    if (!student || !student.assigned_teacher_id) return;
    
    const teacher = teachers.find(t => t.id === student.assigned_teacher_id);
    if (!teacher) return;
    
    const teacherName = teacher.name;
    
    if (!reportsByTeacher[teacherName]) {
      reportsByTeacher[teacherName] = { pages: 0, reports: [] };
    }
    
    // Calculate pages for this report
    const pages = report.page_from && report.page_to 
      ? Math.abs(report.page_to - report.page_from) + 1
      : 0;
    
    reportsByTeacher[teacherName].pages += pages;
    reportsByTeacher[teacherName].reports.push(report);
  });
  
  // Sort teachers by total pages (descending)
  const sortedTeachers = Object.keys(reportsByTeacher).sort((a, b) => 
    reportsByTeacher[b].pages - reportsByTeacher[a].pages
  );
  
  const data = {
    labels: sortedTeachers,
    datasets: [
      {
        label: "Total Pages",
        data: sortedTeachers.map(teacher => reportsByTeacher[teacher].pages),
        backgroundColor: "#2563eb",
        borderColor: "#1d4ed8",
        borderWidth: 1,
      },
    ],
  };
  
  return (
    <div className="mb-4">
      <div className="text-sm font-semibold mb-1">Activity by Teacher</div>
      <Bar 
        data={data} 
        options={{ 
          responsive: true, 
          plugins: { 
            legend: { display: false },
            tooltip: {
              callbacks: {
                afterLabel: function(context) {
                  const teacher = context.label;
                  const reportCount = reportsByTeacher[teacher]?.reports.length || 0;
                  return `${reportCount} report${reportCount !== 1 ? 's' : ''}`;
                }
              }
            }
          },
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
                text: 'Total Pages'
              }
            }
          }
        }} 
        height={120} 
      />
    </div>
  );
}

export function AdminGradeChart({ reports, students, teachers }: AdminChartTabsProps) {
  // Group reports by teacher and calculate average grades
  const gradesByTeacher: Record<string, number[]> = {};
  
  reports.forEach(report => {
    const student = students.find(s => s.id === report.student_id);
    if (!student || !student.assigned_teacher_id) return;
    
    const teacher = teachers.find(t => t.id === student.assigned_teacher_id);
    if (!teacher) return;
    
    const teacherName = teacher.name;
    const gradeValue = gradeToNumber(report.grade);
    
    if (gradeValue !== null) {
      if (!gradesByTeacher[teacherName]) {
        gradesByTeacher[teacherName] = [];
      }
      gradesByTeacher[teacherName].push(gradeValue);
    }
  });
  
  // Calculate average grades for each teacher
  const teacherAverages: Record<string, number> = {};
  Object.keys(gradesByTeacher).forEach(teacher => {
    const grades = gradesByTeacher[teacher];
    teacherAverages[teacher] = grades.reduce((sum, grade) => sum + grade, 0) / grades.length;
  });
  
  // Sort teachers by average grade (descending)
  const sortedTeachers = Object.keys(teacherAverages).sort((a, b) => 
    teacherAverages[b] - teacherAverages[a]
  );
  
  const data = {
    labels: sortedTeachers,
    datasets: [
      {
        label: "Average Grade",
        data: sortedTeachers.map(teacher => teacherAverages[teacher]),
        borderColor: "#22c55e",
        backgroundColor: "rgba(34, 197, 94, 0.1)",
        tension: 0.4,
        fill: true
      },
    ],
  };
  
  return (
    <div className="mb-4">
      <div className="text-sm font-semibold mb-1">Average Grades by Teacher</div>
      <Line 
        data={data} 
        options={{ 
          responsive: true, 
          plugins: { 
            legend: { display: false },
            tooltip: {
              callbacks: {
                afterLabel: function(context) {
                  const teacher = context.label;
                  const reportCount = gradesByTeacher[teacher]?.length || 0;
                  return `Based on ${reportCount} report${reportCount !== 1 ? 's' : ''}`;
                }
              }
            }
          },
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
        }} 
        height={120} 
      />
    </div>
  );
}

export function AdminChartTabs({ reports, students, teachers }: AdminChartTabsProps) {
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
      {tab === "activity" ? (
        <AdminActivityBarChart reports={reports} students={students} teachers={teachers} />
      ) : (
        <AdminGradeChart reports={reports} students={students} teachers={teachers} />
      )}
    </div>
  );
}