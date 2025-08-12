"use client";
import { ResponsiveBar } from "@nivo/bar";
import { StudentProgressData } from "@/lib/reportUtils";

interface JuzTestProgressChartProps {
  students: StudentProgressData[];
}

export default function JuzTestProgressChart({ students }: JuzTestProgressChartProps) {
  const juzProgress = Array.from({ length: 30 }, (_, i) => {
    const juzNumber = i + 1;
    const memorized = students.filter(s => {
      const extendedStudent = s as StudentProgressData & { highest_memorized_juz?: number };
      return (extendedStudent.highest_memorized_juz || 0) >= juzNumber;
    }).length;
    
    const tested = students.filter(s => {
      const extendedStudent = s as StudentProgressData & { highest_passed_juz?: number };
      return (extendedStudent.highest_passed_juz || 0) >= juzNumber;
    }).length;

    return {
      juz: `Juz ${juzNumber}`,
      memorized,
      tested,
      gap: memorized - tested,
    };
  });

  return (
    <div style={{ height: 400 }}>
      <ResponsiveBar
        data={juzProgress}
        keys={["memorized", "tested"]}
        indexBy="juz"
        margin={{ top: 20, right: 130, bottom: 80, left: 60 }}
        padding={0.3}
        colors={["#3b82f6", "#10b981"]}
        borderColor={{ from: "color", modifiers: [["darker", 1.6]] }}
        axisTop={null}
        axisRight={null}
        axisBottom={{
          tickRotation: -45,
          legend: "Juz Number",
          legendPosition: "middle",
          legendOffset: 60,
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