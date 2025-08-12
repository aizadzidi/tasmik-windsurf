"use client";
import { ResponsiveLine } from "@nivo/line";
import { StudentProgressData } from "@/lib/reportUtils";

interface ActivityTrendChartProps {
  students: StudentProgressData[];
}

export default function ActivityTrendChart({ students }: ActivityTrendChartProps) {
  const activityData = [
    {
      id: "Active Students",
      color: "hsl(120, 70%, 50%)",
      data: [
        { x: "Today", y: students.filter(s => s.days_since_last_read <= 1).length },
        { x: "1-3 Days", y: students.filter(s => s.days_since_last_read > 1 && s.days_since_last_read <= 3).length },
        { x: "4-7 Days", y: students.filter(s => s.days_since_last_read > 3 && s.days_since_last_read <= 7).length },
        { x: "8-14 Days", y: students.filter(s => s.days_since_last_read > 7 && s.days_since_last_read <= 14).length },
        { x: "15+ Days", y: students.filter(s => s.days_since_last_read > 14).length },
      ],
    },
  ];

  return (
    <div style={{ height: 300 }}>
      <ResponsiveLine
        data={activityData}
        margin={{ top: 20, right: 30, bottom: 50, left: 50 }}
        xScale={{ type: "point" }}
        yScale={{ type: "linear", min: 0, max: "auto", stacked: false }}
        axisBottom={{
          tickRotation: -45,
          legend: "Activity Period",
          legendOffset: 40,
          legendPosition: "middle",
        }}
        axisLeft={{
          legend: "Number of Students",
          legendOffset: -40,
          legendPosition: "middle",
        }}
        colors={{ scheme: "category10" }}
        pointSize={8}
        pointColor={{ theme: "background" }}
        pointBorderWidth={2}
        pointBorderColor={{ from: "serieColor" }}
        enableArea={true}
        areaOpacity={0.3}
        useMesh={true}
        isInteractive={true}
        animate={true}
      />
    </div>
  );
}