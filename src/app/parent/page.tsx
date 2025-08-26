"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { QuranProgressBar, ChartTabs } from "@/components/ReportCharts";
import { MultiMurajaahConcentricChart } from "@/components/MultiMurajaahConcentricChart";
import Navbar from "@/components/Navbar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import ParentFullRecordsModal from "@/components/parent/ParentFullRecordsModal";
import JuzTestProgressLineChart from "@/components/teacher/JuzTestProgressLineChart";
import {
  StudentProgressData,
  calculateDaysSinceLastRead,
  formatAbsoluteDate,
  getInactivityRowClass,
  filterStudentsBySearch,
  getSummaryStats,
  SummaryStats
} from "@/lib/reportUtils";
import { formatMurajaahDisplay } from "@/lib/quranMapping";
import type { Report } from "@/types/teacher";
import jsPDF from "jspdf";
import autoTable from 'jspdf-autotable';
import { getWeekBoundaries } from "@/lib/gradeUtils";


type ViewMode = 'tasmik' | 'murajaah' | 'juz_tests';


export default function ParentPage() {
  const [parentId, setParentId] = useState<string | null>(null);
  const [children, setChildren] = useState<StudentProgressData[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  
  // View and filter state
  const [viewMode, setViewMode] = useState<ViewMode>('tasmik');
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  // Sorting UI removed; default to name order in view
  
  // Full records modal
  const [showFullRecordsModal, setShowFullRecordsModal] = useState(false);
  const [fullRecordsChild, setFullRecordsChild] = useState<StudentProgressData | null>(null);

  // Auth check
  useEffect(() => {
    async function getUser() {
      setLoading(true);
      const { data } = await supabase.auth.getUser();
      if (data?.user) setParentId(data.user.id);
      setLoading(false);
    }
    getUser();
  }, []);

  // Debounce search term
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // Fetch children data
  const fetchChildrenData = useCallback(async () => {
    if (!parentId) return;
    setLoading(true);

    try {
      // Fetch children (students) for this parent
      const { data: studentsData, error: studentsError } = await supabase
        .from("students")
        .select(`
          id,
          name,
          assigned_teacher_id,
          class_id,
          memorization_completed,
          memorization_completed_date,
          users!assigned_teacher_id (name),
          classes (name)
        `)
        .eq("parent_id", parentId);

      if (studentsError || !studentsData) {
        setChildren([]);
        setReports([]);
        return;
      }

      const studentIds = studentsData.map(s => s.id);
      
      if (viewMode === 'juz_tests') {
        // For juz tests, we need different data structure
        const [memorizationResult, juzTestsResult] = await Promise.all([
          // Get highest memorized juz from Tasmi reports
          supabase
            .from("reports")
            .select("student_id, juzuk")
            .in("student_id", studentIds)
            .eq("type", "Tasmi")
            .not("juzuk", "is", null)
            .order("juzuk", { ascending: false }),
          
          // Get juz test data
          supabase
            .from("juz_tests")
            .select("student_id, juz_number, test_date, passed, total_percentage")
            .in("student_id", studentIds)
            .order("test_date", { ascending: false })
            .then(result => {
              if (result.error?.message?.includes('relation "public.juz_tests" does not exist')) {
                return { data: [], error: null };
              }
              return result;
            })
        ]);

        setReports([]); // No regular reports for juz tests view
        
        // Process juz test data
        const childrenProgressData = studentsData.map(student => {
          // Find highest memorized juz for this student
          const studentMemorization = memorizationResult.data?.filter(r => r.student_id === student.id) || [];
          const highestMemorizedJuz = studentMemorization.length > 0 
            ? Math.max(...studentMemorization.map(r => r.juzuk || 0))
            : 0;

          // Find latest test for this student
          const allStudentTests = juzTestsResult.data?.filter(r => r.student_id === student.id) || [];
          const latestTest = allStudentTests.length > 0 ? allStudentTests[0] : null;
          
          // Find highest passed test
          const passedTests = allStudentTests.filter(t => t.passed);
          const highestPassedJuz = passedTests.length > 0 
            ? Math.max(...passedTests.map(t => t.juz_number))
            : 0;
          
          const gap = highestMemorizedJuz - highestPassedJuz;

          return {
            id: student.id,
            name: student.name,
            teacher_name: (student.users as { name?: string } | null)?.name || null,
            class_name: (student.classes as { name?: string } | null)?.name || null,
            latest_reading: `Memorized: Juz ${highestMemorizedJuz}`,
            last_read_date: latestTest?.test_date || null,
            days_since_last_read: latestTest?.test_date ? calculateDaysSinceLastRead(latestTest.test_date) : 999,
            report_type: 'juz_test',
            memorization_completed: (student as { memorization_completed?: boolean }).memorization_completed,
            memorization_completed_date: (student as { memorization_completed_date?: string }).memorization_completed_date,
            highest_memorized_juz: highestMemorizedJuz,
            highest_passed_juz: highestPassedJuz,
            juz_test_gap: gap,
            latest_test_result: latestTest
          } as StudentProgressData & {
            highest_memorized_juz?: number;
            highest_passed_juz?: number;
            juz_test_gap?: number;
            latest_test_result?: {
              juz_number: number;
              test_date: string;
              passed: boolean;
              total_percentage: number;
            };
          };
        });

        setChildren(childrenProgressData);
      } else {
        // Regular tasmik/murajaah logic
        let reportsQuery = supabase
          .from("reports")
          .select("*")
          .in("student_id", studentIds);
        
        if (viewMode === 'tasmik') {
          reportsQuery = reportsQuery.eq("type", "Tasmi");
        } else if (viewMode === 'murajaah') {
          // Include Tasmi as well so charts can compute Murajaah target boundary from latest Tasmi
          reportsQuery = reportsQuery.in("type", ["Tasmi", "Murajaah", "Old Murajaah", "New Murajaah"]);
        }
        
        const { data: allReports } = await reportsQuery.order("date", { ascending: false });
        setReports(allReports || []);
      
        // Group reports by student
        const reportsByStudent = (allReports || []).reduce((acc, report) => {
          if (!acc[report.student_id]) acc[report.student_id] = [];
          acc[report.student_id].push(report);
          return acc;
        }, {} as Record<string, Report[]>);

        // Process student progress data
        const childrenProgressData = studentsData.map(student => {
          const studentReports = reportsByStudent[student.id] || [];
          const latestReport = studentReports[0]; // Already sorted by date desc
          const daysSinceLastRead = latestReport 
            ? calculateDaysSinceLastRead(latestReport.date)
            : 999;

          let latestReading = null;
          if (latestReport) {
            if (latestReport.type === 'Tasmi') {
              latestReading = `${latestReport.surah} (${latestReport.ayat_from}-${latestReport.ayat_to})`;
            } else {
              // Use formatMurajaahDisplay for Murajaah reports
              if (latestReport.page_from && latestReport.page_to) {
                latestReading = formatMurajaahDisplay(latestReport.page_from, latestReport.page_to);
              } else if (latestReport.juzuk) {
                latestReading = `Juz ${latestReport.juzuk}`;
              } else {
                latestReading = latestReport.surah;
              }
            }
          }

          return {
            id: student.id,
            name: student.name,
            teacher_name: (student.users as { name?: string } | null)?.name || null,
            class_name: (student.classes as { name?: string } | null)?.name || null,
            latest_reading: latestReading,
            last_read_date: latestReport?.date || null,
            days_since_last_read: daysSinceLastRead,
            report_type: latestReport?.type || null,
            memorization_completed: (student as { memorization_completed?: boolean }).memorization_completed,
            memorization_completed_date: (student as { memorization_completed_date?: string }).memorization_completed_date
          } as StudentProgressData;
        });

        setChildren(childrenProgressData);
      }
    } catch (err) {
      console.error("Failed to fetch children data:", err);
    } finally {
      setLoading(false);
    }
  }, [parentId, viewMode]);

  useEffect(() => {
    if (parentId) {
      fetchChildrenData();
    }
  }, [fetchChildrenData, parentId]);

  // Filtered and sorted children (always sort by name)
  const filteredChildren = useMemo(() => {
    const filtered = filterStudentsBySearch(children, debouncedSearchTerm);
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [children, debouncedSearchTerm]);

  // Summary statistics
  const summaryStats: SummaryStats = useMemo(() => {
    if (viewMode === 'juz_tests') {
      // For Juz Tests, show gap-based stats instead of activity-based
      const childrenWithGaps = filteredChildren.filter(child => {
        const extChild = child as StudentProgressData & { juz_test_gap?: number };
        return (extChild.juz_test_gap || 0) > 0;
      });
      const childrenWithLargeGaps = filteredChildren.filter(child => {
        const extChild = child as StudentProgressData & { juz_test_gap?: number };
        return (extChild.juz_test_gap || 0) >= 3;
      });
      
      return {
        totalStudents: filteredChildren.length,
        inactive7Days: childrenWithGaps.length, // Children with any gap
        inactive14Days: childrenWithLargeGaps.length // Children with large gaps (3+)
      };
    }
    return getSummaryStats(filteredChildren);
  }, [filteredChildren, viewMode]);

  // Handle full records view
  const handleFullRecords = useCallback((child: StudentProgressData) => {
    setFullRecordsChild(child);
    setShowFullRecordsModal(true);
  }, []);

  // CSV download utility - only for Tasmik data
  const downloadCSV = (child: StudentProgressData, childReports: Report[]) => {
    // Filter out Murajaah reports
    const tasmikReports = childReports.filter(report => report.type === 'Tasmi');
    const reportsByMonth = tasmikReports.reduce((acc, report) => {
      const month = new Date(report.date).toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!acc[month]) {
        acc[month] = { tasmi: [] };
      }
      acc[month].tasmi.push(report);
      return acc;
    }, {} as Record<string, { tasmi: Report[] }>);

    const sortedMonths = Object.keys(reportsByMonth).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    const headers = ["Date", "Type", "Surah", "Juzuk", "Ayat", "Page", "Grade"];
    let csvString = `Tasmik Report for ${child.name}\n\n`;

    for (const month of sortedMonths) {
      csvString += `${month}\n`;
      const { tasmi } = reportsByMonth[month];

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
    }

    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `${child.name}_report_${new Date().toISOString().slice(0,10)}.csv`);
    a.style.visibility = 'hidden';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // PDF download utility - only for Tasmik data
  const downloadPDF = async (child: StudentProgressData, childReports: Report[]) => {
    // Filter out Murajaah reports
    const tasmikReports = childReports.filter(report => report.type === 'Tasmi');
    const doc = new jsPDF();

    // Helper to load image
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

    // Data processing - only Tasmik reports
    const reportsByMonth = tasmikReports.reduce((acc, report) => {
      const month = new Date(report.date).toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!acc[month]) acc[month] = { tasmi: [] };
      acc[month].tasmi.push(report);
      return acc;
    }, {} as Record<string, { tasmi: Report[] }>);

    const sortedMonths = Object.keys(reportsByMonth).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    const TASMI_COLOR: [number, number, number] = [22, 163, 74];
    const pageHeight = doc.internal.pageSize.height;

    // Header
    try {
      const logoImg = await loadImageAsBase64('/logo-akademi.png');
      doc.addImage(logoImg, 'PNG', 14, 12, 20, 20);
    } catch {
      // Continue without logo if not found
    }
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('AKADEMI AL-KHAYR', 40, 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('White Resort Camp, Mukim 7 & Mukim J, Kampung Genting,', 40, 23);
    doc.text('11000 Balik Pulau, Penang | 019-381 8616', 40, 28);
    doc.setDrawColor(200);
    doc.line(14, 38, 196, 38);

    // Report title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Tasmik Progress Report', 14, 50);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Student: ${child.name}`, 14, 58);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 196, 58, { align: 'right' });
    
    // Overall Quran Completion Progress Bar
    const maxPage = Math.max(
      ...tasmikReports.map(r => (r.page_to !== null && !isNaN(r.page_to) ? r.page_to : 0)),
      0
    );
    const percent = Math.min((maxPage / 604) * 100, 100);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Overall Quran Completion Progress', 14, 70);
    
    // Draw progress bar background
    doc.setFillColor(240, 240, 240);
    doc.rect(14, 72, 170, 6, 'F');
    
    // Draw progress bar fill
    if (percent > 0) {
      doc.setFillColor(34, 197, 94); // Green color
      doc.rect(14, 72, (170 * percent) / 100, 6, 'F');
    }
    
    // Add progress text
    doc.setFont('helvetica', 'normal');
    doc.text(`${maxPage} / 604 pages (${percent.toFixed(1)}%)`, 196, 76, { align: 'right' });

    let yPos = 85;
    const addFooter = () => {
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(9);
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, pageHeight - 10);
      doc.text(`Page ${pageCount}`, 196, pageHeight - 10, { align: 'right' });
    };

    // Report tables
    for (const month of sortedMonths) {
      if (yPos > pageHeight - 40) {
        addFooter();
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(month, 14, yPos);
      yPos += 8;

      const { tasmi } = reportsByMonth[month];
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          didDrawPage: (data: any) => { addFooter(); if (data.cursor) { yPos = data.cursor.y; } }
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        yPos = (doc as any).lastAutoTable?.finalY + 10 || yPos + 20;
      }
    }
    
    addFooter();
    doc.save(`${child.name}_report_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9] flex items-center justify-center">
        <div className="text-xl text-gray-800">Loading children progress...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9]">
      <Navbar />
      <div className="relative p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <header className="mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Children Progress Monitor</h1>
              <p className="text-gray-600">Monitor your children&apos;s Quran memorization progress</p>
            </div>
          </header>

          {/* Summary Cards - Simplified */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold text-gray-900">{summaryStats.totalStudents}</div>
                  <div className="text-gray-600 font-medium">Total Children</div>
                </div>
                <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.664-.833-2.464 0L4.34 16.5c-.77.833.192 2.5 1.732 2.5z"/>
                  </svg>
                </div>
              </div>
            </Card>
          </div>

          {/* Charts Section */}
          {viewMode !== 'juz_tests' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Children Progress Overview</h3>
                {filteredChildren.length > 0 && (
                  selectedStudentId ? (
                    <QuranProgressBar
                      reports={reports.filter(r => {
                        const isRelevantChild = r.student_id === selectedStudentId;
                        if (!isRelevantChild) return false;
                        if (viewMode === 'tasmik') {
                          return r.type === 'Tasmi';
                        } else if (viewMode === 'murajaah') {
                          return r.type === 'Tasmi' || ['Murajaah', 'Old Murajaah', 'New Murajaah'].includes(r.type);
                        }
                        return true;
                      })}
                      viewMode={viewMode}
                    />
                  ) : (
                    viewMode === 'murajaah' ? (
                      <MultiMurajaahConcentricChart
                        students={filteredChildren.map(c => ({ id: c.id, name: c.name }))}
                        reports={reports.filter(r => filteredChildren.some(c => c.id === r.student_id))}
                      />
                    ) : (
                      <div className="space-y-4">
                        {filteredChildren.map(child => {
                          const childReports = reports.filter(r => {
                            if (r.student_id !== child.id) return false;
                            if (viewMode === 'tasmik') {
                              return r.type === 'Tasmi';
                            } else if (viewMode === 'murajaah') {
                              return r.type === 'Tasmi' || ['Murajaah', 'Old Murajaah', 'New Murajaah'].includes(r.type);
                            }
                            return true;
                          });
                          return (
                            <div key={child.id}>
                              <div className="text-sm font-semibold text-gray-800 mb-1">{child.name}</div>
                              <QuranProgressBar reports={childReports} viewMode={viewMode} />
                            </div>
                          );
                        })}
                      </div>
                    )
                  )
                )}
              </Card>
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Activity Analytics</h3>
                <ChartTabs 
                  selectedStudentId={selectedStudentId} 
                  studentNamesMap={Object.fromEntries(filteredChildren.map(c => [c.id, c.name]))}
                  groupByStudentOverride={!selectedStudentId}
                  reports={reports.filter(r => {
                  const isRelevantChild = selectedStudentId 
                    ? r.student_id === selectedStudentId 
                    : filteredChildren.some(c => c.id === r.student_id);
                  if (!isRelevantChild) return false;
                  
                  // Filter by report type based on viewMode
                  if (viewMode === 'tasmik') {
                    return r.type === 'Tasmi';
                  } else if (viewMode === 'murajaah') {
                    return ['Murajaah', 'Old Murajaah', 'New Murajaah'].includes(r.type);
                  }
                  return true;
                })}
                />
              </Card>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 mb-6">
              <JuzTestProgressLineChart 
                className="col-span-1" 
                studentId={selectedStudentId || (filteredChildren.length === 1 ? filteredChildren[0].id : undefined)}
              />
            </div>
          )}

          {/* Main Content Card */}
          <Card className="p-4">
            {/* View Toggle */}
            <div className="flex items-center justify-center mb-6">
              <div className="bg-gray-100 rounded-full p-1">
                <div className="flex">
                  <button
                    onClick={() => setViewMode('tasmik')}
                    className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                      viewMode === 'tasmik' 
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    Tasmik
                  </button>
                  <button
                    onClick={() => setViewMode('murajaah')}
                    className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                      viewMode === 'murajaah'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    Murajaah
                  </button>
                  <button
                    onClick={() => setViewMode('juz_tests')}
                    className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                      viewMode === 'juz_tests'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    Juz Tests
                  </button>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 mb-6">
              <div>
                <input
                  type="text"
                  placeholder="Search children..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
                />
              </div>
            </div>

            {/* Children Progress Table */}
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
                      {viewMode === 'juz_tests' ? (
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
                      const childReports = reports.filter(r => r.student_id === child.id);
                      const extendedChild = child as StudentProgressData & {
                        highest_memorized_juz?: number;
                        highest_passed_juz?: number;
                        juz_test_gap?: number;
                        latest_test_result?: {
                          juz_number: number;
                          test_date: string;
                          passed: boolean;
                          total_percentage: number;
                        };
                      };
                      
                      const rowClass = viewMode === 'juz_tests' 
                        ? (extendedChild.juz_test_gap && extendedChild.juz_test_gap > 0 
                            ? extendedChild.juz_test_gap >= 3 
                              ? 'bg-red-50/80' 
                              : extendedChild.juz_test_gap >= 1 
                                ? 'bg-yellow-50/80' 
                                : ''
                            : '')
                        : getInactivityRowClass(child.days_since_last_read, child.memorization_completed);
                      
                      return (
                        <tr key={child.id} className={`${rowClass}`}>
                          <td className="px-4 py-3 font-medium text-gray-900">
                            <div>
                              <button
                                onClick={() => setSelectedStudentId(prev => prev === child.id ? null : child.id)}
                                className={`font-semibold underline-offset-2 ${selectedStudentId === child.id ? 'text-blue-700 underline' : 'text-blue-600 hover:underline'}`}
                                title={selectedStudentId === child.id ? 'Showing charts for this student' : 'Show charts for this student'}
                              >
                                {child.name}
                              </button>
                              {child.class_name && (
                                <div className="text-xs text-gray-600">{child.class_name}</div>
                              )}
                              {child.teacher_name && (
                                <div className="text-xs text-gray-500">Teacher: {child.teacher_name}</div>
                              )}
                              {child.memorization_completed && (
                                <div className="mt-1">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                    Completed
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                          
                          {viewMode === 'juz_tests' ? (
                            <>
                              <td className="px-4 py-3 text-gray-600">
                                <div className="text-sm font-medium">
                                  Juz {extendedChild.highest_memorized_juz || 0}
                                </div>
                                <div className="text-xs text-gray-500">Memorized</div>
                              </td>
                              <td className="px-4 py-3 text-center text-gray-600">
                                <div className="text-sm">
                                  {extendedChild.latest_test_result ? (
                                    <>
                                      <div className="font-medium">
                                        Juz {extendedChild.latest_test_result.juz_number}
                                      </div>
                                      <div className={`text-xs font-medium ${
                                        extendedChild.latest_test_result.passed 
                                          ? 'text-green-600' 
                                          : 'text-red-600'
                                      }`}>
                                        {extendedChild.latest_test_result.total_percentage}% 
                                        ({extendedChild.latest_test_result.passed ? 'PASSED' : 'FAILED'})
                                      </div>
                                      <div className="text-xs text-gray-500">
                                        {formatAbsoluteDate(child.last_read_date)}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-gray-400 italic">No tests</div>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex flex-col items-center">
                                  <span className={`text-lg font-bold ${
                                    (extendedChild.juz_test_gap || 0) >= 3 
                                      ? 'text-red-600' 
                                      : (extendedChild.juz_test_gap || 0) >= 1 
                                        ? 'text-yellow-600' 
                                        : 'text-green-600'
                                  }`}>
                                    {extendedChild.juz_test_gap || 0}
                                  </span>
                                  <span className={`text-xs font-medium ${
                                    (extendedChild.juz_test_gap || 0) >= 3 
                                      ? 'text-red-500' 
                                      : (extendedChild.juz_test_gap || 0) >= 1 
                                        ? 'text-yellow-500' 
                                        : 'text-green-500'
                                  }`}>
                                    {(extendedChild.juz_test_gap || 0) === 0 
                                      ? 'Up to date' 
                                      : `${extendedChild.juz_test_gap} behind`
                                    }
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
                                  {child.last_read_date ? (() => {
                                    const { monday } = getWeekBoundaries(child.last_read_date);
                                    const mondayDate = new Date(monday);
                                    const weekIndex = Math.floor((mondayDate.getDate() - 1) / 7) + 1;
                                    const monthName = mondayDate.toLocaleString('default', { month: 'short' });
                                    return (
                                      <>
                                        <div>{`${monthName} W${weekIndex}`}</div>
                                      </>
                                    );
                                  })() : '-'}
                                </div>
                              </td>
                            </>
                          )}
                          
                          <td className="px-4 py-3 text-center">
                            <div className="flex flex-col gap-1">
                              {viewMode === 'tasmik' && childReports.length > 0 && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1 rounded-lg text-xs font-medium transition-colors">
                                      Export
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => downloadCSV(child, childReports)}>
                                      Download as CSV
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => downloadPDF(child, childReports)}>
                                      Download as PDF
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                              {(childReports.length > 0 || viewMode === 'juz_tests') && (
                                <button
                                  onClick={() => handleFullRecords(child)}
                                  className="bg-orange-100 hover:bg-orange-200 text-orange-700 px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                                >
                                  View Records
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredChildren.length === 0 && (
                      <tr>
                        <td colSpan={viewMode === 'juz_tests' ? 5 : 4} className="text-center py-8 text-gray-600">
                          <p>No children match the current filters.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
      
      {/* Full Records Modal */}
      {showFullRecordsModal && fullRecordsChild && (
        <ParentFullRecordsModal
          student={fullRecordsChild}
          onClose={() => {
            setShowFullRecordsModal(false);
            setFullRecordsChild(null);
          }}
          onRefresh={fetchChildrenData}
          userId={parentId || ''}
          viewMode={viewMode}
        />
      )}
    </div>
  );
}
