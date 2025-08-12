"use client";
import { ResponsivePie } from "@nivo/pie";
import { StudentProgressData } from "@/lib/reportUtils";

interface ClassDistributionChartProps {
  students: StudentProgressData[] | Array<{ class_name?: string; class_id?: string | null }>;
  classes?: Array<{ id: string; name: string }>;
}

export default function ClassDistributionChart({ students, classes }: ClassDistributionChartProps) {
  const classStats = students.reduce((acc, student) => {
    let className: string;
    
    // Handle both types of student objects
    if ('class_name' in student) {
      // StudentProgressData format
      className = student.class_name || "Unassigned";
    } else {
      // Admin page Student format - need to map class_id to class name
      if (student.class_id && classes) {
        const classObj = classes.find(c => c.id === student.class_id);
        className = classObj?.name || "Unknown Class";
      } else {
        className = "Unassigned";
      }
    }
    
    if (!acc[className]) {
      acc[className] = 0;
    }
    acc[className]++;
    return acc;
  }, {} as Record<string, number>);

  const data = Object.entries(classStats).map(([className, count]) => ({
    id: className,
    label: className,
    value: count,
  }));

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
      />
    </div>
  );
}