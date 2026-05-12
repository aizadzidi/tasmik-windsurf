"use client";

import React from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

const dateKeyPattern = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dateFromKey = (value: string) => {
  if (!dateKeyPattern.test(value)) return new Date();
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const formatDateLabel = (value: string) => {
  const date = dateFromKey(value);
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export default function DateDropdown({ value, onChange, className }: Props) {
  const [open, setOpen] = React.useState(false);
  const selectedDate = React.useMemo(() => dateFromKey(value), [value]);

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    onChange(toDateKey(date));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 min-w-[188px] items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate">{formatDateLabel(value)}</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto rounded-2xl border-slate-200 p-0 shadow-xl">
        <Calendar
          mode="single"
          selected={selectedDate}
          defaultMonth={selectedDate}
          onSelect={handleSelect}
          captionLayout="dropdown"
          className="rounded-2xl"
        />
      </PopoverContent>
    </Popover>
  );
}
