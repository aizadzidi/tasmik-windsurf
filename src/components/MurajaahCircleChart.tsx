"use client";
import React from 'react';
import type { Report } from "@/types/teacher";
import { getJuzFromPage, getPageRangeFromJuz } from "@/lib/quranMapping";

interface MurajaahCircleChartProps {
  reports: Report[];
  label?: string;
  accentColor?: string;
}

export function MurajaahCircleChart({ reports, label = "Murajaah", accentColor = "#3b82f6" }: MurajaahCircleChartProps) {
  // Determine target boundary from latest Tasmi progress (use latest max page_to only)
  const tasmiReports = reports.filter(r => r.type === 'Tasmi');
  const maxTasmiPageTo = Math.max(
    ...tasmiReports.map(r => (r.page_to !== null && !isNaN(r.page_to) ? r.page_to : 0)),
    0
  );
  const totalPagesToReview = maxTasmiPageTo > 0 ? maxTasmiPageTo : 604;
  const currentJuz = getJuzFromPage(totalPagesToReview) || 30;

  // 2) Gather all Murajaah reports
  const murajaahReports = reports.filter(r => 
    ['Murajaah', 'Old Murajaah', 'New Murajaah'].includes(r.type)
  );

  // 3) Count how many times each page (1..totalPagesToReview) has been reviewed
  const pageReviewCounts = new Map<number, number>();
  for (let page = 1; page <= totalPagesToReview; page++) {
    pageReviewCounts.set(page, 0);
  }

  // Count reviews for each page
  murajaahReports.forEach(report => {
    if (report.page_from && report.page_to) {
      const startPage = Math.min(report.page_from, report.page_to);
      const endPage = Math.max(report.page_from, report.page_to);
      for (let page = startPage; page <= endPage; page++) {
        if (page <= totalPagesToReview) {
          pageReviewCounts.set(page, (pageReviewCounts.get(page) || 0) + 1);
        }
      }
    }
  });

  // 4) Calculate completion cycles (how many full cycles completed for ALL pages)
  const reviewCounts = Array.from(pageReviewCounts.values());
  const completedCycles = reviewCounts.length > 0 ? Math.min(...reviewCounts) : 0;

  // 5) Progress is based on highest reviewed page relative to Tasmi boundary
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
    totalPagesToReview
  );
  const currentCycleProgress = totalPagesToReview > 0
    ? (murajaahMaxPage / totalPagesToReview) * 100
    : 0;

  // Debug logging to help understand the data
  console.log('MurajaahCircleChart Debug:', {
    boundaryTotalPagesToReview: totalPagesToReview,
    derivedCurrentJuz: currentJuz,
    murajaahReportsCount: murajaahReports.length,
    completedCycles,
    murajaahMaxPage,
    currentCycleProgress: currentCycleProgress.toFixed(1) + '%',
    sampleReviewCounts: Array.from(pageReviewCounts.entries()).slice(0, 10),
    lastMurajaahReport: murajaahReports[0]
  });
  
  // Circle parameters
  const size = 200;
  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (currentCycleProgress / 100) * circumference;

  // Calculate positions for cycle marks
  const getMarkPositions = (numMarks: number) => {
    const marks = [];
    for (let i = 0; i < numMarks && i < 12; i++) { // Limit to 12 marks for visual clarity
      const angle = (i / Math.max(1, numMarks - 1)) * 2 * Math.PI - (Math.PI / 2);
      const x = size / 2 + (radius + 15) * Math.cos(angle);
      const y = size / 2 + (radius + 15) * Math.sin(angle);
      marks.push({ x, y });
    }
    return marks;
  };

  const marks = completedCycles > 0 ? getMarkPositions(completedCycles) : [];

  return (
    <div className="flex flex-col items-center p-4">
      <div className="relative">
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="#e5e7eb"
            strokeWidth={strokeWidth}
          />
          
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke={accentColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            style={{
              transition: 'stroke-dashoffset 0.5s ease-in-out',
            }}
          />
        </svg>
        
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="text-2xl font-bold text-gray-800">
            {currentCycleProgress.toFixed(1)}%
          </div>
          <div className="text-sm text-gray-600">
            {label}
          </div>
          {completedCycles > 0 && (
            <div className="text-xs font-medium mt-1" style={{ color: accentColor }}>
              {completedCycles} Complete
            </div>
          )}
        </div>
        
        {/* Cycle completion marks */}
        {marks.map((mark, index) => (
          <div
            key={index}
            className="absolute w-3 h-3 bg-green-500 rounded-full border-2 border-white shadow-sm"
            style={{
              left: mark.x - 6,
              top: mark.y - 6,
            }}
            title={`Cycle ${index + 1} completed`}
          />
        ))}
      </div>
      
      {/* Statistics */}
      <div className="mt-4 text-center space-y-1">
        <div className="text-sm text-gray-700">
          <span className="font-medium">Current Juz: {currentJuz}</span>
        </div>
        <div className="text-xs text-gray-500">
          Reviewing {totalPagesToReview} pages
        </div>
        <div className="text-xs text-green-600 font-medium">
          {completedCycles} complete cycles
        </div>
      </div>
    </div>
  );
}
