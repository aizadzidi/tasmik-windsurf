"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import jsPDF from "jspdf";
import autoTable from 'jspdf-autotable';
import { Line, Bar } from "react-chartjs-2";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
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
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface Student {
  id: string;
  name: string;
}

interface Report {
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
}

function gradeToNumber(grade: string | null) {
  if (!grade) return null;
  // Example mapping: adjust as needed
  switch (grade.toLowerCase()) {
    case "mumtaz": return 3;
    case "jayyid jiddan": return 2;
    case "jayyid": return 1;
    default: return null;
  }
}

function QuranProgressBar({ reports }: { reports: Report[] }) {
  // Find the highest page_to value
  const maxPage = Math.max(
    ...reports.map(r => (r.page_to !== null && !isNaN(r.page_to) ? r.page_to : 0)),
    0
  );
  const percent = Math.min((maxPage / 604) * 100, 100);
  return (
    <div className="mb-2 flex flex-col gap-1">
      <div className="flex justify-between items-center text-xs text-gray-600">
        <span>Quran Progress</span>
        <span>{maxPage} / 604 pages ({percent.toFixed(1)}%)</span>
      </div>
      <Progress value={percent} />
    </div>
  );
}

function ActivityBarChart({ reports }: { reports: Report[] }) {
  const [mode, setMode] = useState<'weekly' | 'monthly'>('weekly');
  if (!reports.length) return null;

  // Helper to format date to week or month
  function getPeriod(date: string) {
    const d = new Date(date);
    if (mode === 'weekly') {
      // ISO week: year + week number
      const onejan = new Date(d.getFullYear(),0,1);
      const week = Math.ceil((((d.getTime() - onejan.getTime())/86400000) + onejan.getDay()+1)/7);
      return `${d.getFullYear()}-W${week.toString().padStart(2,'0')}`;
    } else {
      return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}`;
    }
  }

  // Aggregate counts
  const counts: Record<string, number> = {};
  reports.forEach(r => {
    const period = getPeriod(r.date);
    counts[period] = (counts[period] || 0) + 1;
  });
  // Sort periods
  const periods = Object.keys(counts).sort();
  const data = periods.map(p => counts[p]);

  // Chart.js data/config
  const chartData = {
    labels: periods,
    datasets: [
      {
        label: 'Reports',
        data,
        backgroundColor: '#60a5fa',
        borderRadius: 4,
        barPercentage: 0.6,
        categoryPercentage: 0.7,
      },
    ],
  };
  const options = {
    responsive: true,
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `Reports: ${ctx.parsed.y}`,
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: mode === 'weekly' ? 'Week' : 'Month',
        },
      },
      y: {
        title: {
          display: true,
          text: 'Number of Reports',
        },
        beginAtZero: true,
        precision: 0,
        stepSize: 1,
      },
    },
  };

  return (
    <div>
      <div className="flex gap-2 mb-1 text-xs">
        <button
          className={`px-2 py-1 rounded ${mode==='weekly' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'}`}
          onClick={() => setMode('weekly')}
        >
          Weekly
        </button>
        <button
          className={`px-2 py-1 rounded ${mode==='monthly' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'}`}
          onClick={() => setMode('monthly')}
        >
          Monthly
        </button>
      </div>
      <Bar data={chartData} options={options} height={120} />
    </div>
  );
}

function ChartTabs({ reports }: { reports: Report[] }) {
  const [tab, setTab] = useState<'activity' | 'grades'>('activity');
  return (
    <div className="mb-2">
      <div className="flex gap-2 mb-2">
        <button
          className={`px-3 py-1 rounded-t border-b-2 transition-colors duration-150 font-medium text-sm ${tab==='activity' ? 'border-blue-500 text-blue-700 bg-blue-50' : 'border-transparent text-gray-500 bg-gray-100 hover:text-blue-600'}`}
          onClick={() => setTab('activity')}
          aria-selected={tab==='activity'}
        >
          Activity
        </button>
        <button
          className={`px-3 py-1 rounded-t border-b-2 transition-colors duration-150 font-medium text-sm ${tab==='grades' ? 'border-blue-500 text-blue-700 bg-blue-50' : 'border-transparent text-gray-500 bg-gray-100 hover:text-blue-600'}`}
          onClick={() => setTab('grades')}
          aria-selected={tab==='grades'}
        >
          Grades
        </button>
      </div>
      <div>
        {tab === 'activity' ? (
          <ActivityBarChart reports={reports} />
        ) : (
          <GradeChart reports={reports} />
        )}
      </div>
    </div>
  );
}

function GradeChart({ reports }: { reports: Report[] }) {
  // Sort by date ascending
  const sorted = [...reports].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const labels = sorted.map(r => r.date);
  const data = sorted.map(r => gradeToNumber(r.grade));
  const chartData = {
    labels,
    datasets: [
      {
        label: "Grade",
        data,
        fill: false,
        borderColor: "#2563eb",
        backgroundColor: "#60a5fa",
        tension: 0.3,
        pointRadius: 3,
      },
    ],
  };
  const options = {
    responsive: true,
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => {
            const val = ctx.parsed.y;
            if (val === 3) return "Mumtaz";
            if (val === 2) return "Jayyid Jiddan";
            if (val === 1) return "Jayyid";
            return "-";
          }
        }
      }
    },
    scales: {
      y: {
        min: 0,
        max: 3,
        ticks: {
          stepSize: 1,
          callback: function (
            this: any,
            tickValue: string | number,
            index: number,
            ticks: any[]
          ) {
            if (typeof tickValue === "number") {
              if (tickValue === 3) return "Mumtaz";
              if (tickValue === 2) return "Jayyid Jiddan";
              if (tickValue === 1) return "Jayyid";
              return "-";
            }
            return tickValue;
          }
        }
      }
    }
  };
  return <Line data={chartData} options={options} height={120} />;
}

