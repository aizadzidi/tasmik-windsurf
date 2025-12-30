"use client";

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper
} from '@tanstack/react-table';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { GradeSummaryRow, rpcGetGradeSummaryPerClass } from '@/data/exams';
import { compareGrade, gradeChipTitle, GRADE_COLOR } from '@/core/grades';

const GRADE_TONE_CLASS: Record<string, string> = {
  emerald: 'text-emerald-700',
  sky: 'text-sky-700',
  amber: 'text-amber-700',
  orange: 'text-orange-700',
  rose: 'text-rose-700',
  zinc: 'text-zinc-600',
};

export interface StudentData {
  id: string;
  name: string;
  avatar?: string;
  class: string;
  classId?: string;
  subjects: {
    [subject: string]: {
      score: number;
      trend: number[];
      grade: string;
      exams?: { name: string; score: number }[]; // optional exam history for charts
      optedOut?: boolean;
    };
  };
  conduct: {
    discipline: number;
    effort: number;
    participation: number;
    motivationalLevel: number;
    character: number;
    leadership: number;
  };
  conductPercentages?: {
    discipline: number;
    effort: number;
    participation: number;
    motivationalLevel: number;
    character: number;
    leadership: number;
  };
  overall: {
    average: number;
    rank: number;
    needsAttention: boolean;
    attentionReason?: string;
  };
}

interface StudentTableProps {
  data: StudentData[];
  onRowClick: (student: StudentData) => void;
  loading?: boolean;
  selectedSubject?: string;
  examId?: string;
  classId?: string;
}

const columnHelper = createColumnHelper<StudentData>();

