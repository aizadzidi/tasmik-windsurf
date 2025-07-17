"use client";
import { ResponsiveRadar } from "@nivo/radar";

interface ConductData {
  [category: string]: number;
}

export default function ExamRadarChart({ data }: { data: ConductData }) {
  const radarData = Object.keys(data).map((key) => ({
    category: key,
    score: data[key],
  }));

  return (
    <div style={{ height: 260 }}>
      <ResponsiveRadar
        data={radarData}
        keys={["score"]}
        indexBy="category"
        maxValue={100}
        margin={{ top: 30, right: 40, bottom: 30, left: 40 }}
        curve="linearClosed"
        borderWidth={2}
        borderColor={{ from: "color" }}
        gridLevels={5}
        gridShape="circular"
        enableDots={true}
        dotSize={8}
        dotColor={{ theme: "background" }}
        dotBorderWidth={2}
        dotBorderColor={{ from: "color" }}
        colors={{ scheme: "category10" }}
        fillOpacity={0.25}
        blendMode="multiply"
        animate={true}
        isInteractive={true}
        legends={[]}
      />
    </div>
  );
}
