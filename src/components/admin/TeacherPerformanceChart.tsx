"use client";
import { ResponsiveBar } from "@nivo/bar";
import { StudentProgressData } from "@/lib/reportUtils";

interface TeacherPerformanceChartProps {
  students: StudentProgressData[];
}

export default function TeacherPerformanceChart({ students }: TeacherPerformanceChartProps) {
  interface TeacherStats {
    teacher: string;
    total: number;
    active: number;
    inactive7: number;
    inactive14: number;
    [key: string]: string | number;
  }

  const teacherStats = students.reduce((acc, student) => {
    const teacher = student.teacher_name || "Unassigned";
    if (!acc[teacher]) {
      acc[teacher] = {
        teacher,
        total: 0,
        active: 0,
        inactive7: 0,
        inactive14: 0,
      };
    }
    acc[teacher].total++;
    
    if (student.days_since_last_read <= 7) {
      acc[teacher].active++;
    } else if (student.days_since_last_read <= 14) {
      acc[teacher].inactive7++;
    } else {
      acc[teacher].inactive14++;
    }
    
    return acc;
  }, {} as Record<string, TeacherStats>);

  const data = Object.values(teacherStats);

  return (
    <div style={{ height: 300 }}>
      <ResponsiveBar
        data={data}
        keys={["active", "inactive7", "inactive14"]}
        indexBy="teacher"
        margin={{ top: 20, right: 130, bottom: 50, left: 60 }}
        padding={0.3}
        colors={["#4ade80", "#fbbf24", "#ef4444"]}
        borderColor={{ from: "color", modifiers: [["darker", 1.6]] }}
        axisTop={null}
        axisRight={null}
        axisBottom={{
          tickRotation: -45,
          legend: "Teachers",
          legendPosition: "middle",
          legendOffset: 40,
        }}
        axisLeft={{
          legend: "Number of Students",
          legendPosition: "middle",
          legendOffset: -50,
        }}
        labelSkipWidth={12}
        labelSkipHeight={12}
        labelTextColor={{ from: "color", modifiers: [["darker", 1.6]] }}
        legends={[
          {
            dataFrom: "keys",
            anchor: "bottom-right",
            direction: "column",
            justify: false,
            translateX: 120,
            translateY: 0,
            itemsSpacing: 2,
            itemWidth: 100,
            itemHeight: 20,
            itemDirection: "left-to-right",
            itemOpacity: 0.85,
            symbolSize: 20,
            effects: [
              {
                on: "hover",
                style: {
                  itemOpacity: 1,
                },
              },
            ],
          },
        ]}
        animate={true}
        isInteractive={true}
      />
    </div>
  );
}