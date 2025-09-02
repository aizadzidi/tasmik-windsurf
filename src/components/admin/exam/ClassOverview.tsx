"use client";

import React from 'react';
import { TrendingDown, TrendingUp, Minus, Users, Trophy, Target } from 'lucide-react';

interface ClassOverviewProps {
  selectedClassName: string;
  studentsCount: number;
  scoreDistribution: Array<{
    range: string;
    count: number;
    percentage: number;
  }>;
  subjectAverages: Array<{
    subject: string;
    average: number;
    trend: 'up' | 'down' | 'stable';
    change: number;
  }>;
  conductMedians: Array<{
    aspect: string;
    median: number;
    target: number;
  }>;
}

export default function ClassOverview({
  selectedClassName,
  studentsCount,
  scoreDistribution,
  subjectAverages,
  conductMedians
}: ClassOverviewProps) {
  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-3 h-3 text-green-500" />;
      case 'down':
        return <TrendingDown className="w-3 h-3 text-red-500" />;
      default:
        return <Minus className="w-3 h-3 text-gray-500" />;
    }
  };

  const getTrendColor = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return 'text-green-600';
      case 'down':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="bg-white backdrop-blur-sm border border-gray-100 rounded-3xl p-8 mb-8 shadow-sm transition-all duration-150 ease-out">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-xl font-semibold text-gray-900">
          {selectedClassName ? `${selectedClassName} Overview` : 'All Classes Overview'}
        </h3>
        <div className="flex items-center gap-2 text-gray-600">
          <Users className="w-4 h-4" />
          <span className="font-semibold">{studentsCount} students</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Class Performance */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-4 h-4 text-blue-500" />
            <h4 className="text-base font-semibold text-gray-900">Class Performance</h4>
          </div>
          
          {/* Average Score */}
          <div className="bg-blue-50 rounded-2xl p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">Average Score</span>
              <span className="text-2xl font-semibold text-blue-700">
                {(() => {
                  const classAverage = subjectAverages.length > 0 ? 
                    Math.round(subjectAverages.reduce((sum, s) => sum + s.average, 0) / subjectAverages.length) : 0;
                  return classAverage;
                })()}%
              </span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
                style={{ 
                  width: `${(() => {
                    const classAverage = subjectAverages.length > 0 ? 
                      Math.round(subjectAverages.reduce((sum, s) => sum + s.average, 0) / subjectAverages.length) : 0;
                    return Math.min(100, classAverage);
                  })()}%` 
                }}
              ></div>
            </div>
          </div>
          
          {/* Top Performers */}
          <div className="text-center">
            <div className="text-2xl font-semibold text-gray-900">
              {scoreDistribution.find(d => d.range === '90-100')?.count || 0}
            </div>
            <div className="text-sm text-gray-600">Students scoring 90%+</div>
          </div>
        </div>

        {/* Top Subject */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-blue-500" />
            <h4 className="text-base font-semibold text-gray-900">Best Subject</h4>
          </div>
          
          {(() => {
            const topSubject = subjectAverages.reduce((prev, current) => 
              (prev.average > current.average) ? prev : current, subjectAverages[0] || { subject: 'N/A', average: 0, trend: 'stable', change: 0 }
            );
            return (
              <div className="bg-blue-50 rounded-2xl p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600">{topSubject.subject}</span>
                  <div className="flex items-center gap-2">
                    {getTrendIcon(topSubject.trend)}
                    <span className="text-2xl font-semibold text-blue-700">
                      {topSubject.average.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${Math.min(100, topSubject.average)}%` }}
                  ></div>
                </div>
              </div>
            );
          })()}
          
          {/* Subject Count */}
          <div className="text-center">
            <div className="text-2xl font-semibold text-gray-900">
              {subjectAverages.length}
            </div>
            <div className="text-sm text-gray-600">Subjects tracked</div>
          </div>
        </div>

        {/* Conduct Summary */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-blue-500" />
            <h4 className="text-base font-semibold text-gray-900">Conduct Average</h4>
          </div>
          
          {(() => {
            const overallConduct = conductMedians.length > 0 ? 
              conductMedians.reduce((sum, c) => sum + c.median, 0) / conductMedians.length : 0;
            const conductPercentage = Math.round((overallConduct / 5) * 100);
            
            return (
              <div className="bg-blue-50 rounded-2xl p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600">Overall Rating</span>
                  <span className="text-2xl font-semibold text-blue-700">
                    {overallConduct.toFixed(1)}/5.0
                  </span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${conductPercentage}%` }}
                  ></div>
                </div>
              </div>
            );
          })()}
          
          {/* Students At Risk */}
          <div className="text-center">
            <div className="text-2xl font-semibold text-gray-900">
              {scoreDistribution.find(d => d.range === '0-59')?.count || 0}
            </div>
            <div className="text-sm text-gray-600">Students below 60%</div>
          </div>
        </div>
      </div>
    </div>
  );
}