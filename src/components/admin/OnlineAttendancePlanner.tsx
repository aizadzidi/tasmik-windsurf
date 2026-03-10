"use client";

import React from "react";
import { Check, ChevronDown, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type TeacherOption = {
  id: string;
  name: string;
  active_package_count: number;
  available_slot_count: number;
};

type PlannerPill = {
  package_slot_id: string;
  student_name: string;
  course_id: string;
  course_name: string;
  start_time: string;
  duration_minutes: number;
};

type PlannerDay = {
  day_of_week: number;
  label: string;
  occupied_pills: PlannerPill[];
  hidden_empty_count: number;
};

type PlannerPayload = {
  warning?: string;
  selected_teacher: TeacherOption | null;
  teachers: TeacherOption[];
  legend: Array<{ course_id: string; course_name: string; color_hex?: string | null }>;
  days: PlannerDay[];
  week_summary: {
    total_slots: number;
    occupied_slots: number;
  };
};

type Props = {
  payload: PlannerPayload;
  loading: boolean;
  error: string;
  selectedTeacherId: string;
  onTeacherChange: (teacherId: string) => void;
  onRefresh: () => Promise<void>;
};

type CourseTone = {
  pill: string;
  pillStyle?: React.CSSProperties;
  dot?: string;
  dotStyle?: React.CSSProperties;
};

const normalizeColorHex = (value: string | null | undefined) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const normalized = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toUpperCase() : null;
};

const hexToRgb = (value: string | null | undefined) => {
  const normalized = normalizeColorHex(value);
  if (!normalized) return null;
  const raw = normalized.slice(1);
  return {
    r: Number.parseInt(raw.slice(0, 2), 16),
    g: Number.parseInt(raw.slice(2, 4), 16),
    b: Number.parseInt(raw.slice(4, 6), 16),
  };
};

const getCourseTone = (courseName: string, colorHex?: string | null): CourseTone => {
  const rgb = hexToRgb(colorHex ?? null);
  if (rgb) {
    return {
      pill: "border",
      pillStyle: {
        borderColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.34)`,
        backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`,
        color: "#0f172a",
      },
      dotStyle: { backgroundColor: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` },
    };
  }

  if (/hafazan|tahfiz/i.test(courseName)) {
    return {
      pill: "border-emerald-200 bg-emerald-50 text-emerald-800",
      dot: "bg-emerald-400",
    };
  }

  return {
    pill: "border-sky-200 bg-sky-50 text-sky-800",
    dot: "bg-sky-400",
  };
};

const formatTimeWithMeridiem = (value: string) => {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour24 = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour24) || !Number.isFinite(minute)) return value;
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
};

const timeRangeLabel = (startTime: string, durationMinutes: number) => {
  const [hourRaw, minuteRaw] = startTime.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return formatTimeWithMeridiem(startTime);

  const startTotal = hour * 60 + minute;
  const endTotal = startTotal + Math.max(durationMinutes, 0);
  const endHour = Math.floor((endTotal / 60) % 24);
  const endMinute = endTotal % 60;
  const endClock = `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;

  return `${formatTimeWithMeridiem(startTime)} - ${formatTimeWithMeridiem(endClock)}`;
};

const secondNameLabel = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return parts[1];
  return parts[0] ?? "Student";
};

export default function OnlineAttendancePlanner({
  payload,
  loading,
  error,
  selectedTeacherId,
  onTeacherChange,
  onRefresh,
}: Props) {
  const [teacherPickerOpen, setTeacherPickerOpen] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const teacherName = payload.selected_teacher?.name ?? "No teacher selected";
  const legendByCourseId = React.useMemo(
    () => new Map(payload.legend.map((entry) => [entry.course_id, entry])),
    [payload.legend],
  );
  const visiblePlannerDays = React.useMemo(
    () => payload.days.filter((day) => day.occupied_pills.length > 0),
    [payload.days],
  );

  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Card className="rounded-[28px] border border-slate-200/70 bg-white/95 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Online Attendance Slots</h2>
            <p className="mt-1 text-sm text-slate-500">Pills-only schedule view by selected teacher.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Total Slot</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{payload.week_summary.total_slots}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-600">Filled</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-700">{payload.week_summary.occupied_slots}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Popover open={teacherPickerOpen} onOpenChange={setTeacherPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="min-w-[240px] justify-between rounded-2xl border-slate-200 px-4">
                  <span className="truncate text-left">
                    <span className="block text-sm font-medium text-slate-900">{teacherName}</span>
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[320px] p-0">
                <Command>
                  <div className="flex items-center border-b border-slate-100 px-3">
                    <Search className="h-4 w-4 text-slate-400" />
                    <CommandInput placeholder="Search teacher..." className="border-0" />
                  </div>
                  <CommandList>
                    <CommandEmpty>No teacher found.</CommandEmpty>
                    <CommandGroup heading="Teachers">
                      {payload.teachers.map((teacher) => (
                        <CommandItem
                          key={teacher.id}
                          value={teacher.name}
                          onSelect={() => {
                            onTeacherChange(teacher.id);
                            setTeacherPickerOpen(false);
                          }}
                          className="flex items-center justify-between"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-900">{teacher.name}</p>
                            <p className="text-xs text-slate-500">
                              {teacher.active_package_count} active package(s)
                            </p>
                          </div>
                          {teacher.id === selectedTeacherId ? <Check className="h-4 w-4 text-emerald-600" /> : null}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <Button
              variant="outline"
              className="rounded-2xl border-slate-200"
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              <RefreshCw className={cn("h-4 w-4", refreshing ? "animate-spin" : "")} />
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-500">
            {payload.legend.map((entry) => {
              const tone = getCourseTone(entry.course_name, entry.color_hex ?? null);
              return (
                <div key={entry.course_id} className="flex items-center gap-2">
                  <span className={cn("h-2.5 w-2.5 rounded-full", tone.dot)} style={tone.dotStyle} />
                  <span>{entry.course_name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {payload.warning ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {payload.warning}
        </div>
      ) : null}
      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {visiblePlannerDays.length === 0 ? (
          <Card className="p-4 text-sm text-slate-500">No scheduled slots.</Card>
        ) : null}
        {visiblePlannerDays.map((day) => (
          <section key={day.day_of_week} className="rounded-[24px] border border-slate-200/80 bg-slate-50/50 p-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">{day.label}</h3>
              <p className="mt-1 text-sm text-slate-500">{day.occupied_pills.length} scheduled</p>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              {day.occupied_pills.map((pill) => {
                const tone = getCourseTone(
                  pill.course_name,
                  legendByCourseId.get(pill.course_id)?.color_hex ?? null,
                );
                return (
                  <div
                    key={pill.package_slot_id}
                    className={cn(
                      "min-w-[168px] rounded-[22px] border px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5",
                      tone.pill,
                    )}
                    style={tone.pillStyle}
                    title={pill.student_name}
                  >
                    <div className="text-base font-semibold uppercase tracking-wide">
                      {secondNameLabel(pill.student_name)}
                    </div>
                    <div className="mt-1 text-sm font-medium opacity-90">
                      {timeRangeLabel(pill.start_time, pill.duration_minutes)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {loading ? <div className="mt-4 text-sm text-slate-500">Refreshing planner...</div> : null}
    </Card>
  );
}
