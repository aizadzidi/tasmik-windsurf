"use client";

import React, { useState } from 'react';
import { X, TrendingUp, TrendingDown, Award, FileText, Loader2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, BarChart, Bar } from 'recharts';
import { ResponsiveRadar } from '@nivo/radar';
import { motion, AnimatePresence } from 'framer-motion';
import Portal from '@/components/Portal';
import { StudentData } from '@/components/admin/exam/StudentTable';
import {
  rpcGetStudentSubjects,
  type StudentSubjectRow,
} from '@/data/exams';
import { rpcGetConductSummary, type ConductSummary } from '@/data/conduct';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import { useWeightedAverages } from '@/hooks/useWeightedAverages';
import { computeGrade, getGradingScale, type GradingScale } from '@/lib/gradingUtils';

export type StudentPanelMode = 'admin' | 'teacher' | 'parent';

interface StudentDetailsPanelProps {
  student: StudentData | null;
  onClose: () => void;
  classAverages?: Record<string, number>;
  classOverallAvg?: number; // blended overall average for the class, preferred for Benchmarks
  isMobile?: boolean;
  selectedExamName?: string;
  reportButtonLabel?: string;
  examId?: string;
  classId?: string;
  mode?: StudentPanelMode;
}

export default function StudentDetailsPanelShared({ 
  student, 
  onClose, 
  classAverages,
  classOverallAvg: _classOverallAvg,
  isMobile,
  selectedExamName = '',
  reportButtonLabel,
  examId,
  classId,
  mode = 'admin'
}: StudentDetailsPanelProps) {
  const modeNormalized = mode ?? 'admin';
  const isTeacher = modeNormalized === 'teacher';
  const showClassAverage = modeNormalized !== 'parent';

  // Derived locals to match legacy usage in this panel
  const studentId = student?.id;
  const studentName = student?.name ?? '';
  const className = student?.class ?? '';
  const overallAvgRaw = student?.overall?.average;
  const examName = selectedExamName;
  const open = Boolean(student);
  const parentMeetMode = false;
  const reportButtonText = reportButtonLabel ?? "Generate Report";

  // Local responsive flag (to preserve identical animation behavior)
  const [isMobileView, setIsMobileView] = useState<boolean>(Boolean(isMobile));
  React.useEffect(() => {
    const update = () => {
      if (typeof isMobile === "boolean") {
        setIsMobileView(isMobile);
        return;
      }
      setIsMobileView(window.innerWidth < 1024);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [isMobile]);

  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [subjectRows, setSubjectRows] = useState<StudentSubjectRow[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [conductSummary, setConductSummary] = useState<ConductSummary | null>(null);
  const [conductSummaryLoading, setConductSummaryLoading] = useState(false);
  const [conductWeightagePct, setConductWeightagePct] = useState<number | null>(null);
  const [gradingScale, setGradingScale] = useState<GradingScale | null>(null);
  const lastPrefillStudentIdRef = React.useRef<string | null>(null);

  const prefillSubjectRows = React.useMemo(() => {
    const subjectEntries = student?.subjects ? Object.entries(student.subjects) : [];
    if (subjectEntries.length === 0) return [];
    return subjectEntries.map(([subjectName, info]) => ({
      subject_id: subjectName,
      subject_name: subjectName,
      result_id: null,
      mark: typeof info?.score === 'number' ? info.score : null,
      grade: typeof info?.grade === 'string' ? info.grade : null,
      final_score: typeof info?.score === 'number' ? info.score : null,
      updated_at: null,
    }));
  }, [student]);

  const prefillConductSummary = React.useMemo(() => {
    if (!student) return null;
    const subjectCount = Object.keys(student.subjects || {}).length;
    const percentageSource = student.conductPercentages
      ? {
          discipline: student.conductPercentages.discipline,
          effort: student.conductPercentages.effort,
          participation: student.conductPercentages.participation,
          motivationalLevel: student.conductPercentages.motivationalLevel,
          character: student.conductPercentages.character,
          leadership: student.conductPercentages.leadership,
        }
      : student.conduct
      ? (() => {
          const values = Object.values(student.conduct).filter(
            (value): value is number => typeof value === "number" && Number.isFinite(value)
          );
          const max = values.length > 0 ? Math.max(...values) : 0;
          const explicitScale = (student as { conductScale?: string | number | boolean })?.conductScale;
          const explicitIsPercent = (student as { conduct?: { isPercent?: boolean } })?.conduct?.isPercent;
          // Conduct values are either normalized (0–5) or percent (0–100). Prefer explicit metadata if present.
          let scale = 20;
          if (typeof explicitScale === "number" && Number.isFinite(explicitScale)) {
            scale = explicitScale;
          } else if (typeof explicitScale === "string") {
            scale = explicitScale === "percent" ? 1 : 20;
          } else if (typeof explicitScale === "boolean") {
            scale = explicitScale ? 1 : 20;
          } else if (typeof explicitIsPercent === "boolean") {
            scale = explicitIsPercent ? 1 : 20;
          } else if (max > 5) {
            scale = 1;
          }
          return {
            discipline: student.conduct.discipline * scale,
            effort: student.conduct.effort * scale,
            participation: student.conduct.participation * scale,
            motivationalLevel: student.conduct.motivationalLevel * scale,
            character: student.conduct.character * scale,
            leadership: student.conduct.leadership * scale,
          };
        })()
      : null;

    if (!percentageSource) return null;
    const hasAny = Object.values(percentageSource).some(
      (value) => typeof value === "number" && Number.isFinite(value)
    );
    if (!hasAny) return null;

    return {
      source: "average",
      subjects_count: subjectCount,
      override_id: null,
      discipline: percentageSource.discipline ?? null,
      effort: percentageSource.effort ?? null,
      participation: percentageSource.participation ?? null,
      motivational_level: percentageSource.motivationalLevel ?? null,
      character_score: percentageSource.character ?? null,
      leadership: percentageSource.leadership ?? null,
    } as ConductSummary;
  }, [student]);

  // Final mark and averages come from RPCs via useWeightedAverages

  // Prefill with data coming from parent (admin/teacher tables) so the panel isn't empty while RPCs load
  React.useEffect(() => {
    const nextStudentId = student?.id ?? null;
    const isNewStudent = nextStudentId !== lastPrefillStudentIdRef.current;

    if (isNewStudent && prefillSubjectRows.length > 0) {
      setSubjectRows(prefillSubjectRows);
    }

    if (isNewStudent) {
      setConductSummary(prefillConductSummary);
    }

    if (isNewStudent) {
      lastPrefillStudentIdRef.current = nextStudentId;
    }
  }, [student, prefillSubjectRows, prefillConductSummary]);

  // Load subject rows for student/exam/class
  React.useEffect(() => {
    let cancelled = false;
    if (!open || !studentId || !examId) {
      setSubjectRows(prefillSubjectRows.length > 0 ? prefillSubjectRows : []);
      setSubjectsLoading(false);
      return;
    }

    setSubjectsLoading(true);

    (async () => {
      try {
        const data = await rpcGetStudentSubjects(supabase, examId, classId || null, studentId);
        if (cancelled) return;
        const hasRpcResults = data.some((row) => {
          if (row.result_id !== null) return true;
          const hasMark = row.mark != null || row.final_score != null;
          const grade = (row.grade ?? "").trim();
          return hasMark || grade.length > 0;
        });

        if (hasRpcResults) {
          setSubjectRows(data);
          return;
        }
        if (prefillSubjectRows.length > 0) {
          setSubjectRows(prefillSubjectRows);
          return;
        }
        if (modeNormalized !== 'parent') {
          const params = new URLSearchParams({ examId: String(examId), studentId: String(studentId) });
          if (classId) params.append('classId', String(classId));
          const res = await fetch(`/api/teacher/student-subjects?${params.toString()}`);
          if (!res.ok) {
            const errorText = await res.text().catch(() => "");
            throw new Error(`teacher/student-subjects ${res.status}: ${errorText}`);
          }
          const json = await res.json();
          const fallbackRows = Array.isArray(json?.rows) ? (json.rows as StudentSubjectRow[]) : [];
          if (fallbackRows.length > 0) {
            setSubjectRows(fallbackRows);
            return;
          }
        }
        if (data.length > 0) {
          setSubjectRows(data);
          return;
        }
        setSubjectRows([]);
      } catch (error) {
        if (!cancelled) {
          console.error("RPC get_exam_student_subjects failed:", error);
          setSubjectRows(prefillSubjectRows.length > 0 ? prefillSubjectRows : []);
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
  }, [open, studentId, examId, classId, modeNormalized, prefillSubjectRows]);

  React.useEffect(() => {
    setSelectedSubject(null);
  }, [studentId]);

  const filledRows = React.useMemo(
    () =>
      subjectRows.filter((row) => {
        if (row.result_id !== null) return true;
        const hasMark = row.mark != null || row.final_score != null;
        const grade = (row.grade ?? "").trim();
        const hasGrade = grade.length > 0;
        return hasMark || hasGrade;
      }),
    [subjectRows]
  );


  // Fetch conduct weightage for this exam/class from admin metadata
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!examId) { setConductWeightagePct(null); return; }
        const res = await authFetch('/api/admin/exam-metadata');
        const meta = await res.json();
        const exams = Array.isArray(meta?.exams) ? (meta.exams as Array<{ id?: string | number; exam_classes?: Array<{ conduct_weightage?: number; classes?: { id: string } }> }>) : [];
        const exam = exams.find((e) => String(e?.id) === String(examId));
        if (!exam) { if (!cancelled) setConductWeightagePct(null); return; }
        const examClasses: Array<{ conduct_weightage?: number; classes?: { id: string } }> = Array.isArray(exam?.exam_classes) ? exam.exam_classes : [];
        let pct: number | null = null;
        if (classId) {
          const found = examClasses.find((ec) => String(ec?.classes?.id) === String(classId));
          if (found && typeof found?.conduct_weightage !== 'undefined') pct = Number(found.conduct_weightage);
        }
        if (pct == null && examClasses.length === 1 && typeof examClasses[0]?.conduct_weightage !== 'undefined') {
          pct = Number(examClasses[0].conduct_weightage);
        }
        if (!cancelled) setConductWeightagePct(Number.isFinite(pct as number) ? (pct as number) : 0);
      } catch {
        if (!cancelled) setConductWeightagePct(0);
      }
    })();
    return () => { cancelled = true; };
  }, [examId, classId]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!examId) {
        setGradingScale(null);
        return;
      }
      try {
        const scale = await getGradingScale(String(examId));
        if (!cancelled) {
          setGradingScale(scale);
        }
      } catch (err) {
        console.warn('grading scale fetch failed', err);
        if (!cancelled) setGradingScale(null);
      }
    })();
    return () => { cancelled = true; };
  }, [examId]);

  const refreshConductSummary = React.useCallback(async () => {
    if (!examId || !student?.id) {
      setConductSummary(prefillConductSummary);
      return;
    }
    setConductSummaryLoading(true);
    try {
      const summary = await rpcGetConductSummary(examId!, student.id);
      setConductSummary(summary ?? prefillConductSummary);
    } catch (error) {
      console.error('rpcGetConductSummary failed:', error);
      setConductSummary(prefillConductSummary);
    } finally {
      setConductSummaryLoading(false);
    }
  }, [examId, student?.id, prefillConductSummary]);

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
    if (typeof row.mark === "number" && Number.isFinite(row.mark)) return row.mark;
    if (row.mark !== null && row.mark !== undefined) {
      const parsed = Number(row.mark);
      if (Number.isFinite(parsed)) return parsed;
    }
    if (typeof row.final_score === "number" && Number.isFinite(row.final_score)) {
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
    return filledRows.find((row) => row.subject_name === selectedSubject);
  }, [filledRows, selectedSubject]);

  // Weighted/averages via RPCs
  const allowedSubjectIds: string[] | null = null; // keep identical filters across calls
  const wConduct = typeof conductWeightagePct === 'number' ? conductWeightagePct : 0;
  const { subjectAvg, finalWeighted, fmt, loading: averagesLoading } = useWeightedAverages({
    supabase,
    examId: examId || null,
    classId: classId || null,
    studentId: studentId || null,
    wConduct,
    allowedSubjectIds,
  });

  const getClassAverage = React.useCallback(
    (subjectId: string, subjectName?: string | null) => {
      const rpcValue = subjectAvg[String(subjectId)];
      if (typeof rpcValue === "number" && Number.isFinite(rpcValue)) return rpcValue;

      const fallbackKey = subjectName || subjectId;
      const fallback = classAverages ? classAverages[fallbackKey] ?? classAverages[subjectId] : null;
      if (typeof fallback === "number" && Number.isFinite(fallback)) return fallback;
      return null;
    },
    [subjectAvg, classAverages]
  );

  const resolveGrade = React.useCallback(
    (score: number | null | undefined, provided?: string | null) => {
      const normalized = (provided ?? "").trim();
      if (normalized) return normalized;
      if (typeof score === "number" && Number.isFinite(score)) {
        if (gradingScale && Array.isArray(gradingScale.grades) && gradingScale.grades.length > 0) {
          return computeGrade(score, gradingScale);
        }
        // Pass a null-ish value so gradingUtils falls back to default computation
        return computeGrade(score, null as unknown as GradingScale);
      }
      return "";
    },
    [gradingScale]
  );

  const subjectSummaries = React.useMemo(
    () =>
      filledRows.map((row) => ({
        subject: row.subject_name,
        subjectId: row.subject_id,
        score: resolveMark(row),
        classAvg: getClassAverage(row.subject_id, row.subject_name),
        grade: resolveGrade(resolveMark(row), row.grade),
      })),
    [filledRows, getClassAverage, resolveGrade]
  );

  // Final mark is provided by RPC via useWeightedAverages; no FE recomputation when RPCs are available

  // fmt provided by hook for 1-decimal rounding

  const toNumeric = (value: unknown): number | null => {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string") {
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
    if (selectedSubject && !filledRows.some((row) => row.subject_name === selectedSubject)) {
      setSelectedSubject(null);
    }
  }, [filledRows, selectedSubject]);


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
    return {
      discipline: null,
      effort: null,
      participation: null,
      motivationalLevel: null,
      character: null,
      leadership: null,
    } as Record<string, number | null> as {
      discipline: number | null;
      effort: number | null;
      participation: number | null;
      motivationalLevel: number | null;
      character: number | null;
      leadership: number | null;
    };
  }, [conductSummary]);

  const openCleanPrintWindow = async () => {
    // Ensure the preview is open so print CSS (in the Portal) applies
    if (!showReportPreview) setShowReportPreview(true);

    // Give React/DOM a tick to render the preview fully
    await new Promise((r) => setTimeout(r, 200));

    const area = document.getElementById('report-print-area');
    if (!area) {
      alert('Report not ready');
      return;
    }

    // Best-effort: wait for images in the report area to finish loading
    try {
      const imgs = Array.from(area.querySelectorAll('img')) as HTMLImageElement[];
      await Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                const done = () => resolve();
                img.onload = done;
                img.onerror = done;
              })
        )
      );
    } catch {
      // Non-fatal if waiting fails
    }

    // Trigger native print dialog (user can choose "Save as PDF")
    window.requestAnimationFrame(() => {
      try {
        window.focus();
      } catch {}
      window.print();
    });
  };

  const handleDownloadPdf = async () => {
    const downloadBtn = document.getElementById('pdf-download-button') as HTMLButtonElement | null;
    let frame: HTMLIFrameElement | null = null;
    try {
      if (downloadBtn) {
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = '<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Preparing PDF...';
      }

      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      // Radically avoid Tailwind/OKLCH parsing by rendering a self-contained HTML report in an offscreen iframe.
      const buildPdfHtml = () => {
        const escapeHtml = (input: string) =>
          input
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

        const dateStr = new Date().toLocaleString();
        const wPct = Math.round(typeof conductWeightagePct === 'number' ? conductWeightagePct : 0);
        const aPct = Math.max(0, 100 - wPct);
        const weightageHtml = `<div class="meta">Weightage: Academic ${aPct}% • Conduct ${wPct}%</div>`;

        const subjectItems = filledRows
          .map((row) => {
            const score = resolveMark(row);
            const classAvgValue = getClassAverage(row.subject_id, row.subject_name);
            const gradeLabel = resolveGrade(score, row.grade) || "—";
            const isAbsent = gradeLabel === "TH";
            return {
              name: row.subject_name,
              score: typeof score === "number" && Number.isFinite(score) ? score : null,
              scoreText: typeof score === "number" && Number.isFinite(score) ? fmt(score) : "—",
              grade: isAbsent ? "Absent" : gradeLabel,
              gradeRaw: gradeLabel,
              classAvg: typeof classAvgValue === "number" && Number.isFinite(classAvgValue) ? classAvgValue : null,
              classAvgText: typeof classAvgValue === "number" && Number.isFinite(classAvgValue) ? fmt(classAvgValue) : "—",
              pctBar: Math.max(0, Math.min(100, typeof score === "number" && Number.isFinite(score) ? score : 0)),
            };
          })
          .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

        const computedOverallFallback = (() => {
          if (typeof overallAvgRaw === "number" && Number.isFinite(overallAvgRaw)) return overallAvgRaw;
          const scored = subjectItems.filter((s) => typeof s.score === "number" && Number.isFinite(s.score));
          if (scored.length === 0) return null;
          const avg = scored.reduce((sum, s) => sum + (s.score as number), 0) / scored.length;
          return Number.isFinite(avg) ? avg : null;
        })();
        const pdfOverallValue = (displayOverall ?? computedOverallFallback) as number | null;
        const _overallGrade = resolveGrade(pdfOverallValue, null) || "—";
        const overallMark = fmt(pdfOverallValue);

        const topSubjects = subjectItems.filter((s) => s.score != null).slice(0, 3);
        const _bottomSubjects = subjectItems
          .filter((s) => s.score != null)
          .slice()
          .sort((a, b) => (a.score ?? 999) - (b.score ?? 999))
          .slice(0, 2);

        const highlightsHtml = (() => {
          const renderPill = (s: (typeof subjectItems)[number]) => {
            const left = escapeHtml(s.name);
            const meta = escapeHtml(`${s.grade} · ${s.scoreText}`);
            return `<span class="mini-pill"><span class="mini-pill-name">${left}</span><span class="mini-pill-meta">${meta}</span></span>`;
          };
          const inclination = topSubjects.length ? topSubjects.map(renderPill).join("") : `<span class="empty">—</span>`;
          return `<div class="highlights">
  <div class="highlights-col" style="flex:1">
    <div class="kicker">Inclination</div>
    <div class="pill-row">${inclination}</div>
  </div>
</div>`;
        })();

        const subjectsRowsVisual = `<div class="cards">
${subjectItems
  .map((row) => {
    return `<div class="card-item">
  <div class="card-left">
    <div class="card-title">${escapeHtml(row.name)}</div>
  </div>
  <div class="card-right">
    <div class="card-grade">${escapeHtml(row.grade)}</div>
    <div class="card-sub">${row.score != null ? escapeHtml(row.scoreText) : "—"}</div>
  </div>
</div>`;
  })
  .join("")}
</div>`;

        const conductItems: Array<[string, number | null]> = [
          ["Discipline", conductPercentages.discipline ?? null],
          ["Effort", conductPercentages.effort ?? null],
          ["Participation", conductPercentages.participation ?? null],
          ["Motivational Level", conductPercentages.motivationalLevel ?? null],
          ["Character", conductPercentages.character ?? null],
          ["Leadership", conductPercentages.leadership ?? null],
        ];

        const conductRowsVisual = `<div class="cards">
${conductItems
  .map(([label, v]) => {
    const pct = typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null;
    const text = pct != null ? `${pct.toFixed(0)}%` : "—";
    return `<div class="card-item">
  <div class="card-left">
    <div class="card-title">${escapeHtml(label)}</div>
    <div class="card-sub">Current score</div>
  </div>
  <div class="card-right">
    <div class="card-grade">${escapeHtml(text)}</div>
    <div class="card-sub"></div>
  </div>
</div>`;
  })
  .join("")}
</div>`;

        const conductRadarSvg = (() => {
          const labels = ["Discipline", "Effort", "Participation", "Motivation", "Character", "Leadership"];
          const values = [
            conductPercentages.discipline,
            conductPercentages.effort,
            conductPercentages.participation,
            conductPercentages.motivationalLevel,
            conductPercentages.character,
            conductPercentages.leadership,
          ].map((v) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0));

          const size = 360;
          const cx = size / 2;
          const cy = size / 2;
          const r = 108;
          const rings = [0.25, 0.5, 0.75, 1];
          const axisCount = labels.length;

          const polar = (angle: number, radius: number) => {
            const x = cx + Math.cos(angle) * radius;
            const y = cy + Math.sin(angle) * radius;
            return { x, y };
          };

          const angles = Array.from({ length: axisCount }, (_, i) => (-Math.PI / 2) + (i * 2 * Math.PI) / axisCount);

          const gridPolys = rings
            .map((t) => {
              const pts = angles.map((a) => {
                const p = polar(a, r * t);
                return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
              });
              return `<polygon points="${pts.join(" ")}" fill="none" stroke="#e2e8f0" stroke-width="1" />`;
            })
            .join("");

          const axes = angles
            .map((a) => {
              const p = polar(a, r);
              return `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1" />`;
            })
            .join("");

          const dataPts = angles.map((a, i) => {
            const p = polar(a, (r * values[i]!) / 100);
            return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
          });

          const labelEls = angles
            .map((a, i) => {
              const p = polar(a, r + 34);
              const anchor = Math.abs(Math.cos(a)) < 0.2 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
              const dy = Math.sin(a) > 0.5 ? 10 : Math.sin(a) < -0.5 ? -8 : 2;
              return `<text x="${p.x.toFixed(1)}" y="${(p.y + dy).toFixed(1)}" text-anchor="${anchor}" font-size="9" fill="#64748b" dominant-baseline="middle">${escapeHtml(labels[i]!)}</text>`;
            })
            .join("");

          return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Conduct radar">
  <rect x="0" y="0" width="${size}" height="${size}" fill="#ffffff" />
  ${gridPolys}
  ${axes}
  <polygon points="${dataPts.join(" ")}" fill="rgba(37,99,235,0.18)" stroke="#2563eb" stroke-width="2" />
  ${dataPts
    .map((pt) => {
      const [x, y] = pt.split(",");
      return `<circle cx="${x}" cy="${y}" r="3" fill="#2563eb" />`;
    })
    .join("")}
  ${labelEls}
</svg>`;
        })();

        return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Report - ${escapeHtml(studentName || "Student")}</title>
    <style>
      :root{
        --text:#0f172a;
        --muted:#64748b;
        --muted2:#94a3b8;
        --hair:#e5e7eb;
        --surface:#f8fafc;
        --blue:#2563eb;
        --blue2:#3b82f6;
        --gray:#94a3b8;
      }
      html, body { margin: 0; padding: 0; background: #ffffff; color: var(--text); }
      *, *::before, *::after { box-sizing: border-box; }
      body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;padding:0}
      /* A4 canvas in CSS px to avoid scaling/cropping */
      .pdf-page{width:794px;height:1123px;margin:0 auto;padding:28px}
      .pdf-root{background:#fff}
      .topbar{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border:1px solid var(--hair);border-radius:14px;background:var(--surface)}
      .brand{display:flex;align-items:center;gap:12px}
      .brand-title{font-weight:700;font-size:16px;line-height:1.1}
      .brand-sub{color:var(--muted);font-size:12px;line-height:1.1}
      .meta{color:var(--muted);font-size:12px;line-height:1.2;margin-top:4px}
      h1{font-size:26px;letter-spacing:-0.02em;margin:0;line-height:1.1}
      h2{font-size:14px;letter-spacing:0.02em;text-transform:uppercase;color:var(--muted);margin:18px 0 10px}
      .summary{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin:18px 0 12px}
      .person{display:flex;align-items:flex-start;gap:14px;min-width:0}
      .avatar{display:none}
      .person-meta{min-width:0}
      .subline{color:var(--muted);font-size:13px;line-height:1.25;margin-top:2px;white-space:normal;overflow:visible}
      .chip{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:9999px;font-weight:700;font-size:12px;border:1px solid #c7d2fe}
      .chip-soft{border-color:#dbeafe;background:#eff6ff;color:#1d4ed8}
      .chip-sep{color:var(--muted2);font-weight:700}
      .dot{color:var(--muted2)}
      .scorebox{text-align:right;flex:0 0 auto}
      .score-grade{font-size:36px;font-weight:800;letter-spacing:-0.03em;line-height:1}
      .stats{display:flex;justify-content:flex-end;gap:10px;margin-top:10px}
      .stat{border:1px solid var(--hair);border-radius:12px;padding:8px 10px;min-width:108px;background:#fff}
      .stat-k{color:var(--muted2);font-size:11px;text-transform:uppercase;letter-spacing:0.04em}
      .stat-v{font-weight:800;font-size:14px;margin-top:2px}
      .highlights{display:flex;gap:12px;margin:10px 0 18px}
      .highlights-col{flex:1;border:1px solid var(--hair);border-radius:14px;padding:12px;background:#fff}
      .kicker{color:var(--muted2);font-size:11px;text-transform:uppercase;letter-spacing:0.08em}
      .pill-row{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}
      .mini-pill{display:inline-flex;align-items:center;gap:8px;padding:7px 12px;min-height:34px;border:1px solid var(--hair);border-radius:9999px;background:#fff}
      .mini-pill-name,.mini-pill-meta{display:inline-flex;align-items:center;line-height:1;vertical-align:middle}
      .mini-pill-name{font-weight:700;font-size:12px;color:var(--text)}
      .mini-pill-meta{font-weight:600;font-size:12px;color:var(--muted)}
      .empty{color:var(--muted);font-size:13px}
      .section{border-top:1px solid var(--hair);padding-top:14px;margin-top:14px}
      .card{border:1px solid var(--hair);border-radius:16px;padding:14px;background:#fff}
      .cards{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .card-item{border:1px solid var(--hair);border-radius:16px;padding:14px 16px;background:#fff;display:flex;align-items:center;justify-content:space-between;min-height:72px}
      .card-left{min-width:0}
      .card-title{font-weight:700;font-size:16px;letter-spacing:-0.01em;line-height:1.2;white-space:normal}
      .card-right{text-align:right;min-width:80px}
      .card-grade{font-weight:800;font-size:18px;letter-spacing:-0.02em}
      .card-sub{margin-top:4px;color:var(--muted);font-size:12px}
      .footer{margin-top:18px;padding-top:12px;border-top:1px solid var(--hair);display:flex;justify-content:space-between;color:var(--muted);font-size:11px}
      .radar-card{border:1px solid var(--hair);border-radius:16px;padding:14px;background:#fff;margin-bottom:14px}
      .radar-title{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px}
      .radar-title h3{margin:0;font-size:13px;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted2)}
      .radar-wrap{display:flex;justify-content:center;align-items:center}
    </style>
  </head>
  <body>
    <div class="pdf-root" id="pdf-root">
      <div class="pdf-page">
      <div class="topbar">
        <div class="brand">
          <img src="/logo-akademi.png" alt="Akademi Al Khayr" width="34" height="34" style="object-fit:contain" />
          <div>
            <div class="brand-title">Akademi Al Khayr</div>
            <div class="brand-sub">Student Performance Report</div>
          </div>
        </div>
        <div class="meta">Generated: ${escapeHtml(dateStr)}</div>
      </div>

      <div class="summary">
        <div class="person">
          <div class="person-meta">
            <h1>${escapeHtml(studentName || "Student")}</h1>
            <div class="subline">${escapeHtml(className)}${examName ? ` • ${escapeHtml(examName)}` : ""}</div>
            ${weightageHtml}
          </div>
        </div>

        <div class="scorebox">
          <div class="stats">
            <div class="stat">
              <div class="stat-k">Overall Mark</div>
              <div class="stat-v">${escapeHtml(overallMark)}</div>
            </div>
          </div>
        </div>
      </div>

      ${highlightsHtml}

      <div class="section">
        <h2>Subjects</h2>
        <div class="card">
          ${subjectsRowsVisual}
        </div>
      </div>

      <div class="footer">
        <div>${escapeHtml(examName || "Exam Report")}</div>
        <div>${escapeHtml(className)}</div>
      </div>
      </div>

      <div class="pdf-page">
        <div class="topbar">
          <div class="brand">
            <img src="/logo-akademi.png" alt="Akademi Al Khayr" width="34" height="34" style="object-fit:contain" />
            <div>
              <div class="brand-title">Akademi Al Khayr</div>
              <div class="brand-sub">Student Performance Report</div>
            </div>
          </div>
          <div class="meta">${escapeHtml(studentName || "Student")} • ${escapeHtml(examName || "Exam")}</div>
        </div>

        <div class="section" style="margin-top:6px">
          <h2>Conduct</h2>
          <div class="radar-card">
            <div class="radar-title">
              <h3>Conduct Profile</h3>
            </div>
            <div class="radar-wrap">
              ${conductRadarSvg}
            </div>
          </div>
          <div class="card">${conductRowsVisual}</div>
        </div>

        <div class="footer">
          <div>${escapeHtml(examName || "Exam Report")}</div>
          <div>${escapeHtml(className)}</div>
        </div>
      </div>
    </div>
  </body>
</html>`;
      };

      frame = document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.left = '-10000px';
      frame.style.top = '0';
      frame.style.width = '794px';
      frame.style.height = '1123px';
      frame.style.border = '0';
      frame.style.opacity = '0';
      frame.setAttribute('aria-hidden', 'true');
      document.body.appendChild(frame);

      const frameDoc = frame.contentDocument;
      if (!frameDoc) throw new Error('Failed to create PDF document');
      frameDoc.open();
      frameDoc.write(buildPdfHtml());
      frameDoc.close();

      await new Promise<void>((resolve) => {
        if (frameDoc.readyState === 'complete') return resolve();
        frame?.addEventListener('load', () => resolve(), { once: true });
        setTimeout(() => resolve(), 500);
      });

      const imgs = Array.from(frameDoc.querySelectorAll('img')) as HTMLImageElement[];
      await Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                const done = () => resolve();
                img.onload = done;
                img.onerror = done;
              })
        )
      );

      const root = frameDoc.getElementById('pdf-root') as HTMLElement | null;
      if (!root) throw new Error('PDF content not ready');

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const pageEls = Array.from(frameDoc.querySelectorAll<HTMLElement>('.pdf-page'));
      const pages = pageEls.length > 0 ? pageEls : [root];
      const captureScale = Math.min(3, Math.max(2, (window.devicePixelRatio || 1) * 2));

      for (let i = 0; i < pages.length; i += 1) {
        const pageEl = pages[i]!;
        const canvas = await html2canvas(pageEl, {
          scale: captureScale,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: pageEl.scrollWidth,
          windowHeight: pageEl.scrollHeight,
          scrollX: 0,
          scrollY: 0,
        });

        const imgData = canvas.toDataURL('image/png');
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      }

      const safeName = `${(studentName || 'report').replace(/\s+/g, '-').toLowerCase()}-${(examName || 'exam').replace(/\s+/g, '-').toLowerCase()}.pdf`;
      pdf.save(safeName);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      if (frame && frame.parentNode) {
        frame.parentNode.removeChild(frame);
      }
      if (downloadBtn) {
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'Save as PDF';
      }
    }
  };

  const handlePrint = async () => {
    await openCleanPrintWindow();
  };

  // Build chart points
  const buildChartData = (
    subject: { score: number; trend?: number[]; grade: string; exams?: { name: string; score: number }[] } | null | undefined,
    fallbackRow?: StudentSubjectRow,
    fixedClassAvg?: number
  ): Array<{ label: string; score: number; classAvg: number | null }> => {
    const classAvgValue = typeof fixedClassAvg === "number" ? fixedClassAvg : null;
    if (!subject) {
      if (fallbackRow) {
        const score = resolveMark(fallbackRow);
        return [
          {
            label: examName ? `${examName} (Current)` : "Current Exam",
            score,
            classAvg: classAvgValue,
          },
        ];
      }
      return [];
    }
    if (Array.isArray(subject?.exams) && subject.exams.length > 0) {
      return subject.exams
        .filter((e) => typeof e.score === "number")
        .map((e) => ({ label: e.name, score: e.score, classAvg: classAvgValue }));
    }
    if (fallbackRow) {
      const score = resolveMark(fallbackRow);
      return [
        {
          label: examName ? `${examName} (Current)` : "Current Exam",
          score,
          classAvg: classAvgValue,
        },
      ];
    }
    return [];
  };

  const displayOverall: number | null = React.useMemo(() => {
    return finalWeighted != null && Number.isFinite(finalWeighted) ? finalWeighted : null;
  }, [finalWeighted]);

  const finalScoreForDisplay: number | null = React.useMemo(() => {
    if (typeof displayOverall === "number" && Number.isFinite(displayOverall)) return displayOverall;
    if (typeof overallAvgRaw === "number" && Number.isFinite(overallAvgRaw)) return overallAvgRaw;
    return null;
  }, [displayOverall, overallAvgRaw]);

  const overallTrend = (finalScoreForDisplay ?? 0) >= 75 ? "positive" : (finalScoreForDisplay ?? 0) >= 60 ? "stable" : "concerning";

  const conductDisplayItems = [
    { aspect: "Discipline", value: conductPercentages.discipline },
    { aspect: "Effort", value: conductPercentages.effort },
    { aspect: "Participation", value: conductPercentages.participation },
    { aspect: "Motivational Level", value: conductPercentages.motivationalLevel },
    { aspect: "Character", value: conductPercentages.character },
    { aspect: "Leadership", value: conductPercentages.leadership },
  ];
  const fmtConduct = (value: number | null | undefined) => (value == null || Number.isNaN(value) ? "—" : `${Math.round(value)}%`);
  const conductChipLabel = conductSummary?.source === "override" ? "Override" : "Average";
  const conductChipTooltip =
    conductSummary?.source === "override"
      ? "These values were entered by the class teacher at “All subjects” and override any per-subject entries."
      : "These values are the average of per-subject conduct entries.";
  const conductChipClass =
    conductSummary?.source === "override" ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-blue-100 text-blue-800 border-blue-200";
  const hasConductData = conductDisplayItems.some((item) => typeof item.value === "number" && Number.isFinite(item.value));
  const radarData = conductDisplayItems.map(({ aspect, value }) => ({
    aspect,
    score: Math.max(0, Math.min(100, typeof value === "number" && Number.isFinite(value) ? value : 0)),
  }));

  const handleGenerateReport = () => {
    try {
      const dateStr = new Date().toLocaleString();
      const wPct = Math.round(typeof conductWeightagePct === 'number' ? conductWeightagePct : 0);
      const aPct = Math.max(0, 100 - wPct);
      const weightageHtml = `<div class=\"muted\" style=\"font-size:12px;margin-top:4px\">Weightage: Academic ${aPct}% • Conduct ${wPct}%</div>`;
      const subjectsRowsVisual = filledRows
        .map((row) => {
          const score = resolveMark(row);
          const classAvgValue = getClassAverage(row.subject_id, row.subject_name);
          const gradeLabel = resolveGrade(score, row.grade);
          const pillText = gradeLabel === "TH" ? "Absent" : (gradeLabel || "—");
          const studentPct = Math.max(0, Math.min(100, typeof score === 'number' ? score : 0));
          const classPct = typeof classAvgValue === 'number' ? Math.max(0, Math.min(100, classAvgValue)) : 0;
          const classBarHtml = showClassAverage ? `<div class=\"bar class\" style=\"width:${classPct}%\"></div>` : '';
          return `<div class=\"sub-row\">\n            <div class=\"name\">${row.subject_name}</div>\n            <div class=\"bar-wrap\">\n              ${classBarHtml}\n              <div class=\"bar student\" style=\"width:${studentPct}%\"></div>\n            </div>\n            <div class=\"pill\">${pillText}</div>\n          </div>`;
        })
        .join("");

      const conductRowsVisual = [
        ["Discipline", conductPercentages.discipline],
        ["Effort", conductPercentages.effort],
        ["Participation", conductPercentages.participation],
        ["Motivational Level", conductPercentages.motivationalLevel],
        ["Character", conductPercentages.character],
        ["Leadership", conductPercentages.leadership],
      ]
        .map(([label, v]) => {
          const pct = typeof v === 'number' ? Math.max(0, Math.min(100, v)) : 0;
          const text = typeof v === 'number' ? `${pct.toFixed(0)}%` : '-';
          return `<div class=\"sub-row\">\n            <div class=\"name\">${label}</div>\n            <div class=\"bar-wrap\"><div class=\"bar student\" style=\"width:${pct}%\"></div></div>\n            <div class=\"pill\">${text}</div>\n          </div>`;
        })
        .join("");

      const trendText = overallTrend === 'positive' ? 'Performing Well' : overallTrend === 'stable' ? 'Average Performance' : 'Needs Attention';
      const chipBg = overallTrend === 'positive' ? '#dbeafe' : '#eff6ff';
      const chipText = overallTrend === 'positive' ? '#1d4ed8' : overallTrend === 'stable' ? '#2563eb' : '#3b82f6';

      const _html = `<!doctype html>
<html>
  <head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\" />
    <title>Report - ${studentName}</title>
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
    <div style=\"display:flex;justify-content:space-between;align-items:center;margin:16px 0 8px\">\n      <div style=\"display:flex;align-items:center;gap:16px\">\n        <div style=\"width:64px;height:64px;background:#3b82f6;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:22px;\">${(studentName || 'S').charAt(0).toUpperCase()}</div>\n        <div>\n          <h1>${studentName}</h1>\n          <div class=\"muted\">${className}${examName ? ' • ' + examName : ''}</div>\n          ${weightageHtml}\n          <div style=\"margin-top:8px\">\n            <span class=\"chip\" style=\"background:${chipBg};color:${chipText}\">${trendText}</span>\n          </div>\n        </div>\n      </div>\n      <div style=\"font-size:32px;font-weight:700;color:#0f172a\">${fmt(displayOverall)}</div>\n    </div>
    <h2>${examName || ''} - Subject Marks</h2>
    <div class=\"card\">\n      <div style=\"font-weight:600;margin-bottom:8px\">All Subject Marks</div>\n      ${subjectsRowsVisual}\n      <p class=\"muted\" style=\"margin-top:8px\">Click a bar or subject name to view the trend</p>\n    </div>
    <h2 style=\"margin-top:16px\">Conduct Profile <span class=\"chip\" style=\"margin-left:8px;background:#e0e7ff;color:#1e3a8a\">Average</span></h2>
    <div class=\"card\">\n      ${conductRowsVisual}\n    </div>
    <div style=\"margin-top:24px\"><em class=\"muted\">Use the Print button to save this as a PDF.</em></div>
  </body>
</html>`;
      setShowReportPreview(true);
    } catch (e) {
      console.error("Failed to generate report", e);
      alert("Failed to generate report. Please try again.");
    }
  };

  // Wrapper font-size bump for parentMeetMode
  const wrapperFontClass = parentMeetMode ? "text-[15px]" : undefined;

  if (!open || !studentId) return null;

  return (
    <div className={wrapperFontClass}>
      <AnimatePresence>
        <motion.div
          key="student-panel-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={isTeacher ? "fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-8" : "fixed inset-0 bg-black/20 backdrop-blur-sm z-50"}
          onClick={() => onClose()}
        >
          <motion.div
            initial={
              isTeacher
                ? { opacity: 0, y: 20, scale: 0.96 }
                : (isMobileView ? { y: "100%" } : { x: "100%" })
            }
            animate={
              isTeacher
                ? { opacity: 1, y: 0, scale: 1 }
                : (isMobileView ? { y: 0 } : { x: 0 })
            }
            exit={
              isTeacher
                ? { opacity: 0, y: 16, scale: 0.98 }
                : (isMobileView ? { y: "100%" } : { x: "100%" })
            }
            transition={{ type: "spring", damping: 24, stiffness: 260 }}
            className={
              isTeacher
                ? "w-full max-w-6xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
                : (
                    isMobileView
                      ? "fixed inset-4 bg-white shadow-2xl overflow-y-auto rounded-2xl"
                      : "fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl overflow-y-auto"
                  )
            }
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-200 p-6 z-10">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="min-w-0">
                    <h2 className="text-2xl font-semibold text-gray-900">{studentName || "Student"}</h2>
                    <p className="text-gray-600">
                      {className}
                      {examName ? ` • ${examName}` : ""}
                    </p>
                    {typeof conductWeightagePct === 'number' && (
                      <p className="text-xs text-gray-500 mt-1">Weightage: Academic {Math.max(0, 100 - Math.round(conductWeightagePct))}% • Conduct {Math.round(conductWeightagePct)}%</p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 mt-3">
                      <span
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold ${
                          overallTrend === "positive"
                            ? "bg-blue-100 text-blue-700"
                            : overallTrend === "stable"
                            ? "bg-blue-50 text-blue-600"
                            : "bg-blue-50 text-blue-500"
                        }`}
                      >
                        {overallTrend === "positive" ? (
                          <TrendingUp className="w-4 h-4" />
                        ) : overallTrend === "concerning" ? (
                          <TrendingDown className="w-4 h-4" />
                        ) : (
                          <Award className="w-4 h-4" />
                        )}
                        {overallTrend === "positive"
                          ? "Performing Well"
                          : overallTrend === "stable"
                          ? "Average Performance"
                          : "Needs Attention"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="rounded-2xl border border-gray-200 bg-white shadow-sm px-4 py-3 text-right">
                    <div className="text-[11px] uppercase tracking-wider text-gray-500">Final Mark</div>
                    <div className="mt-1 flex items-baseline justify-end gap-2">
                      {averagesLoading && finalScoreForDisplay == null ? (
                        <Loader2 className="h-5 w-5 animate-spin text-gray-400" aria-label="Loading final mark" />
                      ) : (
                        <span className="text-3xl font-semibold text-gray-900 tabular-nums">{fmt(finalScoreForDisplay)}</span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => onClose()} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleGenerateReport}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                >
                  <FileText className="w-4 h-4" />
                  {reportButtonText}
                </button>
              </div>
            </div>

            {/* Content */}
            <div className={isTeacher ? "flex-1 overflow-auto p-6 space-y-8" : "p-6 space-y-8"}>
              {showReportPreview && (
                <Portal>
                  <div id="report-print-root" className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 md:p-6" role="dialog" aria-modal="true" onClick={() => setShowReportPreview(false)}>
                    <style>{`
      @media print { 
        html, body { 
          margin: 0 !important; 
          padding: 0 !important; 
          height: auto !important; 
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        } 
        body * { 
          visibility: hidden !important; 
        } 
        #report-print-area, #report-print-area * { 
          visibility: visible !important; 
        } 
        #report-print-root { 
          position: static !important; 
          padding: 0 !important; 
          margin: 0 !important; 
        } 
        .print-container { 
          position: static !important; 
          overflow: visible !important; 
          height: auto !important; 
          max-height: none !important; 
          box-shadow: none !important; 
          padding: 0 !important; 
          margin: 0 !important; 
        } 
        #report-print-area { 
          margin: 0 !important; 
          padding: 0 !important;
          width: 100% !important;
        } 
        .avoid-break { 
          break-inside: avoid; 
          page-break-inside: avoid; 
        }
        @page { 
          margin: 1cm;
          size: A4;
        }
      } 
    `}</style>
                    <div className="print-container bg-white w-full max-w-5xl max-h-[92vh] rounded-xl shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                        <div className="text-sm text-gray-700 font-medium">Report Preview</div>
                        <div className="flex items-center gap-2">
                          <button 
                            id="pdf-download-button"
                            onClick={handleDownloadPdf} 
                            className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center justify-center min-w-[120px]"
                          >
                            Save as PDF
                          </button>
                          <button onClick={handlePrint} className="px-3 py-1.5 text-sm rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-100">Print</button>
                          <button onClick={() => setShowReportPreview(false)} className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">Close</button>
                        </div>
                      </div>
                      <div className="flex-1 overflow-auto bg-gray-100">
                        <div id="report-print-area" className="bg-white p-6 md:p-8">
                          {/* School header */}
                          <div className="row flex items-center justify-between border border-gray-200 rounded-xl bg-gray-50 px-4 py-3 mb-4">
                            <div className="flex items-center gap-3">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
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
                              <div className="w-16 h-16 bg-blue-500 rounded-xl flex items-center justify-center text-white text-xl font-semibold">{(studentName || 'S').charAt(0).toUpperCase()}</div>
                              <div>
                                <h1 className="text-2xl font-semibold text-gray-900">{studentName || 'Student'}</h1>
                                <div className="text-gray-600">{className}{examName ? ` • ${examName}` : ''}</div>
                                {typeof conductWeightagePct === 'number' && (
                                  <div className="text-xs text-gray-600 mt-1">Weightage: Academic {Math.max(0, 100 - Math.round(conductWeightagePct))}% • Conduct {Math.round(conductWeightagePct)}%</div>
                                )}
                                <div className="mt-2">
                                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold ${overallTrend === 'positive' ? 'bg-blue-100 text-blue-700' : overallTrend === 'stable' ? 'bg-blue-50 text-blue-600' : 'bg-blue-50 text-blue-500'}`}>{overallTrend === 'positive' ? 'Performing Well' : overallTrend === 'stable' ? 'Average Performance' : 'Needs Attention'}</span>
                                </div>
                              </div>
                            </div>
                            <div className="text-2xl font-semibold text-gray-900">{fmt(displayOverall)}</div>
                          </div>

                          {/* Subjects card with chart */}
                          <div className="avoid-break space-y-3 mb-6">
                            <h3 className="text-lg font-semibold text-gray-900">{examName ? `${examName} - Subject Marks` : 'Subject Performance Overview'}</h3>
                            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                              <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                  {!selectedSubject ? (
                                    <BarChart
                                      data={subjectSummaries.map((summary) => ({
                                        ...summary,
                                        classAvgForChart: showClassAverage ? summary.classAvg ?? undefined : undefined,
                                      }))}
                                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                    >
                                      <XAxis dataKey="subject" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={80} />
                                      <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                                      <Tooltip contentStyle={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                                      <Bar dataKey="score" fill="#3b82f6" name="Student Mark" radius={[4, 4, 0, 0]} />
                                      {showClassAverage && (
                                        <Bar dataKey="classAvgForChart" fill="#9ca3af" name="Class Average" radius={[4, 4, 0, 0]} />
                                      )}
                                    </BarChart>
                                  ) : (
                                    <LineChart
                                      data={buildChartData(
                                        undefined,
                                        selectedSubjectRow,
                                        showClassAverage
                                          ? (subjectSummaries.find((s) => s.subject === selectedSubject)?.classAvg ?? undefined)
                                          : undefined
                                      )}
                                      margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                                    >
                                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                                      <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                                      <Tooltip />
                                      <Line type="monotone" dataKey="score" stroke="#3b82f6" name="Student" strokeWidth={2} />
                                      {showClassAverage && (
                                        <Line type="monotone" dataKey="classAvg" stroke="#9ca3af" name="Class Avg" strokeDasharray="4 4" />
                                      )}
                                    </LineChart>
                                  )}
                                </ResponsiveContainer>
                              </div>
                              {/* Subject list under chart */}
                              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                                {subjectSummaries.map((s) => (
                                  <div key={s.subject} className="flex items-center justify-between rounded-lg bg-white border border-gray-200 px-3 py-2">
                                    <span className="text-sm text-gray-700">{s.subject}</span>
                                    <span className="text-right">
                                      <span className="block text-sm font-semibold text-gray-900">{s.grade || "—"}</span>
                                      <span className="block text-[11px] text-gray-500">{fmt(s.score)}</span>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Conduct radar */}
                          <div className="avoid-break space-y-3">
                            <h3 className="text-lg font-semibold text-gray-900">Conduct Profile</h3>
                            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
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
                  </div>
                </Portal>
              )}

              {/* Alerts (teacher mode doesn’t compute attention; preserve layout) */}
              {/* no attention block here unless added later */}

              {/* Subject Performance */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {examName ? `${examName} - Subject Marks` : "Subject Performance Overview"}
                </h3>

                <div className="bg-gray-50 rounded-xl p-6 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                      {selectedSubject ? `${selectedSubject} - Performance Trend` : "All Subject Marks"}
                      {selectedSubject && (selectedSubjectRow?.grade) === "TH" && (
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
                                classAvgForChart: showClassAverage ? summary.classAvg ?? undefined : undefined,
                              }))}
                              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                              onClick={(data) => {
                                if (data && typeof (data as { activeLabel?: unknown }).activeLabel === "string") {
                                  setSelectedSubject((data as { activeLabel?: string }).activeLabel!);
                                }
                              }}
                            >
                              <XAxis dataKey="subject" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={80} />
                              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                              <Tooltip
                                formatter={(value: unknown, name: string, item: unknown) => {
                                  const payload = (item as { payload?: { subject?: string; score?: number | null; classAvg?: number | null } })?.payload;
                                  if (!payload) {
                                    return [fmt(toNumeric(value)), name];
                                  }
                                  if (name === "Student Mark") {
                                    return [fmt(payload.score), name];
                                  }
                                  if (name === "Class Average") {
                                    return [fmt(payload.classAvg), name];
                                  }
                                  return [fmt(toNumeric(value)), name];
                                }}
                                labelFormatter={(label) => `Subject: ${label}`}
                                contentStyle={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px" }}
                              />
                              <Bar dataKey="score" fill="#3b82f6" name="Student Mark" style={{ cursor: "pointer" }} radius={[4, 4, 0, 0]} />
                              {showClassAverage && (
                                <Bar dataKey="classAvgForChart" fill="#9ca3af" name="Class Average" radius={[4, 4, 0, 0]} />
                              )}
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <p className="text-sm text-gray-600 mt-2">Click a bar or subject name to view the trend</p>
                      </>
                    ) : (
                      <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                        {subjectsLoading ? "Loading subjects…" : "No subject data available"}
                      </div>
                    )
                  ) : (
                    (() => {
                      const selectedSummary = subjectSummaries.find((summary) => summary.subject === selectedSubject);
                      const classAvgValue = showClassAverage ? selectedSummary?.classAvg ?? null : null;
                      const historicalData = buildChartData(
                        undefined,
                        selectedSubjectRow,
                        showClassAverage ? classAvgValue ?? undefined : undefined
                      );
                      const scoreValue = selectedSubjectRow ? resolveMark(selectedSubjectRow) : undefined;
                      const gradeValue = resolveGrade(scoreValue, selectedSubjectRow?.grade);
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
                                      if (name === "Student") {
                                        return [fmt(toNumeric(value)), "Student Mark"];
                                      }
                                      if (name === "Class Avg") {
                                        return [fmt(toNumeric(value)), "Class Average"];
                                      }
                                      return [fmt(toNumeric(value)), name];
                                    }}
                                  />
                                  <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={3} name="Student" dot={{ fill: "#3b82f6", strokeWidth: 2, r: 4 }} />
                                  {showClassAverage && (
                                    <Line
                                      type="monotone"
                                      dataKey="classAvg"
                                      stroke="#9ca3af"
                                      strokeWidth={2}
                                      strokeDasharray="5 5"
                                      name="Class Avg"
                                      dot={{ fill: '#9ca3af', strokeWidth: 2, r: 3 }}
                                    />
                                  )}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                              {subjectsLoading ? "Loading subject details…" : "No exam data yet for this subject"}
                            </div>
                          )}
                          {(selectedSubjectRow) && (
                            <div className="mt-4 space-y-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-semibold text-gray-900">{gradeValue || "—"}</span>
                                    {typeof scoreValue === "number" && Number.isFinite(scoreValue) && (
                                      <span className="text-sm text-gray-500">{fmt(scoreValue)}</span>
                                    )}
                                  </div>
                                  {gradeValue === "TH" && (
                                    <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                                      Absent
                                    </span>
                                  )}
                                </div>
                                {showClassAverage && typeof scoreValue === 'number' && Number.isFinite(scoreValue) && classAvgValue != null && Number.isFinite(classAvgValue) && (
                                  <div className="text-sm text-gray-600">
                                    vs Class Avg: {fmt(classAvgValue)}
                                    <span
                                      className={`ml-2 ${scoreValue > classAvgValue ? 'text-green-600' : scoreValue === classAvgValue ? 'text-gray-600' : 'text-red-600'}`}
                                    >
                                      ({scoreValue > classAvgValue ? "+" : ""}
                                      {(scoreValue - classAvgValue).toFixed(1)}%)
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                                <div>
                                  <span className="font-medium text-gray-900">Grade:</span> {gradeValue || "—"}
                                </div>
                                {showClassAverage && (
                                  <div>
                                    <span className="font-medium text-gray-900">Class Avg:</span> {fmt(classAvgValue)}
                                  </div>
                                )}
                                <div>
                                  <span className="font-medium text-gray-900">Trend:</span> Not available
                                </div>
                                <div>
                                  <span className="font-medium text-gray-900">Exams Recorded:</span> {1}
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()
                  )}

                  {/* Subjects and Marks Summary */}
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    {subjectSummaries.length > 0 ? (
                      subjectSummaries.map(({ subject, score, grade }) => {
                        const isSelected = subject === selectedSubject;
                        const displayGrade = grade || "—";
                        const isAbsent = displayGrade === "TH";
                        return (
                          <button
                            key={subject}
                            type="button"
                            onClick={() => setSelectedSubject((prev) => (prev === subject ? null : subject))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedSubject((prev) => (prev === subject ? null : subject));
                              }
                            }}
                            className={`flex justify-between items-center px-3 py-2 rounded-lg shadow-sm border transition-colors ${
                              isSelected ? "bg-blue-50 border-blue-200" : "bg-white border-gray-100 hover:bg-gray-50"
                            }`}
                            title="View trend"
                            aria-pressed={isSelected}
                          >
                            <span className="text-gray-600 font-medium text-left">{subject}</span>
                            <span className="text-right">
                              <span className="block text-gray-900 font-semibold">
                                {isAbsent ? "Absent" : displayGrade}
                              </span>
                              <span className="block text-[11px] text-gray-500">
                                {isAbsent ? "No score" : fmt(score)}
                              </span>
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="col-span-full text-center text-sm text-gray-400">
                        {subjectsLoading ? "Loading subjects…" : "No subjects recorded yet"}
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
                        key={`student-radar-${studentId}-${radarData.length}`}
                        data={radarData}
                        keys={["score"]}
                        indexBy="aspect"
                        maxValue={100}
                        margin={{ top: 30, right: 40, bottom: 30, left: 40 }}
                        curve="linearClosed"
                        borderWidth={2}
                        borderColor={{ from: "color" }}
                        gridLevels={5}
                        gridShape="circular"
                        gridLabelOffset={16}
                        enableDots={true}
                        dotSize={8}
                        dotColor={{ theme: "background" }}
                        dotBorderWidth={2}
                        dotBorderColor={{ from: "color" }}
                        enableDotLabel={false}
                        colors={["#3b82f6"]}
                        fillOpacity={0.25}
                        blendMode="multiply"
                        animate={false}
                        isInteractive={true}
                        legends={[]}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-400 text-sm">No conduct data available</div>
                    )}
                  </div>

                  {/* Manual Legend */}
                  <div className="mt-4 flex justify-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                      <span className="text-gray-600">Current Score</span>
                    </div>
                  </div>

                  {/* Conduct Summary */}
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    {conductDisplayItems.map((item) => (
                      <div key={item.aspect} className="flex justify-between items-center px-3 py-2 bg-white rounded-lg shadow-sm">
                        <span className="text-gray-600 font-medium">{item.aspect}</span>
                        <span className="text-gray-900 font-semibold">{fmtConduct(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
