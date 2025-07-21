"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import jsPDF from "jspdf";
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
    const headers = ["Date","Type","Surah","Juzuk","Ayat","Page","Grade"];
    const rows = studentReports.map(r => [
      r.date,
      r.type,
      r.surah,
      r.juzuk ?? '-',
      `${r.ayat_from} - ${r.ayat_to}`,
      `${r.page_from ?? '-'} - ${r.page_to ?? '-'}`,
      r.grade ?? '-'
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${student.name}-reports.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // PDF download utility
  function downloadPDF(student: Student, studentReports: Report[]) {
  // Helper to convert image to base64
  function loadImageAsBase64(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = 'Anonymous';
      img.onload = function () {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  loadImageAsBase64('/logo-akademi.png').then((imgData) => {
    const doc = new jsPDF();
    // --- Header ---
    doc.setFontSize(18);
    doc.text('AKADEMI AL-KHAYR', 105, 18, { align: 'center' });
    // Add the logo image (width: 18, height: 18)
    doc.addImage(imgData, 'PNG', 15, 10, 18, 18);
    doc.setFontSize(10);
    doc.text('Akademi Al Khayr, White Resort Camp,', 105, 25, { align: 'center' });
    doc.text('Mukim 7 & Mukim J, Kampung Genting,', 105, 30, { align: 'center' });
    doc.text('11000 Balik Pulau, Penang', 105, 35, { align: 'center' });
    doc.text('Phone: 019-381 8616 | Email: akademialkhayrofficial@gmail.com', 105, 40, { align: 'center' });
    doc.setLineWidth(0.5);
    doc.line(10, 44, 200, 44);

    // --- Student Info ---
    doc.setFontSize(12);
    doc.text(`Student Name: ${student.name}`, 14, 52);
    doc.text(`Report Date: ${new Date().toLocaleDateString()}`, 14, 58);

    // --- Table ---
    const headers = ["Date","Type","Surah","Juzuk","Ayat","Page","Grade"];
    let y = 68;
    doc.setFontSize(11);
    headers.forEach((h, i) => {
      doc.setFillColor(220, 230, 241);
      doc.rect(10 + i * 27, y, 27, 8, 'F');
      doc.text(h, 10 + i * 27 + 2, y + 6);
    });
    y += 10;
    doc.setFontSize(10);
    studentReports.forEach((r, idx) => {
      const row = [
        r.date,
        r.type,
        r.surah,
        r.juzuk ?? '-',
        `${r.ayat_from} - ${r.ayat_to}`,
        `${r.page_from ?? '-'} - ${r.page_to ?? '-'}`,
        r.grade ?? '-'
      ];
      row.forEach((cell, i) => {
        doc.text(String(cell), 10 + i * 27 + 2, y + 6);
      });
      y += 8;
      if (y > 250) {
        // --- Footer ---
        doc.setFontSize(9);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 12, 285);
        doc.text('Principal/Authorized Signature: __________________', 120, 285);
        doc.text(`Page ${doc.internal.getNumberOfPages ? doc.internal.getNumberOfPages() : ''}`, 200, 285, { align: 'right' });
        doc.addPage();
        y = 18;
      }
    });

    // --- Final Footer on last page ---
    doc.setFontSize(9);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 12, 285);
    doc.text('Principal/Authorized Signature: __________________', 120, 285);
    doc.text(`Page ${doc.internal.getNumberOfPages ? doc.internal.getNumberOfPages() : ''}`, 200, 285, { align: 'right' });

    // --- Save ---
    doc.save(`${student.name}-reports.pdf`);
  });
} // Correctly close the downloadPDF function here

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
                      <Button variant="outline" size="icon" title="Download">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-8m0 8l-3-3m3 3l3-3m-9 5a2 2 0 002 2h8a2 2 0 002-2V6a2 2 0 00-2-2h-3.5a.5.5 0 01-.5-.5V3.5a.5.5 0 00-.5-.5h-1a.5.5 0 00-.5.5V4a.5.5 0 01-.5.5H6a2 2 0 00-2 2v12z" />
                        </svg>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => downloadCSV(student, studentReports)}>
                        <span title="Download as CSV" aria-label="Download as CSV">
                          <svg xmlns="http://www.w3.org/2000/svg" className="inline w-4 h-4 text-blue-600 hover:text-blue-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 011-2h2.586a2 2 0 011.707.293l3.686.814 3.686-.814a2 2 0 01.707.293h2.586a3 3 0 01-2 2.5 2.5 0 01-2.5-2.5V6a2.5 2.5 0 00-2.5-2.5H9a2.5 2.5 0 00-2.5 2.5V16a2.5 2.5 0 012.5 2.5z" />
                          </svg>
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => downloadPDF(student, studentReports)}>
                        <span title="Download as PDF" aria-label="Download as PDF">
                          <svg xmlns="http://www.w3.org/2000/svg" className="inline w-4 h-4 text-blue-600 hover:text-blue-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 011-2h2.586a2 2 0 011.707.293l3.686.814 3.686-.814a2 2 0 01.707.293h2.586a3 3 0 01-2 2.5 2.5 0 01-2.5-2.5V6a2.5 2.5 0 00-2.5-2.5H9a2.5 2.5 0 00-2.5 2.5V16a2.5 2.5 0 012.5 2.5z" />
                          </svg>
                        </span>
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
                            <TableCell>{r.page_from ?? '-'} - {r.page_to ?? '-'}</TableCell>
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
