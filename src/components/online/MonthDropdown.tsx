"use client";

import React from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

const MONTHS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1).padStart(2, "0"),
  label: new Date(Date.UTC(2026, index, 1)).toLocaleDateString("en-GB", {
    month: "short",
    timeZone: "UTC",
  }),
}));

const currentYear = () => new Date().getUTCFullYear();

const parseMonthKey = (value: string) => {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) {
    const now = new Date();
    return {
      year: now.getUTCFullYear(),
      month: String(now.getUTCMonth() + 1).padStart(2, "0"),
    };
  }

  return {
    year: Number(match[1]),
    month: match[2],
  };
};

const formatMonthLabel = (value: string) => {
  const { year, month } = parseMonthKey(value);
  const date = new Date(Date.UTC(year, Number(month) - 1, 1));
  return date.toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

const yearOptions = (selectedYear: number) => {
  const baseYear = currentYear();
  const years = new Set<number>();
  for (let year = baseYear - 5; year <= baseYear + 2; year += 1) {
    years.add(year);
  }
  years.add(selectedYear);
  return Array.from(years).sort((a, b) => b - a);
};

export default function MonthDropdown({ value, onChange, className }: Props) {
  const [open, setOpen] = React.useState(false);
  const parsed = parseMonthKey(value);
  const years = React.useMemo(() => yearOptions(parsed.year), [parsed.year]);

  const updateMonth = (month: string) => {
    onChange(`${parsed.year}-${month}`);
    setOpen(false);
  };

  const updateYear = (year: string) => {
    onChange(`${year}-${parsed.month}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 min-w-[152px] items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate">{formatMonthLabel(value)}</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 rounded-2xl border-slate-200 p-3 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Select month</p>
          <select
            value={String(parsed.year)}
            onChange={(event) => updateYear(event.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:ring-2 focus:ring-slate-300"
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {MONTHS.map((month) => {
            const selected = month.value === parsed.month;

            return (
              <button
                key={month.value}
                type="button"
                onClick={() => updateMonth(month.value)}
                className={cn(
                  "h-10 rounded-xl border text-sm font-semibold transition",
                  selected
                    ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                )}
              >
                {month.label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
