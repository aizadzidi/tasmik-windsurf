"use client";

import React, { useRef, useState } from 'react';
import { X, TrendingUp, TrendingDown, Award, FileText, Loader2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, BarChart, Bar } from 'recharts';
import { ResponsiveRadar } from '@nivo/radar';
import { motion, AnimatePresence } from 'framer-motion';
import Portal from '@/components/Portal';
import { StudentData } from './StudentTable';
import {
  rpcGetClassSubjectAverages,
  rpcGetStudentSubjects,
  type StudentSubjectRow,
} from '@/data/exams';
import { rpcGetConductSummary, type ConductSummary } from '@/data/conduct';
import { supabase } from '@/lib/supabaseClient';

interface StudentDetailsPanelProps {
  student: StudentData | null;
  onClose: () => void;
  classAverages?: {
    [subject: string]: number;
  };
  classOverallAvg?: number; // blended overall average for the class (preferred for benchmarks)
  isMobile?: boolean;
  selectedExamName?: string;
  reportButtonLabel?: string;
  examId?: string;
  classId?: string;
}

type SubjectSummary = {
  subject: string;
  subjectId: string;
  score: number;
  classAvg: number | null;
  grade: string;
};

type ChartDatum = SubjectSummary & { classAvgForChart?: number };

export default function StudentDetailsPanel({ 
  student, 
  onClose, 
  classAverages = {},
  classOverallAvg,
  isMobile = false,
  selectedExamName = '',
  reportButtonLabel = 'Generate Report',
  examId,
  classId
}: StudentDetailsPanelProps) {
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [subjectRows, setSubjectRows] = useState<StudentSubjectRow[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [avgMap, setAvgMap] = useState<Map<string, number | null>>(new Map());
  const [conductSummary, setConductSummary] = useState<ConductSummary | null>(null);
  const [conductSummaryLoading, setConductSummaryLoading] = useState(false);
  const [conductWeightagePct, setConductWeightagePct] = useState<number | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  React.useEffect(() => {
    if (!student?.id || !examId || !classId) {
      setSubjectRows([]);
      setSubjectsLoading(false);
      return;
    }

    let cancelled = false;
    setSubjectsLoading(true);

    (async () => {
      try {
        const data = await rpcGetStudentSubjects(supabase, examId, classId, student.id);
        if (cancelled) return;
        setSubjectRows(data);
      } catch (error) {
        if (!cancelled) {
          console.error('RPC get_exam_student_subjects failed:', error);
          setSubjectRows([]);
        }
      } finally {
        if (!cancelled) {
          setSubjectsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [student?.id, examId, classId]);

  React.useEffect(() => {
    setSelectedSubject(null);
  }, [student?.id]);

  const filled = React.useMemo(
    () => subjectRows.filter((row) => row.result_id !== null),
    [subjectRows]
  );

  React.useEffect(() => {
    if (!examId || !classId) {
      setAvgMap(new Map());
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const avgs = await rpcGetClassSubjectAverages(supabase, examId, classId);
        if (cancelled) return;
        setAvgMap(new Map(avgs.map((a) => [a.subject_id, a.class_avg])));
      } catch (e) {
        if (!cancelled) {
          // Gracefully handle missing RPC or permissions by using empty averages
          setAvgMap(new Map());
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [examId, classId]);

  // Fetch conduct weightage for this exam/class from admin metadata
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!examId) { setConductWeightagePct(null); return; }
        const res = await fetch('/api/admin/exam-metadata');
        const meta = await res.json();
        const exam = (meta?.exams || []).find((e: any) => String(e?.id) === String(examId));
        if (!exam) { if (!cancelled) setConductWeightagePct(null); return; }
        const examClasses: Array<{ conduct_weightage?: number; classes?: { id: string } }> = Array.isArray(exam?.exam_classes) ? exam.exam_classes : [];
        let pct: number | null = null;
        if (classId) {
          const found = examClasses.find((ec: any) => String(ec?.classes?.id) === String(classId));
          if (found && typeof found?.conduct_weightage !== 'undefined') pct = Number(found.conduct_weightage);
        }
        if (pct == null && examClasses.length === 1 && typeof examClasses[0]?.conduct_weightage !== 'undefined') {
          pct = Number(examClasses[0].conduct_weightage);
        }
        if (!cancelled) setConductWeightagePct(Number.isFinite(pct as number) ? (pct as number) : 0);
      } catch (e) {
        if (!cancelled) setConductWeightagePct(0);
      }
    })();
    return () => { cancelled = true; };
  }, [examId, classId]);

  const refreshConductSummary = React.useCallback(async () => {
    if (!examId || !student?.id) {
      setConductSummary(null);
      return;
    }
    setConductSummaryLoading(true);
    try {
      const summary = await rpcGetConductSummary(examId, student.id);
      setConductSummary(summary);
    } catch (error) {
      console.error('rpcGetConductSummary failed:', error);
      setConductSummary(null);
    } finally {
      setConductSummaryLoading(false);
    }
  }, [examId, student?.id]);

  React.useEffect(() => {
    refreshConductSummary();
  }, [refreshConductSummary]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!examId || !student?.id) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent)?.detail as { examId?: string; studentId?: string } | undefined;
      if (!detail) return;
      if (detail.examId && String(detail.examId) !== String(examId)) return;
      if (detail.studentId && String(detail.studentId) !== String(student.id)) return;
      refreshConductSummary();
    };
    window.addEventListener('conduct-summary-updated', handler as EventListener);
    return () => {
      window.removeEventListener('conduct-summary-updated', handler as EventListener);
    };
  }, [examId, student?.id, refreshConductSummary]);

  const resolveMark = (row: StudentSubjectRow) => {
    if (typeof row.mark === 'number' && Number.isFinite(row.mark)) return row.mark;
    if (row.mark !== null && row.mark !== undefined) {
      const parsed = Number(row.mark);
      if (Number.isFinite(parsed)) return parsed;
    }
    if (typeof row.final_score === 'number' && Number.isFinite(row.final_score)) {
      return Number(row.final_score);
    }
    if (row.final_score !== null && row.final_score !== undefined) {
      const parsed = Number(row.final_score);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  };

  const selectedSubjectRow = React.useMemo(() => {
    if (!selectedSubject) return undefined;
    return filled.find((row) => row.subject_name === selectedSubject);
  }, [filled, selectedSubject]);

  const getClassAverage = React.useCallback(
    (subjectId: string) => {
      if (!avgMap.has(subjectId)) {
        return null;
      }
      return avgMap.get(subjectId) ?? null;
    },
    [avgMap]
  );

  const subjectSummaries = React.useMemo<SubjectSummary[]>(
    () =>
      filled.map((row) => ({
        subject: row.subject_name,
        subjectId: row.subject_id,
        score: resolveMark(row),
        classAvg: getClassAverage(row.subject_id),
        grade: row.grade ?? '',
      })),
    [filled, getClassAverage]
  );

  const fmt = (value: number | null | undefined) =>
    value == null || Number.isNaN(value) ? '—' : `${value}%`;

  const toNumeric = (value: unknown): number | null => {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (Array.isArray(value) && value.length > 0) {
      const parsed = Number(value[0]);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  React.useEffect(() => {
    if (selectedSubject && !filled.some((row) => row.subject_name === selectedSubject)) {
      setSelectedSubject(null);
    }
  }, [filled, selectedSubject]);

  const handleDownloadPdf = async () => {
    try {
      if (!showReportPreview) setShowReportPreview(true);
      // Wait a tick for the preview to render
      await new Promise((r) => setTimeout(r, 150));
      const area = document.getElementById('report-print-area');
      if (!area) { alert('Report not ready'); return; }
      const html2canvas = (await import('html2canvas')).default;
      const jsPDFmod: any = await import('jspdf');
      const JsPDFCtor = jsPDFmod?.default ?? jsPDFmod?.jsPDF;
      if (!JsPDFCtor) throw new Error('jsPDF module not loaded');
      const canvas = await html2canvas(area, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: area.scrollWidth,
        windowHeight: area.scrollHeight,
        scrollY: -window.scrollY,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new JsPDFCtor('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let y = 0;
      while (y < imgHeight) {
        pdf.addImage(imgData, 'PNG', 0, -y, imgWidth, imgHeight);
        y += pageHeight;
        if (y < imgHeight) pdf.addPage();
      }
      const nameSlug = (student?.name ?? 'report').replace(/\s+/g, '-').toLowerCase();
      pdf.save(`report-${nameSlug}.pdf`);
    } catch (e) {
      console.error('PDF export failed', e);
      alert('Failed to generate PDF.');
    }
  };
  
  // Build chart points from either real exam history or fallback trend
  const buildChartData = (
    subject: { score: number; trend?: number[]; grade: string; exams?: { name: string; score: number }[] } | null | undefined,
    fallbackRow?: StudentSubjectRow,
    fixedClassAvg?: number
  ): Array<{ label: string; score: number; classAvg: number | null }> => {
    const classAvgValue = typeof fixedClassAvg === 'number' ? fixedClassAvg : null;
    // Check if subject data exists
    if (!subject) {
      if (fallbackRow) {
        const score = resolveMark(fallbackRow);
        return [
          {
            label: selectedExamName ? `${selectedExamName} (Current)` : 'Current Exam',
            score,
            classAvg: classAvgValue,
          },
        ];
      }
      return [];
    }
    
    // Prefer real exam history if available
    if (Array.isArray(subject?.exams) && subject.exams.length > 0) {
      return subject.exams
        .filter(e => typeof e.score === 'number')
        .map(e => ({
          label: e.name,
          score: e.score,
          classAvg: classAvgValue,
        }));
    }

    // No history available
    if (fallbackRow) {
      const score = resolveMark(fallbackRow);
      return [
        {
          label: selectedExamName ? `${selectedExamName} (Current)` : 'Current Exam',
          score,
          classAvg: classAvgValue,
        },
      ];
    }

    return [];
  };

  const conductPercentages = React.useMemo(() => {
    if (conductSummary) {
      return {
        discipline: conductSummary.discipline,
        effort: conductSummary.effort,
        participation: conductSummary.participation,
        motivationalLevel: conductSummary.motivational_level,
        character: conductSummary.character_score,
        leadership: conductSummary.leadership,
      };
    }
    if (!student) {
      return {
        discipline: null,
        effort: null,
        participation: null,
        motivationalLevel: null,
        character: null,
        leadership: null,
      };
    }
    if (student.conductPercentages) {
      return student.conductPercentages;
    }
    return {
      discipline: (student.conduct.discipline || 0) * 20,
      effort: (student.conduct.effort || 0) * 20,
      participation: (student.conduct.participation || 0) * 20,
      motivationalLevel: (student.conduct.motivationalLevel || 0) * 20,
      character: (student.conduct.character || 0) * 20,
      leadership: (student.conduct.leadership || 0) * 20,
    };
  }, [conductSummary, student]);

  if (!student) return null;

  const conductDisplayItems = [
    { aspect: 'Discipline', value: conductPercentages.discipline },
    { aspect: 'Effort', value: conductPercentages.effort },
    { aspect: 'Participation', value: conductPercentages.participation },
    { aspect: 'Motivational Level', value: conductPercentages.motivationalLevel },
    { aspect: 'Character', value: conductPercentages.character },
    { aspect: 'Leadership', value: conductPercentages.leadership },
  ];

  const fmtConduct = (value: number | null | undefined) =>
    value == null || Number.isNaN(value) ? '—' : `${Math.round(value)}%`;

  const conductChipLabel = conductSummary?.source === 'override' ? 'Override' : 'Average';
  const conductChipTooltip = conductSummary?.source === 'override'
    ? 'These values were entered by the class teacher at “All subjects” and override any per-subject entries.'
    : 'These values are the average of per-subject conduct entries.';
  const conductChipClass = conductSummary?.source === 'override'
    ? 'bg-amber-100 text-amber-800 border-amber-200'
    : 'bg-blue-100 text-blue-800 border-blue-200';

  const hasConductData = conductDisplayItems.some((item) => typeof item.value === 'number' && Number.isFinite(item.value));

  // Transform data for radar chart - use percentage values with 100% as perfect
  const radarData = conductDisplayItems.map(({ aspect, value }) => ({
    aspect,
    score: Math.max(0, Math.min(100, typeof value === 'number' && Number.isFinite(value) ? value : 0)),
  }));

  const overallTrend = student.overall.average >= 75 ? 'positive' : 
                       student.overall.average >= 60 ? 'stable' : 'concerning';

  const handleGenerateReport = () => {
    try {
      if (!student) return;
      const dateStr = new Date().toLocaleString();
      const wPct = Number.isFinite(conductWeightagePct as number) ? (conductWeightagePct as number) : 0;
      const aPct = Math.max(0, 100 - wPct);
      const weightageHtml = `<div class=\"muted\" style=\"font-size:12px;margin-top:4px\">Weightage: Academic ${aPct}% • Conduct ${wPct}%</div>`;
      const subjectsRowsVisual = filled
        .map((row) => {
          const score = resolveMark(row);
          const classAvgValue = getClassAverage(row.subject_id);
          const studentPct = Math.max(0, Math.min(100, typeof score === 'number' ? score : 0));
          const classPct = typeof classAvgValue === 'number' ? Math.max(0, Math.min(100, classAvgValue)) : 0;
          return `<div class=\"sub-row\">
            <div class=\"name\">${row.subject_name}</div>
            <div class=\"bar-wrap\">
              <div class=\"bar class\" style=\"width:${classPct}%\"></div>
              <div class=\"bar student\" style=\"width:${studentPct}%\"></div>
            </div>
            <div class=\"pill\">${fmt(score)}</div>
          </div>`;
        })
        .join('');

      const conductRowsVisual = [
        ['Discipline', conductPercentages.discipline],
        ['Effort', conductPercentages.effort],
        ['Participation', conductPercentages.participation],
        ['Motivational Level', conductPercentages.motivationalLevel],
        ['Character', conductPercentages.character],
        ['Leadership', conductPercentages.leadership],
      ]
        .map(([label, v]) => {
          const pct = typeof v === 'number' ? Math.max(0, Math.min(100, v)) : 0;
          const text = typeof v === 'number' ? `${pct.toFixed(0)}%` : '-';
          return `<div class=\"sub-row\">
            <div class=\"name\">${label}</div>
            <div class=\"bar-wrap\"><div class=\"bar student\" style=\"width:${pct}%\"></div></div>
            <div class=\"pill\">${text}</div>
          </div>`;
        })
        .join('');

      const trendText = overallTrend === 'positive' ? 'Performing Well' : overallTrend === 'stable' ? 'Average Performance' : 'Needs Attention';
      const chipBg = overallTrend === 'positive' ? '#dbeafe' : '#eff6ff';
      const chipText = overallTrend === 'positive' ? '#1d4ed8' : overallTrend === 'stable' ? '#2563eb' : '#3b82f6';

      // attention block removed per requirements

      const html = `<!doctype html>
<html>
  <head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\" />
    <title>Report - ${student.name}</title>
    <style>
      body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,'Apple Color Emoji','Segoe UI Emoji';color:#111827;margin:24px}
      h1{font-size:26px;margin:0}
      h2{font-size:18px;margin:18px 0 8px}
      .muted{color:#6b7280}
      .row{display:flex;justify-content:space-between;align-items:center}
      .chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:9999px;font-weight:600;font-size:13px;border:1px solid #c7d2fe}
      table{border-collapse:collapse;width:100%;font-size:13px}
      thead th{background:#f8fafc}
      .card{background:#f8fafc;border:1px solid #e5e7eb;border-radius:16px;padding:16px}
      .sub-row{display:flex;align-items:center;gap:12px;margin:10px 0}
      .sub-row .name{width:220px;font-weight:500}
      .bar-wrap{position:relative;flex:1;height:10px;background:#e5e7eb;border-radius:9999px;overflow:hidden}
      .bar{position:absolute;top:0;bottom:0}
      .bar.class{background:#9ca3af;opacity:.7}
      .bar.student{background:#3b82f6}
      .pill{min-width:64px;text-align:center;font-weight:600;border:1px solid #e5e7eb;border-radius:10px;padding:4px 8px;background:#fff}
      @media print{button{display:none} body{margin:0}}
    </style>
  </head>
  <body>
    <div class=\"row\" style=\"margin-bottom:12px;padding:12px 16px;border:1px solid #e5e7eb;background:#f8fafc;border-radius:12px\">\n      <div style=\"display:flex;align-items:center;gap:12px\">\n        <img src=\"/logo-akademi.png\" alt=\"Akademi Al Khayr\" width=\"36\" height=\"36\" style=\"object-fit:contain\" />\n        <div>\n          <div style=\"font-weight:700;font-size:18px\">Akademi Al Khayr</div>\n          <div class=\"muted\" style=\"font-size:12px\">Student Performance Report</div>\n        </div>\n      </div>\n      <div class=\"muted\">Generated: ${dateStr}</div>\n    </div>
    <div style=\"display:flex;justify-content:space-between;align-items:center;margin:16px 0 8px\">\n      <div style=\"display:flex;align-items:center;gap:16px\">\n        <div style=\"width:64px;height:64px;background:#3b82f6;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:22px;\">${student.name.charAt(0).toUpperCase()}</div>\n        <div>\n          <h1>${student.name}</h1>\n          <div class=\"muted\">${student.class}${selectedExamName ? ' • ' + selectedExamName : ''}</div>\n          ${weightageHtml}\n          <div style=\"margin-top:8px\">\n            <span class=\"chip\" style=\"background:${chipBg};color:${chipText}\">${trendText}</span>\n          </div>\n        </div>\n      </div>\n      <div style=\"font-size:32px;font-weight:700;color:#0f172a\">${student.overall.average}%</div>\n    </div>
    <h2>${selectedExamName || ''} - Subject Marks</h2>
    <div class=\"card\">
      <div style=\"font-weight:600;margin-bottom:8px\">All Subject Marks</div>
      ${subjectsRowsVisual}
      <p class=\"muted\" style=\"margin-top:8px\">Click a bar or subject name to view the trend</p>
    </div>
    <h2 style=\"margin-top:16px\">Conduct Profile <span class=\"chip\" style=\"margin-left:8px;background:#e0e7ff;color:#1e3a8a\">${conductChipLabel || 'Average'}</span></h2>
    <div class=\"card\">
      ${conductRowsVisual}
    </div>
    <div style=\"margin-top:24px\"><em class=\"muted\">Use the Print button to save this as a PDF.</em></div>
  </body>
</html>`;
      setReportHtml(html);
      setShowReportPreview(true);
    } catch (e) {
      console.error('Failed to generate report', e);
      alert('Failed to generate report. Please try again.');
    }
  };

  return (
    <AnimatePresence>
      {student && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50"
          onClick={onClose}
        >
          <motion.div
            initial={isMobile ? { y: '100%' } : { x: '100%' }}
            animate={isMobile ? { y: 0 } : { x: 0 }}
            exit={isMobile ? { y: '100%' } : { x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={isMobile 
              ? "fixed inset-4 bg-white shadow-2xl overflow-y-auto rounded-2xl"
              : "fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl overflow-y-auto"
            }
            onClick={(e) => e.stopPropagation()}
          >
          {/* Header */}
          <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-200 p-6 z-10">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-blue-500 rounded-xl flex items-center justify-center text-white text-xl font-semibold">
                  {student.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900">{student.name}</h2>
                  <p className="text-gray-600">{student.class}{selectedExamName ? ` • ${selectedExamName}` : ''}</p>
                  {typeof conductWeightagePct === 'number' && (
                    <p className="text-xs text-gray-500 mt-1">Weightage: Academic {Math.max(0, 100 - conductWeightagePct)}% • Conduct {conductWeightagePct}%</p>
                  )}
                  <div className="flex items-center gap-4 mt-2">
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold ${
                      overallTrend === 'positive' ? 'bg-blue-100 text-blue-700' :
                      overallTrend === 'stable' ? 'bg-blue-50 text-blue-600' :
                      'bg-blue-50 text-blue-500'
                    }`}>
                      {overallTrend === 'positive' ? <TrendingUp className="w-4 h-4" /> :
                       overallTrend === 'concerning' ? <TrendingDown className="w-4 h-4" /> :
                       <Award className="w-4 h-4" />}
                      {overallTrend === 'positive' ? 'Performing Well' :
                       overallTrend === 'stable' ? 'Average Performance' :
                       'Needs Attention'}
                    </span>
                    <span className="text-2xl font-semibold text-gray-900">
                      {student.overall.average}%
                    </span>
                    {/* Rank temporarily hidden */}
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            {/* Quick Actions */}
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleGenerateReport}
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm"
              >
                <FileText className="w-4 h-4" />
                {reportButtonLabel}
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-8">
{showReportPreview && (
              <Portal>
                <div id="report-print-root" className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 md:p-6" role="dialog" aria-modal="true" onClick={() => setShowReportPreview(false)}>
                  <style>{`@media print { html, body { margin: 0 !important; padding: 0 !important; height: auto !important; } body * { visibility: hidden !important; } #report-print-area, #report-print-area * { visibility: visible !important; } #report-print-root { position: static !important; padding: 0 !important; margin: 0 !important; } .print-container { position: static !important; overflow: visible !important; height: auto !important; max-height: none !important; box-shadow: none !important; padding: 0 !important; margin: 0 !important; } #report-print-area { margin: 0 !important; padding: 16px !important; } .avoid-break { break-inside: avoid; page-break-inside: avoid; } } @page { margin: 16mm 14mm; }`}</style>
                  <div className="print-container bg-white w-full max-w-5xl max-h-[92vh] rounded-xl shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                      <div className="text-sm text-gray-700 font-medium">Report Preview</div>
                      <div className="flex items-center gap-2">
                        <button onClick={handleDownloadPdf} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700">Save as PDF</button>
                        <button onClick={() => { try { window.print(); } catch (e) { console.error(e); } }} className="px-3 py-1.5 text-sm rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-100">Print</button>
                        <button onClick={() => setShowReportPreview(false)} className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">Close</button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-auto bg-gray-100">
                      <div id="report-print-area" className="bg-white p-6 md:p-8">
                        {/* School header */}
                        <div className="row flex items-center justify-between border border-gray-200 rounded-xl bg-gray-50 px-4 py-3 mb-4">
                          <div className="flex items-center gap-3">
                            <img src="/logo-akademi.png" alt="Akademi Al Khayr" width={36} height={36} className="object-contain" />
                            <div>
                              <div className="font-bold text-base">Akademi Al Khayr</div>
                              <div className="text-xs text-gray-500">Student Performance Report</div>
                            </div>
                          </div>
                          <div className="text-xs text-gray-500">Generated: {new Date().toLocaleString()}</div>
                        </div>

                        {/* Student header */}
                        <div className="flex items-center justify-between mb-6">
                          <div className="flex items-center gap-4">
                            <div className="w-16 h-16 bg-blue-500 rounded-xl flex items-center justify-center text-white text-xl font-semibold">
                              {student.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <h1 className="text-2xl font-semibold text-gray-900">{student.name}</h1>
                              <div className="text-gray-600">{student.class}{selectedExamName ? ` • ${selectedExamName}` : ''}</div>
                              {typeof conductWeightagePct === 'number' && (
                                <div className="text-xs text-gray-600 mt-1">Weightage: Academic {Math.max(0, 100 - conductWeightagePct)}% • Conduct {conductWeightagePct}%</div>
                              )}
                              <div className="mt-2">
                                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold ${
                                  overallTrend === 'positive' ? 'bg-blue-100 text-blue-700' : overallTrend === 'stable' ? 'bg-blue-50 text-blue-600' : 'bg-blue-50 text-blue-500'
                                }`}>
                                  {overallTrend === 'positive' ? 'Performing Well' : overallTrend === 'stable' ? 'Average Performance' : 'Needs Attention'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="text-2xl font-semibold text-gray-900">{student.overall.average}%</div>
                        </div>

                        {/* Subjects card with chart */}
                        <h3 className="text-lg font-semibold text-gray-900 mb-3">{selectedExamName ? `${selectedExamName} - Subject Marks` : 'Subject Performance Overview'}</h3>
                        <div className="avoid-break bg-gray-50 rounded-xl p-6 mb-6 border border-gray-200">
                          <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                              {!selectedSubject ? (
                                <BarChart 
                                  data={subjectSummaries.map((summary) => ({
                                    ...summary,
                                    classAvgForChart: summary.classAvg ?? undefined,
                                  }))}
                                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                >
                                  <XAxis dataKey="subject" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={80} />
                                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                                  <Tooltip contentStyle={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                                  <Bar dataKey="score" fill="#3b82f6" name="Student Mark" radius={[4, 4, 0, 0]} />
                                  <Bar dataKey="classAvgForChart" fill="#9ca3af" name="Class Average" radius={[4, 4, 0, 0]} />
                                </BarChart>
                              ) : (
                                <LineChart data={buildChartData(student.subjects?.[selectedSubject], selectedSubjectRow, (subjectSummaries.find(s=>s.subject===selectedSubject)?.classAvg ?? undefined) ?? undefined)} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                                  <Tooltip />
                                  <Line type="monotone" dataKey="score" stroke="#3b82f6" name="Student" strokeWidth={2} />
                                  <Line type="monotone" dataKey="classAvg" stroke="#9ca3af" name="Class Avg" strokeDasharray="4 4" />
                                </LineChart>
                              )}
                            </ResponsiveContainer>
                          </div>
                          {/* Subject list under chart */}
                          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                            {subjectSummaries.map((s) => (
                              <div key={s.subject} className="flex items-center justify-between rounded-lg bg-white border border-gray-200 px-3 py-2">
                                <span className="text-sm text-gray-700">{s.subject}</span>
                                <span className="text-sm font-semibold">{fmt(s.score)}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Conduct card with radar */}
                        <h3 className="text-lg font-semibold text-gray-900 mb-3">Conduct Profile <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${conductChipClass}`}>{conductChipLabel}</span></h3>
                        <div className="avoid-break bg-gray-50 rounded-xl p-6 border border-gray-200">
                          <div className="h-72">
                            <ResponsiveRadar
                              data={radarData}
                              keys={["score"]}
                              indexBy="aspect"
                              margin={{ top: 20, right: 50, bottom: 20, left: 50 }}
                              maxValue={100}
                              curve="linearClosed"
                              borderColor={{ from: 'color' }}
                              gridLevels={5}
                              gridShape="circular"
                              enableDots={true}
                              dotSize={6}
                              colors={["#3b82f6"]}
                              animate={false}
                            />
                          </div>
                          {/* Conduct items list */}
                          <div className="mt-4 rounded-xl border border-gray-200 overflow-hidden bg-white">
                            <div className="grid grid-cols-2 bg-gray-50 text-gray-600 text-sm font-medium px-3 py-2 border-b">
                              <div>Aspect</div>
                              <div className="text-right">Score</div>
                            </div>
                            {conductDisplayItems.map((item) => (
                              <div key={item.aspect} className="grid grid-cols-2 px-3 py-2 border-b last:border-b-0">
                                <div>{item.aspect}</div>
                                <div className="text-right font-semibold">{fmtConduct(item.value)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Portal>
            )}
            {/* Alerts removed per request */}

            {/* Subject Performance for Selected Exam */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {selectedExamName ? `${selectedExamName} - Subject Marks` : 'Subject Performance Overview'}
              </h3>
              
              {/* Chart Area: replaces bar chart with trend when a subject is selected */}
              <div className="bg-gray-50 rounded-xl p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                    {selectedSubject ? `${selectedSubject} - Performance Trend` : 'All Subject Marks'}
                    {selectedSubject && (selectedSubjectRow?.grade || student.subjects?.[selectedSubject]?.grade) === 'TH' && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700 border border-gray-200">Absent</span>
                    )}
                  </h4>
                  {selectedSubject && (
                    <button
                      onClick={() => setSelectedSubject(null)}
                      className="px-3 py-1.5 text-sm rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-100"
                      aria-label="Back to all subjects"
                    >
                      Back
                    </button>
                  )}
                </div>

                {!selectedSubject ? (
                  subjectSummaries.length > 0 ? (
                    <>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart 
                            data={subjectSummaries.map((summary) => ({
                              ...summary,
                              classAvgForChart: summary.classAvg ?? undefined,
                            }))}
                            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                            onClick={(data) => {
                              if (data && data.activeLabel) {
                                setSelectedSubject(data.activeLabel as string);
                              }
                            }}
                          >
                            <XAxis 
                              dataKey="subject" 
                              tick={{ fontSize: 12 }}
                              angle={-45}
                              textAnchor="end"
                              height={80}
                            />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                            <Tooltip 
                              formatter={(value: unknown, name: string, item: unknown) => {
                                const payload = (item as { payload?: ChartDatum })?.payload;
                                if (!payload) {
                                  return [fmt(toNumeric(value)), name];
                                }
                                if (name === 'Student Mark') {
                                  return [fmt(payload.score), name];
                                }
                                if (name === 'Class Average') {
                                  return [fmt(payload.classAvg), name];
                                }
                                return [fmt(toNumeric(value)), name];
                              }}
                              labelFormatter={(label) => `Subject: ${label}`}
                              contentStyle={{
                                backgroundColor: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px'
                              }}
                            />
                            <Bar 
                              dataKey="score" 
                              fill="#3b82f6" 
                              name="Student Mark"
                              style={{ cursor: 'pointer' }}
                              radius={[4, 4, 0, 0]}
                            />
                            <Bar 
                              dataKey="classAvgForChart" 
                              fill="#9ca3af" 
                              name="Class Average"
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <p className="text-sm text-gray-600 mt-2">
                        Click a bar or subject name to view the trend
                      </p>
                    </>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                      {subjectsLoading ? 'Loading subjects…' : 'No subject data available'}
                    </div>
                  )
                ) : (
                  (() => {
                    const subjectData = student.subjects?.[selectedSubject];
                    const selectedSummary = subjectSummaries.find(
                      (summary) => summary.subject === selectedSubject
                    );
                    const classAvgValue = selectedSummary?.classAvg ?? null;
                    const historicalData = buildChartData(
                      subjectData,
                      selectedSubjectRow,
                      classAvgValue ?? undefined
                    );
                    const scoreValue =
                      typeof subjectData?.score === 'number'
                        ? subjectData.score
                        : selectedSubjectRow
                          ? resolveMark(selectedSubjectRow)
                          : undefined;
                    const gradeValue = subjectData?.grade ?? selectedSubjectRow?.grade ?? '';

                    return (
                      <>
                        {historicalData.length > 0 ? (
                          <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={historicalData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                                <Tooltip
                                  formatter={(value: unknown, name: string) => {
                                    if (name === 'Student') {
                                      return [fmt(toNumeric(value)), 'Student Mark'];
                                    }
                                    if (name === 'Class Avg') {
                                      return [fmt(toNumeric(value)), 'Class Average'];
                                    }
                                    return [fmt(toNumeric(value)), name];
                                  }}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="score"
                                  stroke="#3b82f6"
                                  strokeWidth={3}
                                  name="Student"
                                  dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="classAvg"
                                  stroke="#9ca3af"
                                  strokeWidth={2}
                                  strokeDasharray="5 5"
                                  name="Class Avg"
                                  dot={{ fill: '#9ca3af', strokeWidth: 2, r: 3 }}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                            {subjectsLoading ? 'Loading subject details…' : 'No exam data yet for this subject'}
                          </div>
                        )}

                        {(subjectData || selectedSubjectRow) && (
                          <div className="mt-4 space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                {typeof scoreValue === 'number' && Number.isFinite(scoreValue) && (
                                  <span className="text-lg font-semibold">{scoreValue}%</span>
                                )}
                                {gradeValue && (
                                  <span className={`text-sm px-3 py-1 rounded-full ${
                                    gradeValue === 'A' || gradeValue === 'A+' || gradeValue === 'A-' ? 'bg-blue-100 text-blue-800' :
                                    gradeValue === 'B' || gradeValue === 'B+' || gradeValue === 'B-' ? 'bg-blue-50 text-blue-700' :
                                    gradeValue === 'C' || gradeValue === 'C+' || gradeValue === 'C-' ? 'bg-blue-50 text-blue-600' :
                                    gradeValue === 'TH' ? 'bg-gray-100 text-gray-700' :
                                    'bg-blue-50 text-blue-500'
                                  }`}>
                                    {gradeValue === 'TH' ? 'Absent' : `Grade ${gradeValue}`}
                                  </span>
                                )}
                              </div>
                              {typeof scoreValue === 'number' && Number.isFinite(scoreValue) && classAvgValue != null && Number.isFinite(classAvgValue) && (
                                <div className="text-sm text-gray-600">
                                  vs Class Avg: {fmt(classAvgValue)}
                                  <span className={`ml-2 ${
                                    scoreValue > classAvgValue ? 'text-green-600' : 
                                    scoreValue === classAvgValue ? 'text-gray-600' : 'text-red-600'
                                  }`}>
                                    ({scoreValue > classAvgValue ? '+' : ''}{(scoreValue - classAvgValue).toFixed(1)}%)
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                              <div>
                                <span className="font-medium text-gray-900">Grade:</span> {gradeValue || '—'}
                              </div>
                              <div>
                                <span className="font-medium text-gray-900">Class Avg:</span> {fmt(classAvgValue)}
                              </div>
                              <div>
                                <span className="font-medium text-gray-900">Trend:</span> {subjectData?.trend ? `${subjectData.trend[subjectData.trend.length - 1] ?? 0}%` : 'Not available'}
                              </div>
                              <div>
                                <span className="font-medium text-gray-900">Exams Recorded:</span> {subjectData?.exams?.length ?? 0}
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()
                )}

                {/* Minimalist Subjects and Marks Summary */}
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  {subjectSummaries.length > 0 ? (
                    subjectSummaries.map(({ subject, score, grade }) => {
                      const isSelected = subject === selectedSubject;
                      const displayValue = grade === 'TH' ? 'TH' : fmt(score);
                      return (
                        <button
                          key={subject}
                          type="button"
                          onClick={() => setSelectedSubject(prev => (prev === subject ? null : subject))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedSubject(prev => (prev === subject ? null : subject));
                            }
                          }}
                          className={`flex justify-between items-center px-3 py-2 rounded-lg shadow-sm border transition-colors ${
                            isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100 hover:bg-gray-50'
                          }`}
                          title="View trend"
                          aria-pressed={isSelected}
                        >
                          <span className="text-gray-600 font-medium text-left">{subject}</span>
                          <span className="text-gray-900 font-semibold">{displayValue}</span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="col-span-full text-center text-sm text-gray-400">
                      {subjectsLoading ? 'Loading subjects…' : 'No subjects recorded yet'}
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Conduct Profile */}
            <div>
              <div className="mb-4 flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-gray-900">Conduct Profile</h3>
                <div className="flex items-center gap-2">
                  {conductSummaryLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                  {conductSummary && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${conductChipClass}`}
                      title={conductChipTooltip}
                    >
                      {conductChipLabel}
                    </span>
                  )}
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-6">
                <div className="h-64">
                  {hasConductData ? (
                    <ResponsiveRadar
                      key={`student-radar-${student.id}-${radarData.length}`}
                      data={radarData}
                      keys={['score']}
                      indexBy="aspect"
                      maxValue={100}
                      margin={{ top: 30, right: 40, bottom: 30, left: 40 }}
                      curve="linearClosed"
                      borderWidth={2}
                      borderColor={{ from: 'color' }}
                      gridLevels={5}
                      gridShape="circular"
                      gridLabelOffset={16}
                      enableDots={true}
                      dotSize={8}
                      dotColor={{ theme: 'background' }}
                      dotBorderWidth={2}
                      dotBorderColor={{ from: 'color' }}
                      enableDotLabel={false}
                      colors={['#3b82f6']}
                      fillOpacity={0.25}
                      blendMode="multiply"
                      animate={false}
                      isInteractive={true}
                      legends={[]}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                      No conduct data available
                    </div>
                  )}
                </div>
                
                {/* Manual Legend for Radar Chart */}
                <div className="mt-4 flex justify-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    <span className="text-gray-600">Current Score</span>
                  </div>
                </div>
                
                {/* Minimalist Conduct Summary */}
                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  {conductDisplayItems.map(item => (
                    <div key={item.aspect} className="flex justify-between items-center px-3 py-2 bg-white rounded-lg shadow-sm">
                      <span className="text-gray-600 font-medium">{item.aspect}</span>
                      <span className="text-gray-900 font-semibold">{fmtConduct(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Benchmarks */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Benchmarks</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-semibold text-blue-900">{student.overall.average}%</div>
                  <div className="text-sm text-blue-700">Final Mark</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-semibold text-gray-900">
                    {typeof classOverallAvg === 'number' && Number.isFinite(classOverallAvg)
                      ? classOverallAvg.toFixed(1)
                      : Object.values(classAverages).length > 0
                        ? (Object.values(classAverages).reduce((a, b) => a + b, 0) / Object.values(classAverages).length).toFixed(1)
                        : '0.0'}%
                  </div>
                  <div className="text-sm text-gray-700">Class Average</div>
                </div>
              </div>
            </div>
          </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