export default function StudentTable({ data, onRowClick, loading, selectedSubject, examId, classId }: StudentTableProps) {
  const [gradeCache, setGradeCache] = useState<Record<string, Map<string, GradeSummaryRow[]>>>({});
  const [gradeLoading, setGradeLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!examId || !classId) {
      setGradeCache({});
      setGradeLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const key = `${examId}:${classId}`;

    setGradeLoading(true);

    (async () => {
      try {
        const rows = await rpcGetGradeSummaryPerClass(supabase, examId, classId);
        const byStudent = new Map<string, GradeSummaryRow[]>();

        for (const r of rows) {
          if (!byStudent.has(r.student_id)) {
            byStudent.set(r.student_id, []);
          }
          byStudent.get(r.student_id)!.push(r);
        }

        if (!cancelled) {
          setGradeCache((prev) => ({
            ...prev,
            [key]: byStudent,
          }));
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          setGradeCache((prev) => ({
            ...prev,
            [key]: new Map<string, GradeSummaryRow[]>(),
          }));
        }
      } finally {
        if (!cancelled) {
          setGradeLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [examId, classId]);

  const gradeMap = useMemo(() => {
    if (!examId || !classId) return new Map<string, GradeSummaryRow[]>();
    const key = `${examId}:${classId}`;
    return gradeCache[key] ?? new Map<string, GradeSummaryRow[]>();
  }, [gradeCache, examId, classId]);

  const columns = useMemo(() => [
    columnHelper.accessor('name', {
      id: 'student',
      header: 'Student',
      size: 400,
      cell: ({ row }) => (
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0">
            {row.original.avatar ? (
              <Image
                src={row.original.avatar}
                alt={row.original.name}
                width={36}
                height={36}
                className="w-9 h-9 rounded-full ring-2 ring-white shadow-sm object-cover"
              />
            ) : (
              <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white text-sm font-semibold shadow-sm">
                {row.original.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-gray-900 truncate">
              {row.original.name}
            </div>
            <div className="text-sm text-gray-500 truncate">
              {row.original.class}
            </div>
          </div>
        </div>
      ),
    }),
    // Grade column (summary of subject grades)
    columnHelper.accessor(row => row, {
      id: 'summary',
      header: 'Grade',
      size: 260,
      cell: ({ row }) => {
        const rows = gradeMap.get(row.original.id) ?? [];

        if (rows.length === 0) {
          return (
            <span className={gradeLoading ? "text-muted-foreground animate-pulse" : "text-muted-foreground"}>
              —
            </span>
          );
        }

        const sortedRows = rows
          .slice()
          .sort((a, b) => (a.grade_rank ?? 999) - (b.grade_rank ?? 999) || compareGrade(a.grade, b.grade));

        const absent = sortedRows[0]?.absent_cnt ?? 0;
        const totalPresent = sortedRows[0]?.total_present;

        return (
          <div className="flex flex-wrap gap-1">
            {sortedRows.map((r) => {
              const tone = GRADE_COLOR[r.grade];
              const colorClass = tone ? GRADE_TONE_CLASS[tone] : undefined;
              const baseChipClass = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-muted';
              const chipClass = colorClass ? `${baseChipClass} ${colorClass}` : baseChipClass;

              return (
                <span
                  key={`${r.grade}-${r.grade_rank}`}
                  title={gradeChipTitle(r.grade, r.cnt, totalPresent)}
                  className={chipClass}
                >
                  {r.grade}: {r.cnt}
                </span>
              );
            })}
            {absent > 0 && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-muted/60">
                Abs: {absent}
              </span>
            )}
          </div>
        );
      }
    }),
    columnHelper.accessor((row) => {
      // Return the appropriate score for sorting
      return selectedSubject && row.subjects[selectedSubject] 
        ? row.subjects[selectedSubject].score 
        : row.overall.average;
    }, {
      id: 'marks',
      header: selectedSubject ? `${selectedSubject} Mark` : 'Final Mark',
      size: 200,
      cell: ({ row }) => {
        // If subject is selected, show subject score, otherwise show overall average
        const subjectData = selectedSubject && row.original.subjects[selectedSubject]
          ? row.original.subjects[selectedSubject]
          : undefined;
        const score = subjectData 
          ? subjectData.score 
          : row.original.overall.average;
        const grade = subjectData?.grade;
          
        const getScoreColor = (score: number) => {
          if (score >= 90) return 'text-green-700';
          if (score >= 80) return 'text-blue-700';
          if (score >= 70) return 'text-yellow-600';
          return 'text-red-600';
        };
        
        return (
          <div className="text-center">
            {grade === 'TH' ? (
              <div className="flex items-center justify-center gap-2">
                <span className="text-base font-semibold text-gray-600">TH</span>
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-gray-100 text-gray-700 border border-gray-200">Absent</span>
              </div>
            ) : (
              <div className={`text-base font-semibold ${getScoreColor(score)}`}>
                {score}%
              </div>
            )}
          </div>
        );
      },
    }),
  ], [selectedSubject, gradeMap, gradeLoading]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (loading) {
    return (
      <div className="bg-white/90 backdrop-blur-sm border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="animate-pulse">
          {/* Table Header Skeleton */}
          <div className="bg-gray-50/80 px-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="h-4 bg-white/60 rounded w-20"></div>
              <div className="h-4 bg-white/60 rounded w-24"></div>
            </div>
          </div>
          
          {/* Table Rows Skeleton */}
          <div className="divide-y divide-gray-100">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="px-6 py-4">
                <div className="grid grid-cols-2 gap-4 items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-200 rounded-full"></div>
                    <div className="space-y-1">
                      <div className="h-3 bg-gray-200 rounded w-24"></div>
                      <div className="h-2 bg-gray-100 rounded w-16"></div>
                    </div>
                  </div>
                  <div className="text-center space-y-1">
                    <div className="h-6 bg-gray-200 rounded w-16 mx-auto"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="bg-white/90 backdrop-blur-sm border border-gray-100 rounded-2xl overflow-hidden shadow-sm"
    >

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50/80 backdrop-blur-sm sticky top-0 z-1">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-6 py-4 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200"
                    style={{ width: header.getSize() }}
                    colSpan={header.colSpan}
                  >
                    {header.isPlaceholder ? null : (
                      <div
                        className={
                          header.column.getCanSort()
                            ? 'cursor-pointer select-none flex items-center justify-center gap-2 hover:text-blue-600'
                            : 'flex items-center justify-center gap-2'
                        }
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <span className="ml-2 flex flex-col">
                            <ChevronUp 
                              className={`w-3 h-3 ${
                                header.column.getIsSorted() === 'asc' 
                                  ? 'text-blue-600' 
                                  : 'text-gray-300'
                              }`} 
                            />
                            <ChevronDown 
                              className={`w-3 h-3 -mt-1 ${
                                header.column.getIsSorted() === 'desc' 
                                  ? 'text-blue-600' 
                                  : 'text-gray-300'
                              }`} 
                            />
                          </span>
                        )}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, index) => (
              <motion.tr
                key={row.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                onClick={() => onRowClick(row.original)}
                className={`cursor-pointer border-b border-gray-100 transition-all duration-200 ease-out hover:bg-slate-50 hover:shadow-sm ${
                  index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                }`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="px-6 py-4 text-sm text-gray-900"
                    style={{ width: cell.column.getSize() }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.length === 0 && (
        <div className="p-12 text-center text-gray-500">
          <div className="text-5xl mb-4">📊</div>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">No Students Found</h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            No student performance data matches the current filters. Try adjusting your search criteria.
          </p>
        </div>
      )}
    </motion.div>
  );
}
