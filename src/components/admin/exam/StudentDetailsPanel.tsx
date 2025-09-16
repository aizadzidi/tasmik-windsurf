"use client";

import React, { useRef, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { X, TrendingUp, TrendingDown, Award, AlertCircle, FileText } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, BarChart, Bar } from 'recharts';
import { ResponsiveRadar } from '@nivo/radar';
import { motion, AnimatePresence } from 'framer-motion';
import { StudentData } from './StudentTable';

interface StudentDetailsPanelProps {
  student: StudentData | null;
  onClose: () => void;
  classAverages?: {
    [subject: string]: number;
  };
  isMobile?: boolean;
  selectedExamName?: string;
  reportButtonLabel?: string;
}

export default function StudentDetailsPanel({ 
  student, 
  onClose, 
  classAverages = {},
  isMobile = false,
  selectedExamName = '',
  reportButtonLabel = 'Generate Report'
}: StudentDetailsPanelProps) {
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [showReportPreview, setShowReportPreview] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const handleDownloadPdf = async () => {
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 36;
      let y = 40;

      // Logo (best effort)
      try {
        const res = await fetch('/logo-akademi.png');
        const blob = await res.blob();
        const reader = new FileReader();
        const dataUrl: string = await new Promise((resolve, reject) => { reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
        doc.addImage(dataUrl, 'PNG', margin, y, 42, 42);
      } catch {}

      doc.setFontSize(14); doc.setTextColor('#0f172a');
      doc.text('Al Khayr Class', margin + 54, y + 16);
      doc.setFontSize(10); doc.setTextColor('#475569');
      doc.text('Student Performance Report', margin + 54, y + 32);
      doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin, y + 10, { align: 'right' });

      y += 56; doc.setTextColor('#0f172a'); doc.setFontSize(10);
      const chips = [
        `Name: ${student.name}`,
        `Class: ${student.class}`,
        ...(selectedExamName ? [`Exam: ${selectedExamName}`] : []),
        `Overall: ${student.overall?.average ?? 0}%`,
        `Rank #${student.overall?.rank ?? 0}`,
      ];
      let x = margin; const pad = 6, gap = 6; let cy = y;
      chips.forEach(c => { const w = doc.getTextWidth(c) + pad * 2; if (x + w > pageWidth - margin) { x = margin; cy += 20; } doc.setDrawColor('#e2e8f0'); doc.setFillColor('#f8fafc'); doc.roundedRect(x, cy - 12, w, 18, 3, 3, 'FD'); doc.setTextColor('#0f172a'); doc.text(c, x + pad, cy + 2); x += w + gap; });
      y = cy + 26;

      if (student.overall?.needsAttention) {
        const text = `Attention Required: ${student.overall.attentionReason || 'Student performance needs monitoring'}`;
        doc.setDrawColor('#bfdbfe'); doc.setFillColor('#eff6ff');
        doc.roundedRect(margin, y, pageWidth - margin * 2, 36, 6, 6, 'FD');
        doc.setFontSize(11); doc.setTextColor('#1e3a8a');
        doc.text(text, margin + 10, y + 22, { maxWidth: pageWidth - margin * 2 - 20 });
        y += 48; doc.setTextColor('#0f172a');
      }

      // Summary table
      doc.setFontSize(12); doc.text('Summary', margin, y); y += 6;
      autoTable(doc, {
        startY: y + 6,
        head: [['Overall Average', 'Rank']],
        body: [[`${student.overall?.average ?? 0}%`, `#${student.overall?.rank ?? 0}`]],
        styles: { fontSize: 10 },
        headStyles: { fillColor: [241, 245, 249], textColor: 15 },
        margin: { left: margin, right: margin },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 18;

      // Subjects table
      doc.text('Subjects', margin, y); y += 6;
      const subjectsBody = Object.entries(student.subjects || {}).map(([name, d]: any) => [
        name,
        typeof d?.score === 'number' ? `${d.score}%` : '-',
        typeof classAverages[name] === 'number' ? `${classAverages[name]}%` : '-',
        d?.grade || '-',
      ]);
      autoTable(doc, {
        startY: y + 6,
        head: [['Subject', 'Score', 'Class Avg', 'Grade']],
        body: subjectsBody,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [241, 245, 249], textColor: 15 },
        margin: { left: margin, right: margin },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 18;

      // Conduct table
      const toPct = (v?: number) => (typeof v === 'number' ? `${Math.max(0, Math.min(100, v * 20)).toFixed(0)}%` : '-');
      doc.text('Conduct', margin, y); y += 6;
      autoTable(doc, {
        startY: y + 6,
        head: [['Aspect', 'Score']],
        body: [
          ['Discipline', toPct(student.conduct?.discipline)],
          ['Effort', toPct(student.conduct?.effort)],
          ['Participation', toPct(student.conduct?.participation)],
          ['Motivational Level', toPct((student as any).conduct?.motivational_level ?? student.conduct?.motivationalLevel)],
          ['Character', toPct(student.conduct?.character)],
          ['Leadership', toPct(student.conduct?.leadership)],
        ],
        styles: { fontSize: 10 },
        headStyles: { fillColor: [241, 245, 249], textColor: 15 },
        margin: { left: margin, right: margin },
      });

      const nameSlug = student.name.replace(/\s+/g, '-').toLowerCase();
      doc.save(`student-report-${nameSlug}.pdf`);
    } catch (e) {
      console.error('PDF export failed', e);
      alert('Failed to generate PDF. You can still use Print in the preview.');
    }
  };
  
  if (!student) return null;

  // Build chart points from either real exam history or fallback trend
  const buildChartData = (
    subject: { score: number; trend: number[]; grade: string; exams?: { name: string; score: number }[] },
    fixedClassAvg?: number
  ) => {
    // Prefer real exam history if available
    if (Array.isArray(subject.exams) && subject.exams.length > 0) {
      return subject.exams
        .filter(e => typeof e.score === 'number')
        .map(e => ({
          label: e.name,
          score: e.score,
          classAvg: typeof fixedClassAvg === 'number' ? fixedClassAvg : 0,
        }));
    }

    // No history available
    return [] as { label: string; score: number; classAvg: number }[];
  };

  const conductData = [
    { aspect: 'Discipline', score: student.conduct.discipline },
    { aspect: 'Effort', score: student.conduct.effort },
    { aspect: 'Participation', score: student.conduct.participation },
    { aspect: 'Motivational Level', score: student.conduct.motivationalLevel },
    { aspect: 'Character', score: student.conduct.character },
    { aspect: 'Leadership', score: student.conduct.leadership },
  ];

  // Transform data for radar chart - use percentage values with 100% as perfect
  const radarData = conductData
    .filter(item => item && item.aspect && !isNaN(item.score))
    .map(item => ({
      aspect: item.aspect,
      score: Math.max(0, Math.min(100, item.score * 20)), // Convert 1-5 scale to percentage (5.0 = 100%)
    }));

  const overallTrend = student.overall.average >= 75 ? 'positive' : 
                       student.overall.average >= 60 ? 'stable' : 'concerning';

  const handleGenerateReport = () => {
    try {
      const dateStr = new Date().toLocaleString();
      const subjectsRows = Object.entries(student.subjects || {})
        .map(([subject, data]) => {
          const score = typeof (data as any)?.score === 'number' ? (data as any).score : '';
          const grade = (data as any)?.grade ?? '';
          const classAvg = typeof classAverages[subject] === 'number' ? classAverages[subject] : '';
          return `<tr>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:left">${subject}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:center">${score !== '' ? score + '%' : '-'}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:center">${classAvg !== '' ? classAvg + '%' : '-'}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:center">${grade || '-'}</td>
          </tr>`;
        })
        .join('');

      const conductRows = [
        ['Discipline', student.conduct.discipline],
        ['Effort', student.conduct.effort],
        ['Participation', student.conduct.participation],
        ['Motivational Level', student.conduct.motivationalLevel],
        ['Character', student.conduct.character],
        ['Leadership', student.conduct.leadership],
      ]
        .map(([label, v]) => `<tr>
          <td style="padding:8px;border:1px solid #e5e7eb;text-align:left">${label}</td>
          <td style="padding:8px;border:1px solid #e5e7eb;text-align:center">${typeof v === 'number' ? Math.max(0, Math.min(100, v * 20)).toFixed(0) + '%' : '-'}</td>
        </tr>`)
        .join('');

      const attentionBlock = student.overall.needsAttention
        ? `<div style="padding:12px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:8px;margin:12px 0;color:#1e3a8a">
            <strong>Attention Required:</strong> ${student.overall.attentionReason || 'Student performance needs monitoring'}
          </div>`
        : '';

      const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Report - ${student.name}</title>
    <style>
      body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,'Apple Color Emoji','Segoe UI Emoji';color:#111827;margin:24px}
      h1{font-size:22px;margin:0}
      h2{font-size:18px;margin:18px 0 8px}
      .muted{color:#6b7280}
      .row{display:flex;justify-content:space-between;align-items:center}
      table{border-collapse:collapse;width:100%;font-size:13px}
      @media print{button{display:none} body{margin:0}}
    </style>
  </head>
  <body>
    <div class="row">
      <div>
        <h1>${student.name}</h1>
        <div class="muted">${student.class}${selectedExamName ? ' • ' + selectedExamName : ''}</div>
      </div>
      <div class="muted">Generated: ${dateStr}</div>
    </div>
    ${attentionBlock}
    <h2>Summary</h2>
    <table style="margin-bottom:16px">
      <tr>
        <td style="padding:8px;border:1px solid #e5e7eb">Overall Average</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:center">${student.overall.average}%</td>
      </tr>
      <tr>
        <td style="padding:8px;border:1px solid #e5e7eb">Rank</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:center">#${student.overall.rank}</td>
      </tr>
    </table>
    <h2>Subjects</h2>
    <table>
      <thead>
        <tr>
          <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Subject</th>
          <th style="padding:8px;border:1px solid #e5e7eb;text-align:center">Score</th>
          <th style="padding:8px;border:1px solid #e5e7eb;text-align:center">Class Avg</th>
          <th style="padding:8px;border:1px solid #e5e7eb;text-align:center">Grade</th>
        </tr>
      </thead>
      <tbody>${subjectsRows}</tbody>
    </table>
    <h2 style="margin-top:16px">Conduct</h2>
    <table>
      <thead>
        <tr>
          <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Aspect</th>
          <th style="padding:8px;border:1px solid #e5e7eb;text-align:center">Score</th>
        </tr>
      </thead>
      <tbody>${conductRows}</tbody>
    </table>
    <div style="margin-top:24px"><em class="muted">Open Print from the viewer to save as PDF.</em></div>
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
                    <span className="text-sm text-gray-500">
                      Rank #{student.overall.rank}
                    </span>
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
            {showReportPreview && reportHtml && (
              <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" onClick={()=>setShowReportPreview(false)}>
                <div className="bg-white w-full max-w-5xl max-h-[90vh] rounded-xl shadow-2xl overflow-hidden flex flex-col" onClick={e=>e.stopPropagation()}>
                  <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                    <div className="text-sm text-gray-700 font-medium">Report Preview</div>
                    <div className="flex items-center gap-2">
                      <button onClick={handleDownloadPdf} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700">Download PDF</button>
                      <button onClick={() => { try { const win = iframeRef.current?.contentWindow; win?.focus(); win?.print(); } catch (e) { console.error(e); } }} className="px-3 py-1.5 text-sm rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-100">Print</button>
                      <button onClick={()=>setShowReportPreview(false)} className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">Close</button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto bg-gray-100">
                    <iframe ref={iframeRef} title="Report Preview" className="w-full h-[75vh] bg-white" srcDoc={reportHtml || ''} />
                  </div>
                </div>
              </div>
            )}
            {/* Alerts */}
            {student.overall.needsAttention && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-blue-900">Attention Required</h4>
                    <p className="text-sm text-red-700 mt-1">
                      {student.overall.attentionReason || 'Student performance needs monitoring'}
                    </p>
                  </div>
                </div>
              </div>
            )}

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
                    {selectedSubject && student.subjects[selectedSubject]?.grade === 'TH' && (
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
                  <>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                          data={Object.entries(student.subjects).map(([subject, data]) => ({
                            subject,
                            score: data.score,
                            classAvg: (classAverages[subject] ?? 0),
                            grade: data.grade
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
                            formatter={(value, name, item: any) => {
                              const grade = item && item.payload ? item.payload.grade : undefined;
                              if (grade === 'TH' && name === 'score') {
                                return ['Absent', 'Student'];
                              }
                              if (name === 'score') {
                                return [`${value}%`, 'Student Mark'];
                              } else if (name === 'classAvg') {
                                return [`${value}%`, 'Class Average'];
                              }
                              return [`${value}%`, name];
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
                            dataKey="classAvg" 
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
                  (() => {
                    const subjectData = student.subjects[selectedSubject];
                    const classAvg = (classAverages[selectedSubject] ?? 0);
                    const historicalData = buildChartData(subjectData, classAvg);
                    
                    return (
                      <>
                        {historicalData.length > 0 ? (
                          <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={historicalData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                                <Tooltip />
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
                            No exam data yet for this subject
                          </div>
                        )}
                        
                        <div className="flex items-center justify-between mt-4">
                          <div className="flex items-center gap-4">
                            <span className="text-lg font-semibold">{subjectData.score}%</span>
                            <span className={`text-sm px-3 py-1 rounded-full ${
                              subjectData.grade === 'A' ? 'bg-blue-100 text-blue-800' :
                              subjectData.grade === 'B' ? 'bg-blue-50 text-blue-700' :
                              subjectData.grade === 'C' ? 'bg-blue-50 text-blue-600' :
                              'bg-blue-50 text-blue-500'
                            }`}>
                              Grade {subjectData.grade}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600">
                            vs Class Avg: {classAvg.toFixed(1)}%
                            <span className={`ml-2 ${
                              subjectData.score > classAvg ? 'text-green-600' : 
                              subjectData.score === classAvg ? 'text-gray-600' : 'text-red-600'
                            }`}>
                              ({subjectData.score > classAvg ? '+' : ''}{(subjectData.score - classAvg).toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                      </>
                    );
                  })()
                )}

                {/* Minimalist Subjects and Marks Summary */}
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  {Object.entries(student.subjects).map(([subject, data]) => {
                    const isSelected = subject === selectedSubject;
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
                        <span className="text-gray-900 font-semibold">{data.score}%</span>
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Conduct Profile */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Conduct Profile</h3>
              <div className="bg-gray-50 rounded-xl p-6">
                <div className="h-64">
                  {radarData.length > 0 ? (
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
                  {conductData.map(item => (
                    <div key={item.aspect} className="flex justify-between items-center px-3 py-2 bg-white rounded-lg shadow-sm">
                      <span className="text-gray-600 font-medium">{item.aspect}</span>
                      <span className="text-gray-900 font-semibold">{(item.score * 20).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Benchmarks */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Benchmarks</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-semibold text-blue-900">{student.overall.average}%</div>
                  <div className="text-sm text-blue-700">Current Average</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-semibold text-gray-900">
                    {Object.values(classAverages).length > 0 
                      ? (Object.values(classAverages).reduce((a, b) => a + b, 0) / Object.values(classAverages).length).toFixed(1)
                      : '0.0'}%
                  </div>
                  <div className="text-sm text-gray-700">Class Average</div>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-semibold text-blue-900">#{student.overall.rank}</div>
                  <div className="text-sm text-green-700">Class Rank</div>
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
