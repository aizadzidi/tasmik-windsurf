"use client";
import React, { useMemo } from "react";
import type { Report } from "@/types/teacher";
import { getJuzFromPage } from "@/lib/quranMapping";

interface NewMurajaahRangeBarProps {
  reports: Report[];
  accentColor?: string;
  maxTasmiPage?: number;
}

type PageRange = {
  from: number;
  to: number;
  date: string;
};

export function NewMurajaahRangeBar({
  reports,
  accentColor = "#10b981",
  maxTasmiPage
}: NewMurajaahRangeBarProps) {
  const latestRange = useMemo<PageRange | null>(() => {
    const candidates = reports
      .filter((r) => r.type === "New Murajaah")
      .filter((r) => r.page_from !== null && r.page_to !== null);
    if (candidates.length === 0) return null;

    return candidates.reduce<PageRange>((current, report) => {
      const from = Math.min(report.page_from || 0, report.page_to || 0);
      const to = Math.max(report.page_from || 0, report.page_to || 0);
      if (!current) {
        return { from, to, date: report.date };
      }
      if (report.date > current.date) {
        return { from, to, date: report.date };
      }
      if (report.date === current.date && to > current.to) {
        return { from, to, date: report.date };
      }
      return current;
    }, { from: 0, to: 0, date: "" });
  }, [reports]);

  if (!latestRange || latestRange.from <= 0 || latestRange.to <= 0) {
    return (
      <div className="py-8 text-center text-xs text-emerald-700">
        No new murajaah records yet.
      </div>
    );
  }

  const resolvedMax = Math.max(1, Math.min(604, maxTasmiPage || 604));
  const windowStart = Math.max(1, resolvedMax - 19);
  const windowSize = Math.max(1, resolvedMax - windowStart + 1);
  const start = Math.min(latestRange.from, latestRange.to);
  const end = Math.max(latestRange.from, latestRange.to);
  const count = Math.max(1, end - start + 1);
  const clampedStart = Math.min(Math.max(start, windowStart), resolvedMax);
  const clampedEnd = Math.min(Math.max(end, windowStart), resolvedMax);
  const offsetFromWindowStart = clampedStart - windowStart;
  const clampedCount = Math.max(1, clampedEnd - clampedStart + 1);
  const startPercent = Math.max(0, Math.min(100, (offsetFromWindowStart / windowSize) * 100));
  const widthPercent = Math.max(0.5, Math.min(100, (clampedCount / windowSize) * 100));
  const currentJuz = getJuzFromPage(end);

  return (
    <div className="flex flex-col items-center p-4">
      <div className="w-full space-y-3">
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>Pages {start}-{end}</span>
          <span>{count} pages</span>
        </div>
        <div className="relative h-3 rounded-full bg-emerald-100 overflow-hidden">
          <div
            className="absolute inset-y-0 rounded-full"
            style={{
              left: `${startPercent}%`,
              width: `${widthPercent}%`,
              backgroundColor: accentColor
            }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-gray-400">
          <span>Page {windowStart}</span>
          <span>Page {resolvedMax}</span>
        </div>
      </div>

      <div className="mt-4 text-center space-y-1">
        <div className="text-2xl font-bold text-gray-800">{count} pages</div>
        <div className="text-xs text-gray-600">Latest new murajaah window</div>
        {currentJuz && (
          <div className="text-xs text-emerald-700 font-medium">Current Juz: {currentJuz}</div>
        )}
      </div>
    </div>
  );
}
