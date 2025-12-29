"use client";
import { ResponsivePie } from "@nivo/pie";
import { StudentProgressData } from "@/lib/reportUtils";

interface ClassDistributionChartProps {
  students: StudentProgressData[] | Array<{ class_name?: string; class_id?: string | null }>;
  classes?: Array<{ id: string; name: string }>;
  onSelectClass?: (classId: string) => void;
}

export default function ClassDistributionChart({ students, classes, onSelectClass }: ClassDistributionChartProps) {
  const classStats = students.reduce((acc, student) => {
    if ("class_name" in student) {
      const className = student.class_name || "Unassigned";
      if (!acc[className]) {
        acc[className] = { id: className, label: className, classId: className === "Unassigned" ? "unassigned" : className, value: 0 };
      }
      acc[className].value += 1;
      return acc;
    }

    const classId = student.class_id || "unassigned";
    const className = classId === "unassigned"
      ? "Unassigned"
      : classes?.find(c => c.id === classId)?.name || "Unknown Class";

    if (!acc[classId]) {
      acc[classId] = { id: className, label: className, classId, value: 0 };
    }
    acc[classId].value += 1;
    return acc;
  }, {} as Record<string, { id: string; label: string; classId: string; value: number }>);

  const data = Object.values(classStats);

  return (
    <div style={{ height: 300 }}>
      <ResponsivePie
        data={data}
        margin={{ top: 20, right: 80, bottom: 80, left: 80 }}
        innerRadius={0.5}
        padAngle={0.7}
        cornerRadius={3}
        activeOuterRadiusOffset={8}
        borderWidth={1}
        borderColor={{ from: "color", modifiers: [["darker", 0.2]] }}
        arcLinkLabelsSkipAngle={10}
        arcLinkLabelsTextColor="#333333"
        arcLinkLabelsThickness={2}
        arcLinkLabelsColor={{ from: "color" }}
        arcLabelsSkipAngle={10}
        arcLabelsTextColor={{ from: "color", modifiers: [["darker", 2]] }}
        colors={{ scheme: "category10" }}
        legends={[
          {
            anchor: "bottom",
            direction: "row",
            justify: false,
            translateX: 0,
            translateY: 56,
            itemsSpacing: 0,
            itemWidth: 100,
            itemHeight: 18,
            itemTextColor: "#999",
            itemDirection: "left-to-right",
            itemOpacity: 1,
            symbolSize: 18,
            symbolShape: "circle",
            effects: [
              {
                on: "hover",
                style: {
                  itemTextColor: "#000",
                },
              },
            ],
          },
        ]}
        animate={true}
        isInteractive={true}
        onClick={(datum) => onSelectClass?.(String(datum.data?.classId || datum.id))}
      />
    </div>
  );
}
