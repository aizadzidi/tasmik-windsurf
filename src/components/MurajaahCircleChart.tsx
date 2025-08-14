"use client";
import React from 'react';
import type { Report } from "@/types/teacher";
import { getPageRangeFromJuz } from "@/lib/quranMapping";

interface MurajaahCircleChartProps {
  reports: Report[];
}

export function MurajaahCircleChart({ reports }: MurajaahCircleChartProps) {
  // Find current juz from latest Tasmi report
  const tasmiReports = reports.filter(r => r.type === "Tasmi" && r.juzuk);
  const juzValues = tasmiReports.map(r => r.juzuk).filter((juz): juz is number => juz !== null);
  const currentJuz = juzValues.length > 0 
    ? Math.max(...juzValues)
    : 1;

  // Calculate required page range (1 to end of previous juz)
  const previousJuz = Math.max(1, currentJuz - 1);
  const previousJuzRange = getPageRangeFromJuz(previousJuz);
  const requiredEndPage = previousJuzRange ? previousJuzRange.endPage : 20; // Fallback to end of Juz 1
  
  // Filter murajaah reports
  const murajaahReports = reports.filter(r => 
    ['Murajaah', 'Old Murajaah', 'New Murajaah'].includes(r.type)
  );

  // Create a set of all pages that have been reviewed
  const reviewedPages = new Set<number>();
  murajaahReports.forEach(report => {
    if (report.page_from && report.page_to) {
      const startPage = Math.min(report.page_from, report.page_to);
      const endPage = Math.max(report.page_from, report.page_to);
      for (let page = startPage; page <= endPage; page++) {
        reviewedPages.add(page);
      }
    }
  });

  // Check which pages in the required range (1 to requiredEndPage) have been reviewed
  const requiredPages = new Set<number>();
  for (let page = 1; page <= requiredEndPage; page++) {
    requiredPages.add(page);
  }

  // Count how many times each required page has been reviewed
  const pageReviewCounts = new Map<number, number>();
  for (let page = 1; page <= requiredEndPage; page++) {
    pageReviewCounts.set(page, 0);
  }

  murajaahReports.forEach(report => {
    if (report.page_from && report.page_to) {
      const startPage = Math.min(report.page_from, report.page_to);
      const endPage = Math.max(report.page_from, report.page_to);
      for (let page = startPage; page <= endPage; page++) {
        if (page <= requiredEndPage) {
          pageReviewCounts.set(page, (pageReviewCounts.get(page) || 0) + 1);
        }
      }
    }
  });

  // Calculate completion cycles
  const minReviewCount = Math.min(...Array.from(pageReviewCounts.values()));
  const completedCycles = minReviewCount;
  
  // Calculate current cycle progress
  const pagesCompletedInCurrentCycle = Array.from(pageReviewCounts.values())
    .filter(count => count > completedCycles).length;
  const currentCycleProgress = (pagesCompletedInCurrentCycle / requiredPages.size) * 100;
  
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
            stroke="#3b82f6"
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
            Current Cycle
          </div>
          {completedCycles > 0 && (
            <div className="text-xs text-blue-600 font-medium mt-1">
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
      <div className="mt-4 text-center space-y-2">
        <div className="text-sm text-gray-700">
          <span className="font-medium">Current Juz: {currentJuz}</span>
        </div>
        <div className="text-xs text-gray-500">
          Required range: Pages 1-{requiredEndPage} ({requiredPages.size} pages)
        </div>
        <div className="text-sm text-gray-600">
          {pagesCompletedInCurrentCycle}/{requiredPages.size} pages in progress
        </div>
        {completedCycles > 0 && (
          <div className="text-xs text-green-600 font-medium">
            ✓ {completedCycles} complete cycle{completedCycles > 1 ? 's' : ''}
          </div>
        )}
        {currentJuz <= 1 && (
          <div className="text-xs text-blue-500 italic">
            Complete Juz 2 to start murajaah tracking
          </div>
        )}
      </div>
    </div>
  );
}