export default function ParentReportTable({ parentId }: { parentId: string }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  // Pagination state: studentId -> page number
  const [page, setPage] = useState<{ [studentId: string]: number }>({});
  const recordsPerPage = 10;


  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      // Fetch children (students) for this parent
      const { data: studentData } = await supabase
        .from("students")
        .select("id, name")
        .eq("parent_id", parentId);
      setStudents(studentData || []);
      // Fetch all reports for these students
      if (studentData && studentData.length > 0) {
        const studentIds = studentData.map((s: Student) => s.id);
        const { data: reportData } = await supabase
          .from("reports")
          .select("*")
          .in("student_id", studentIds);
        setReports(reportData || []);
      } else {
        setReports([]);
      }
      setLoading(false);
    }
    if (parentId) fetchData();
  }, [parentId]);

  if (loading) return <div>Loading reports...</div>;
  if (students.length === 0) return <div>You have no registered children in the system.</div>;

  // CSV download utility
  function downloadCSV(student: Student, studentReports: Report[]) {
    // --- Data Processing ---
    const reportsByMonth = studentReports.reduce((acc, report) => {
      const month = new Date(report.date).toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!acc[month]) {
        acc[month] = { tasmi: [], murajaah: [] };
      }
      if (report.type.toLowerCase().includes('tasmi')) {
        acc[month].tasmi.push(report);
      } else {
        acc[month].murajaah.push(report);
      }
      return acc;
    }, {} as Record<string, { tasmi: Report[], murajaah: Report[] }>);

    const sortedMonths = Object.keys(reportsByMonth).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    // --- CSV Generation ---
    const headers = ["Date", "Type", "Surah", "Juzuk", "Ayat", "Page", "Grade"];
    let csvString = `Hafazan Report for ${student.name}\n\n`;

    for (const month of sortedMonths) {
      csvString += `${month}\n`;
      const { tasmi, murajaah } = reportsByMonth[month];

      if (tasmi.length > 0) {
        csvString += `Tasmi Reports\n`;
        csvString += headers.join(',') + '\n';
        tasmi.forEach(r => {
          const pageRange = (r.page_from && r.page_to) ? 
            `${Math.min(r.page_from, r.page_to)}-${Math.max(r.page_from, r.page_to)}` : 
            `${r.page_from ?? ''}-${r.page_to ?? ''}`;
          const row = [r.date, r.type, r.surah, r.juzuk ?? '', `${r.ayat_from}-${r.ayat_to}`, pageRange, r.grade ?? ''];
          csvString += row.map(val => `"${val}"`).join(',') + '\n';
        });
        csvString += '\n';
      }

      if (murajaah.length > 0) {
        csvString += `Murajaah Reports\n`;
        csvString += headers.join(',') + '\n';
        murajaah.forEach(r => {
          const pageRange = (r.page_from && r.page_to) ? 
            `${Math.min(r.page_from, r.page_to)}-${Math.max(r.page_from, r.page_to)}` : 
            `${r.page_from ?? ''}-${r.page_to ?? ''}`;
          const row = [r.date, r.type, r.surah, r.juzuk ?? '', `${r.ayat_from}-${r.ayat_to}`, pageRange, r.grade ?? ''];
          csvString += row.map(val => `"${val}"`).join(',') + '\n';
        });
        csvString += '\n';
      }
    }

    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `${student.name}_report_${new Date().toISOString().slice(0,10)}.csv`);
    a.style.visibility = 'hidden';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // PDF download utility
  async function downloadPDF(student: Student, studentReports: Report[]) {
    const doc = new jsPDF();

    // --- Helper to load image ---
    async function loadImageAsBase64(url: string): Promise<string> {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    // --- Data Processing ---
    const reportsByMonth = studentReports.reduce((acc, report) => {
      const month = new Date(report.date).toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!acc[month]) acc[month] = { tasmi: [], murajaah: [] };
      if (report.type.toLowerCase().includes('tasmi')) acc[month].tasmi.push(report);
      else acc[month].murajaah.push(report);
      return acc;
    }, {} as Record<string, { tasmi: Report[], murajaah: Report[] }>);

    const sortedMonths = Object.keys(reportsByMonth).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    // --- PDF Styling & Content ---
    const TASMI_COLOR: [number, number, number] = [22, 163, 74];
    const MURAJAAH_COLOR: [number, number, number] = [37, 99, 235];
    const pageHeight = doc.internal.pageSize.height;

    // --- Header --- 
    const logoImg = await loadImageAsBase64('/logo-akademi.png');
    doc.addImage(logoImg, 'PNG', 14, 12, 20, 20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('AKADEMI AL-KHAYR', 40, 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('White Resort Camp, Mukim 7 & Mukim J, Kampung Genting,', 40, 23);
    doc.text('11000 Balik Pulau, Penang | 019-381 8616', 40, 28);
    doc.setDrawColor(200);
    doc.line(14, 38, 196, 38);

    // --- Report Title & Student Info ---
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Hafazan Progress Report', 14, 50);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Student: ${student.name}`, 14, 58);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 196, 58, { align: 'right' });

    // --- Completion Bar ---
    const maxPage = Math.max(...studentReports.map(r => r.page_to ?? 0), 0);
    const totalQuranPages = 604;
    const percent = Math.min((maxPage / totalQuranPages) * 100, 100);
    doc.setFontSize(10);
    doc.text('Overall Quran Completion', 14, 72);
    doc.setFontSize(9);
    doc.text(`${maxPage} / ${totalQuranPages} pages`, 196, 72, { align: 'right' });
    doc.setDrawColor(220);
    doc.rect(14, 75, 182, 6, 'S');
    doc.setFillColor(230, 242, 255);
    doc.rect(14, 75, 182, 6, 'F');
    doc.setFillColor(59, 130, 246);
    doc.rect(14, 75, 182 * (percent / 100), 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255);
    if (percent > 10) { // Only show text if there's enough space
      doc.text(`${percent.toFixed(1)}%`, 14 + (182 * (percent / 100)) / 2, 79.5, { align: 'center' });
    }
    doc.setTextColor(0);

    let yPos = 90;

    // --- Footer --- 
    const addFooter = () => {
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(9);
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, pageHeight - 10);
      doc.text(`Page ${pageCount}`, 196, pageHeight - 10, { align: 'right' });
    };

    // --- Report Tables ---
    for (const month of sortedMonths) {
      if (yPos > pageHeight - 40) { // Check space for month header
        addFooter();
        doc.addPage();
        yPos = 20;
      }
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(month, 14, yPos);
      yPos += 8;

      const { tasmi, murajaah } = reportsByMonth[month];
      const tableCols = ["Date", "Surah", "Ayat", "Page", "Grade"];

      if (tasmi.length > 0) {
        autoTable(doc, {
          startY: yPos,
          head: [[{ content: 'Tasmi Reports', colSpan: 5, styles: { fillColor: TASMI_COLOR, textColor: 255, fontStyle: 'bold' } } ], tableCols],
          body: tasmi.map(r => [
            r.date, 
            r.surah, 
            `${r.ayat_from}-${r.ayat_to}`, 
            (r.page_from && r.page_to) ? 
              `${Math.min(r.page_from, r.page_to)}-${Math.max(r.page_from, r.page_to)}` : 
              `${r.page_from ?? '-'}-${r.page_to ?? '-'}`,
            r.grade ?? '-'
          ]),
          theme: 'grid',
          headStyles: { fillColor: [240, 240, 240], textColor: 30, fontStyle: 'bold' },
          didDrawPage: (data) => { addFooter(); if (data.cursor) { yPos = data.cursor.y; } }
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
      }

      if (murajaah.length > 0) {
        autoTable(doc, {
          startY: yPos,
          head: [[{ content: 'Murajaah Reports', colSpan: 5, styles: { fillColor: MURAJAAH_COLOR, textColor: 255, fontStyle: 'bold' } } ], tableCols],
          body: murajaah.map(r => [
            r.date, 
            r.surah, 
            `${r.ayat_from}-${r.ayat_to}`, 
            (r.page_from && r.page_to) ? 
              `${Math.min(r.page_from, r.page_to)}-${Math.max(r.page_from, r.page_to)}` : 
              `${r.page_from ?? '-'}-${r.page_to ?? '-'}`,
            r.grade ?? '-'
          ]),
          theme: 'grid',
          headStyles: { fillColor: [240, 240, 240], textColor: 30, fontStyle: 'bold' },
          didDrawPage: (data) => { addFooter(); if (data.cursor) { yPos = data.cursor.y; } }
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
      }
    }
    
    addFooter();
    doc.save(`${student.name}_report_${new Date().toISOString().slice(0,10)}.pdf`);
  }

  return (
    <div className="mt-8">
      <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Your Children's Reports</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {students.map((student) => {
          const studentReports = reports
            .filter((r) => r.student_id === student.id)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Descending
          const currentPage = page[student.id] || 1;
          const totalPages = Math.ceil(studentReports.length / recordsPerPage);
          const pagedReports = studentReports.slice(
            (currentPage - 1) * recordsPerPage,
            currentPage * recordsPerPage
          );
          return (
            <Card key={student.id} className="rounded-xl shadow-md bg-white/60 min-h-[120px] flex flex-col justify-between">
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>{student.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="font-semibold text-base text-gray-800 dark:text-white">{student.name}</span>
                </div>
                {studentReports.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="rounded-full hover:bg-blue-100/50 text-gray-600 hover:text-blue-700 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => downloadCSV(student, studentReports)}>
                        Download as CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => downloadPDF(student, studentReports)}>
                        Download as PDF
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <div className={studentReports.length > 0 ? "p-4" : "p-2"}>
                {studentReports.length > 0 ? (
                  <>
                    {/* Progress Bar for Quran Completion */}
                    <QuranProgressBar reports={studentReports} />
                    <ChartTabs reports={studentReports} />
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Surah</TableHead>
                          <TableHead>Juzuk</TableHead>
                          <TableHead>Ayat</TableHead>
                          <TableHead>Page</TableHead>
                          <TableHead>Grade</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedReports.map((r: Report) => (
                          <TableRow key={r.id}>
                            <TableCell>{student.name}</TableCell>
                            <TableCell>{r.date}</TableCell>
                            <TableCell>{r.type}</TableCell>
                            <TableCell>{r.surah}</TableCell>
                            <TableCell>{r.juzuk ?? '-'}</TableCell>
                            <TableCell>{r.ayat_from} - {r.ayat_to}</TableCell>
                            <TableCell>
                              {(r.page_from && r.page_to) ? 
                                `${Math.min(r.page_from, r.page_to)} - ${Math.max(r.page_from, r.page_to)}` : 
                                `${r.page_from ?? '-'} - ${r.page_to ?? '-'}`
                              }
                            </TableCell>
                            <TableCell>{r.grade ?? '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {totalPages > 1 && (
                      <div className="flex justify-center mt-4 gap-2">
                        <button
                          className="px-2 py-1 border rounded disabled:opacity-50"
                          onClick={() => setPage((prev) => ({ ...prev, [student.id]: Math.max(1, currentPage - 1) }))}
                          disabled={currentPage === 1}
                        >
                          Prev
                        </button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                          <button
                            key={p}
                            className={`px-2 py-1 border rounded ${p === currentPage ? 'bg-blue-500 text-white' : ''}`}
                            onClick={() => setPage((prev) => ({ ...prev, [student.id]: p }))}
                          >
                            {p}
                          </button>
                        ))}
                        <button
                          className="px-2 py-1 border rounded disabled:opacity-50"
                          onClick={() => setPage((prev) => ({ ...prev, [student.id]: Math.min(totalPages, currentPage + 1) }))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-4 text-gray-400">
                    <span className="text-xl mb-1">📄</span>
                    <span className="text-xs">No reports found.</span>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
