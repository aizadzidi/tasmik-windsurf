"use client";

import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ClassAnalyticsDatum = {
  classId: string;
  className: string;
  percent: number;
  present: number;
  total: number;
  daysTracked: number;
  studentCount: number;
};

type Props = {
  data: ClassAnalyticsDatum[];
};

type CustomTooltipProps = { active?: boolean; payload?: Array<{ payload: ClassAnalyticsDatum }> };

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload as ClassAnalyticsDatum;
  return (
    <div className="rounded-xl border border-slate-100 bg-white/95 px-4 py-3 text-xs shadow-lg backdrop-blur-sm">
      <p className="text-sm font-semibold text-slate-900">{datum.className}</p>
      <p className="mt-1 text-slate-500">{datum.percent}% attendance</p>
      <p className="mt-1 text-slate-500">
        {datum.present} present across {datum.daysTracked} day{datum.daysTracked === 1 ? "" : "s"}
      </p>
    </div>
  );
};

export default function ClassAttendanceBarChart({ data }: Props) {
  const normalizedData = React.useMemo(
    () =>
      data.map((datum) => ({
        ...datum,
        percent: Number.isFinite(datum.percent) ? datum.percent : 0,
      })),
    [data],
  );

  return (
    <div className="h-[340px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={normalizedData}
          margin={{
            top: 16,
            right: 24,
            left: 8,
            bottom: 24,
          }}
          barSize={32}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="className"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            interval={0}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
          />
          <Tooltip cursor={{ fill: "rgba(15, 23, 42, 0.04)" }} content={<CustomTooltip />} />
          <Bar dataKey="percent" fill="#0f172a" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
