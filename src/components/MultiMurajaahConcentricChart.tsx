"use client";
import React, { useMemo } from "react";
import type { Report } from "@/types/teacher";
import { getPageRangeFromJuz } from "@/lib/quranMapping";

interface MultiMurajaahConcentricChartProps {
  students: { id: string; name: string }[];
  reports: Report[];
  size?: number;
}

export function MultiMurajaahConcentricChart({ students, reports, size = 260 }: MultiMurajaahConcentricChartProps) {
  const totalPagesToReview = 604;

  const palette = [
    "#ef4444",
    "#22c55e",
    "#3b82f6",
    "#f59e0b",
    "#a855f7",
    "#06b6d4",
    "#84cc16",
    "#ec4899",
    "#14b8a6",
    "#f97316",
  ];

  const perStudentProgress = useMemo(() => {
    return students.map((s) => {
      const murajaahReports = reports.filter(r => r.student_id === s.id && ["Murajaah", "Old Murajaah", "New Murajaah"].includes(r.type));
      const tasmiReports = reports.filter(r => r.student_id === s.id && r.type === 'Tasmi');
      const maxTasmiPageTo = Math.max(
        ...tasmiReports.map(r => (r.page_to !== null && !isNaN(r.page_to) ? r.page_to : 0)),
        0
      );
      const targetPages = maxTasmiPageTo > 0 ? maxTasmiPageTo : totalPagesToReview;
      const pageReviewCounts = new Map<number, number>();
      for (let p = 1; p <= targetPages; p++) pageReviewCounts.set(p, 0);
      murajaahReports.forEach(r => {
        if (r.page_from && r.page_to) {
          const start = Math.min(r.page_from, r.page_to);
          const end = Math.max(r.page_from, r.page_to);
          for (let p = start; p <= end && p <= targetPages; p++) {
            pageReviewCounts.set(p, (pageReviewCounts.get(p) || 0) + 1);
          }
        }
      });
      const reviewCounts = Array.from(pageReviewCounts.values());
      // Progress uses highest reviewed page relative to targetPages
      const murajaahMaxPage = Math.min(
        Math.max(
          0,
          ...murajaahReports.map(r => {
            const pf = r.page_from || 0;
            const pt = r.page_to || 0;
            const maxPage = Math.max(pf, pt);
            if (maxPage > 0) return maxPage;
            if (r.juzuk) return getPageRangeFromJuz(r.juzuk)?.endPage || 0;
            return 0;
          })
        ),
        targetPages
      );
      const currentCycleProgress = targetPages > 0 ? (murajaahMaxPage / targetPages) * 100 : 0;
      const completedCycles = reviewCounts.length > 0 ? Math.min(...reviewCounts) : 0;
      return { student: s, progress: currentCycleProgress, completedCycles };
    });
  }, [students, reports]);

  const strokeWidth = 12;
  const gap = 6;
  const outerRadius = (size - strokeWidth) / 2;

  const sorted = useMemo(() => {
    return [...perStudentProgress].sort((a, b) => a.student.name.localeCompare(b.student.name));
  }, [perStudentProgress]);

  return (
    <div className="flex flex-col items-center p-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {sorted.map((item, idx) => {
            const radius = outerRadius - idx * (strokeWidth + gap);
            if (radius <= strokeWidth / 2) return null;
            const circumference = 2 * Math.PI * radius;
            const dashOffset = circumference - (item.progress / 100) * circumference;
            const color = palette[idx % palette.length];
            return (
              <g key={item.student.id}>
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="transparent"
                  stroke="#e5e7eb"
                  strokeWidth={strokeWidth}
                />
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="transparent"
                  stroke={color}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  style={{ transition: "stroke-dashoffset 0.5s ease-in-out" }}
                />
              </g>
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="text-sm font-semibold text-gray-700">Murajaah Progress</div>
          <div className="text-xs text-gray-500">One ring per child</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1 w-full">
        {sorted.map((item, idx) => {
          const color = palette[idx % palette.length];
          return (
            <div key={item.student.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-gray-800 font-medium">{item.student.name}</span>
              </div>
              <span className="text-gray-600">{item.progress.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}


