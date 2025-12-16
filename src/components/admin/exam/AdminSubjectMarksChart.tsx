"use client";

import React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type SubjectMarkPoint = { name: string; mark: number };

interface AdminSubjectMarksChartProps {
  data: SubjectMarkPoint[];
  height?: number;
}

export default function AdminSubjectMarksChart({ data, height = 260 }: AdminSubjectMarksChartProps) {
  const sanitized = React.useMemo(
    () =>
      (data || []).map((d) => ({
        name: d?.name || "",
        mark: Number.isFinite(d?.mark) ? Number(d.mark) : 0,
      })),
    [data],
  );

  if (!sanitized.length) {
    return (
      <div className="text-sm text-slate-500">
        No marks available to plot.
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={sanitized}
          margin={{ top: 12, right: 24, left: 12, bottom: 24 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            angle={-30}
            textAnchor="end"
            height={50}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 12, fill: "#94a3b8" }}
            tickFormatter={(v) => `${v}%`}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value: number) => `${value.toFixed(1)}%`}
            cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }}
          />
          <Line
            type="monotone"
            dataKey="mark"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 3, fill: "#1d4ed8" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
