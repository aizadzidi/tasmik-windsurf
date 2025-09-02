"use client";

import React, { useMemo } from 'react';
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

export interface StudentData {
  id: string;
  name: string;
  avatar?: string;
  class: string;
  subjects: {
    [subject: string]: {
      score: number;
      trend: number[];
      grade: string;
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
}

const columnHelper = createColumnHelper<StudentData>();


export default function StudentTable({ data, onRowClick, loading, selectedSubject }: StudentTableProps) {

  const columns = useMemo(() => [
    columnHelper.accessor('name', {
      id: 'student',
      header: 'Student',
      size: 400,
      cell: ({ row }) => (
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0">
            {row.original.avatar ? (
              <img 
                src={row.original.avatar} 
                alt={row.original.name}
                className="w-9 h-9 rounded-full ring-2 ring-white shadow-sm"
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
    columnHelper.accessor('overall.average', {
      header: selectedSubject ? `${selectedSubject} Mark` : 'Final Mark',
      size: 200,
      cell: ({ row }) => {
        // If subject is selected, show subject score, otherwise show overall average
        const score = selectedSubject && row.original.subjects[selectedSubject] 
          ? row.original.subjects[selectedSubject].score 
          : row.original.overall.average;
          
        const getScoreColor = (score: number) => {
          if (score >= 90) return 'text-green-700';
          if (score >= 80) return 'text-blue-700';
          if (score >= 70) return 'text-yellow-600';
          return 'text-red-600';
        };
        
        return (
          <div className="text-center">
            <div className={`text-base font-semibold ${getScoreColor(score)}`}>
              {score}%
            </div>
          </div>
        );
      },
    }),
  ], [selectedSubject]);

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
                whileHover={{ backgroundColor: "rgb(248 250 252)" }}
                className={`cursor-pointer border-b border-gray-100 transition-all duration-200 ease-out hover:shadow-sm ${
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