"use client";

import { createContext, useContext } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Tooltip } from "recharts";
import { cn } from "@/lib/utils";

export type ChartConfig = Record<
  string,
  {
    label: string;
    color?: string;
  }
>;

type ChartContextValue = {
  config: ChartConfig;
};

const ChartContext = createContext<ChartContextValue | null>(null);

type ChartContainerProps = {
  config: ChartConfig;
  className?: string;
  children: ReactNode;
};

export function ChartContainer({ config, className, children }: ChartContainerProps) {
  const style = Object.entries(config).reduce<Record<string, string>>((acc, [key, value], index) => {
    const fallbackColor = `hsl(var(--chart-${index + 1}, 215 16% 47%))`;
    const color = value.color ?? fallbackColor;
    acc[`--color-${key}`] = color;
    acc[`--chart-${index + 1}`] = color;
    return acc;
  }, {});

  return (
    <ChartContext.Provider value={{ config }}>
      <div className={cn("w-full", className)} style={style as CSSProperties}>
        {children}
      </div>
    </ChartContext.Provider>
  );
}

function useChartConfig() {
  const context = useContext(ChartContext);
  if (!context) {
    throw new Error("Chart components must be used inside <ChartContainer />");
  }
  return context.config;
}

export const ChartTooltip = Tooltip;

type ChartTooltipContentProps = {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; color?: string; value?: number }>;
  label?: string | number;
  hideLabel?: boolean;
};

export function ChartTooltipContent({
  active,
  payload,
  label,
  hideLabel,
}: ChartTooltipContentProps) {
  const config = useChartConfig();

  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
      {!hideLabel && <p className="text-xs text-slate-500">{label}</p>}
      <div className="mt-1 space-y-1">
        {payload.map((item) => {
          const key = item.dataKey?.toString() ?? "";
          const entry = config[key];
          const color = entry?.color ?? item.color;
          return (
            <div key={key} className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="font-medium text-slate-900">{entry?.label ?? key}</span>
              <span className="text-slate-600">RM {Number(item.value ?? 0).toFixed(2)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
