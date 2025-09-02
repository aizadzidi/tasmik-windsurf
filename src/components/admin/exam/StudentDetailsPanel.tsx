"use client";

import React from 'react';
import { X, TrendingUp, TrendingDown, Award, AlertCircle, MessageCircle, FileText } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { ResponsiveRadar } from '@nivo/radar';
import { motion, AnimatePresence } from 'framer-motion';
import { StudentData } from './StudentTable';

interface StudentDetailsPanelProps {
  student: StudentData | null;
  onClose: () => void;
  classAverages?: {
    [subject: string]: number;
  };
}

export default function StudentDetailsPanel({ 
  student, 
  onClose, 
  classAverages = {} 
}: StudentDetailsPanelProps) {
  if (!student) return null;

  // Generate mock historical data for charts
  const generateHistoricalData = (currentScore: number, trend: number[]) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    return months.map((month, index) => ({
      month,
      score: trend[index] || currentScore + (Math.random() - 0.5) * 10,
      classAvg: 70 + (Math.random() - 0.5) * 15,
    }));
  };

  const conductData = [
    { aspect: 'Discipline', score: student.conduct.discipline, target: 4 },
    { aspect: 'Effort', score: student.conduct.effort, target: 4 },
    { aspect: 'Participation', score: student.conduct.participation, target: 4 },
    { aspect: 'Motivational Level', score: student.conduct.motivationalLevel, target: 4 },
    { aspect: 'Character', score: student.conduct.character, target: 4 },
    { aspect: 'Leadership', score: student.conduct.leadership, target: 4 },
  ];

  // Transform data for radar chart - use direct percentage values
  const radarData = conductData
    .filter(item => item && item.aspect && !isNaN(item.score) && !isNaN(item.target))
    .map(item => ({
      aspect: item.aspect,
      score: Math.max(0, Math.min(100, item.score * 20)), // Convert 1-5 scale to percentage (5.0 = 100%), clamped 0-100
      target: Math.max(0, Math.min(100, item.target * 20)) // Convert 1-5 scale to percentage (4.0 = 80%), clamped 0-100
    }));

  const overallTrend = student.overall.average >= 75 ? 'positive' : 
                       student.overall.average >= 60 ? 'stable' : 'concerning';

  return (
    <AnimatePresence>
      {student && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
          onClick={onClose}
        >
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl overflow-y-auto"
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
                  <p className="text-gray-600">{student.class} • ID: {student.id}</p>
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
              <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
                <MessageCircle className="w-4 h-4" />
                Message Parent
              </button>
              <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm">
                <FileText className="w-4 h-4" />
                Generate Report
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-8">
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

            {/* Subject Performance Over Time */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Subject Performance Trends</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {Object.entries(student.subjects).map(([subject, data]) => {
                  const historicalData = generateHistoricalData(data.score, data.trend);
                  const classAvg = classAverages[subject] || 70;
                  
                  return (
                    <div key={subject} className="bg-gray-50 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-gray-900">{subject}</h4>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-lg">{data.score}%</span>
                          <span className={`text-xs px-2 py-1 rounded ${
                            data.grade === 'A' ? 'bg-blue-100 text-blue-800' :
                            data.grade === 'B' ? 'bg-blue-50 text-blue-700' :
                            data.grade === 'C' ? 'bg-blue-50 text-blue-600' :
                            'bg-blue-50 text-blue-500'
                          }`}>
                            {data.grade}
                          </span>
                        </div>
                      </div>
                      
                      <div className="h-32">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={historicalData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Line
                              type="monotone"
                              dataKey="score"
                              stroke="#3b82f6"
                              strokeWidth={2}
                              name="Student"
                            />
                            <Line
                              type="monotone"
                              dataKey="classAvg"
                              stroke="#9ca3af"
                              strokeWidth={1}
                              strokeDasharray="5 5"
                              name="Class Avg"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      
                      <div className="flex justify-between items-center mt-2 text-xs text-gray-600">
                        <span>vs Class Avg: {classAvg.toFixed(1)}%</span>
                        <span className={
                          data.score > classAvg ? 'text-green-600' : 
                          data.score === classAvg ? 'text-gray-600' : 'text-red-600'
                        }>
                          {data.score > classAvg ? '+' : ''}
                          {(data.score - classAvg).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
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
                      keys={['score', 'target']}
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
                      colors={['#3b82f6', '#9ca3af']}
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
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                    <span className="text-gray-600">Target Score</span>
                  </div>
                </div>
                
                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Strengths</h4>
                    <ul className="space-y-1 text-gray-600">
                      {conductData
                        .filter(item => item.score >= item.target)
                        .map(item => (
                          <li key={item.aspect} className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                            {item.aspect} ({item.score.toFixed(1)}/5.0)
                          </li>
                        ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Areas for Improvement</h4>
                    <ul className="space-y-1 text-gray-600">
                      {conductData
                        .filter(item => item.score < item.target)
                        .map(item => (
                          <li key={item.aspect} className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                            {item.aspect} ({item.score.toFixed(1)}/5.0)
                          </li>
                        ))}
                    </ul>
                  </div>
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
                      : '70.0'}%
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