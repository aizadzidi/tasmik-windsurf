"use client";

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { StudentData } from './StudentTable';

interface MobileStudentCardProps {
  student: StudentData;
  onViewDetails: (student: StudentData) => void;
}

export default function MobileStudentCard({ student, onViewDetails }: MobileStudentCardProps) {
  const [expandedSubjects, setExpandedSubjects] = useState(false);
  const [expandedConduct, setExpandedConduct] = useState(false);

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'B':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'C':
        return 'bg-blue-50 text-blue-600 border-blue-200';
      default:
        return 'bg-blue-50 text-blue-500 border-blue-200';
    }
  };

  const getConductColor = (percent: number) => {
    if (percent >= 80) return 'bg-blue-600';
    if (percent >= 60) return 'bg-blue-400';
    return 'bg-blue-300';
  };

  const subjects = Object.entries(student.subjects);
  const conductPercentages = student.conductPercentages ?? {
    discipline: (student.conduct.discipline || 0) * 20,
    effort: (student.conduct.effort || 0) * 20,
    participation: (student.conduct.participation || 0) * 20,
    motivationalLevel: (student.conduct.motivationalLevel || 0) * 20,
    character: (student.conduct.character || 0) * 20,
    leadership: (student.conduct.leadership || 0) * 20,
  };
  const conductItems = [
    { label: 'Discipline', percent: conductPercentages.discipline },
    { label: 'Effort', percent: conductPercentages.effort },
    { label: 'Participation', percent: conductPercentages.participation },
    { label: 'Motivational Level', percent: conductPercentages.motivationalLevel },
    { label: 'Character', percent: conductPercentages.character },
    { label: 'Leadership', percent: conductPercentages.leadership },
  ];
  const conductAveragePercent = conductItems.length > 0
    ? conductItems.reduce((sum, item) => sum + item.percent, 0) / conductItems.length
    : 0;

  return (
    <div className="bg-white backdrop-blur-sm border border-gray-100 rounded-3xl p-6 shadow-sm transition-all duration-150 ease-out">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center text-white text-lg font-semibold">
            {student.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">{student.name}</h3>
            <p className="text-sm text-gray-500">{student.class} • ID: {student.id}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold text-gray-900">{student.overall.average}%</div>
          <div className="text-xs text-gray-500">Rank #{student.overall.rank}</div>
        </div>
      </div>

      {/* Status Banner */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-4 ${
        student.overall.needsAttention 
          ? 'bg-red-50 text-red-700 border border-red-200'
          : student.overall.average >= 80
          ? 'bg-green-50 text-green-700 border border-green-200'
          : 'bg-blue-50 text-blue-700 border border-blue-200'
      }`}>
        {student.overall.needsAttention ? (
          <>
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-semibold">Needs Attention</span>
          </>
        ) : student.overall.average >= 80 ? (
          <>
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm font-semibold">Performing Well</span>
          </>
        ) : (
          <>
            <TrendingDown className="w-4 h-4" />
            <span className="text-sm font-semibold">Average Performance</span>
          </>
        )}
      </div>

      {/* Subjects Section */}
      <div className="mb-4">
        <button
          onClick={() => setExpandedSubjects(!expandedSubjects)}
          className="flex items-center justify-between w-full p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">Subjects</span>
            <span className="text-sm text-gray-500">({subjects.length} subjects)</span>
          </div>
          {expandedSubjects ? (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          )}
        </button>

        <AnimatePresence>
          {expandedSubjects && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-3 space-y-2">
                {subjects.map(([subject, data]) => (
                  <div key={subject} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-100">
                    <div>
                      <div className="font-semibold text-gray-900">{subject}</div>
                      <div className="text-sm text-gray-500">
                        {data.trend.length > 0 && (
                          <span className="flex items-center gap-1">
                            {data.trend[data.trend.length - 1] > data.trend[0] ? (
                              <TrendingUp className="w-3 h-3 text-green-500" />
                            ) : (
                              <TrendingDown className="w-3 h-3 text-red-500" />
                            )}
                            Trending {data.trend[data.trend.length - 1] > data.trend[0] ? 'up' : 'down'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold text-gray-900">{data.score}%</span>
                      <span className={`px-2 py-1 rounded text-xs font-semibold border ${getGradeColor(data.grade)}`}>
                        {data.grade}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Conduct Section */}
      <div className="mb-6">
        <button
          onClick={() => setExpandedConduct(!expandedConduct)}
          className="flex items-center justify-between w-full p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">Conduct</span>
            <span className="text-sm text-gray-500">
              (Avg: {Math.round(conductAveragePercent)}% ≈ {(conductAveragePercent / 20).toFixed(1)}/5)
            </span>
          </div>
          {expandedConduct ? (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          )}
        </button>

        <AnimatePresence>
          {expandedConduct && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-3 space-y-3">
                {conductItems.map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-gray-700 min-w-[80px]">
                      {item.label}
                    </span>
                    <div className="flex-1 h-3 bg-gray-200 rounded-full relative overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${getConductColor(item.percent)}`}
                        style={{ width: `${Math.max(0, Math.min(100, item.percent))}%` }}
                      />
                      {/* Target indicator */}
                      <div 
                        className="absolute top-0 w-0.5 h-full bg-gray-600"
                        style={{ left: '80%' }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-900 min-w-[40px] text-right">
                      {Math.round(item.percent)}%
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Action Button */}
      <button
        onClick={() => onViewDetails(student)}
        className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
      >
        View Full Details
      </button>
    </div>
  );
}
