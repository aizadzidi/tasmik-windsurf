"use client";
import { ResponsiveLine } from "@nivo/line";

interface Student {
  name: string;
  mark: number;
}

export default function ExamLineChart({ students }: { students: Student[] }) {
  const data = [
    {
      id: "Mark",
      color: "hsl(210, 70%, 50%)",
      data: students.map((s, i) => ({ x: s.name, y: s.mark })),
    },
  ];

  return (
    <div style={{ height: 260 }}>
      <ResponsiveLine
        data={data}
        margin={{ top: 20, right: 20, bottom: 60, left: 40 }}
        xScale={{ type: "point" }}
        yScale={{ type: "linear", min: 0, max: 100, stacked: false }}
        axisBottom={{
          tickRotation: -30,
          legend: "Student",
          legendOffset: 40,
          legendPosition: "middle",
        }}
        axisLeft={{
          legend: "Mark (%)",
          legendOffset: -32,
          legendPosition: "middle",
        }}
        colors={{ scheme: "category10" }}
        pointSize={8}
        pointColor={{ theme: "background" }}
        pointBorderWidth={2}
        pointBorderColor={{ from: "serieColor" }}
        enableArea={true}
        useMesh={true}
        isInteractive={true}
        animate={true}
      />
    </div>
  );
}
