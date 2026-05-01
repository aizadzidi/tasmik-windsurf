"use client";

import React from "react";
import { Check, ChevronDown, RefreshCw, Search } from "lucide-react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import AdminScopeSwitch from "@/components/admin/AdminScopeSwitch";
import MonthlyAttendancePanel, {
  type OnlineAttendanceOccurrence,
} from "@/components/online/MonthlyAttendancePanel";
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
import { Modal } from "@/components/ui/Modal";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { authFetch } from "@/lib/authFetch";
import { cn } from "@/lib/utils";

type TeacherOption = {
  id: string;
  name: string;
  active_package_count: number;
  available_slot_count: number;
};

type MonthlyPayload = {
  warning?: string;
  month: string;
  selected_teacher: TeacherOption | null;
  teachers: TeacherOption[];
  summary: {
    total_attendance: number;
    total_sessions: number;
    marked_sessions: number;
    present_count: number;
    absent_count: number;
    attendance_rate_pct: number;
  };
  monthly_occurrences: OnlineAttendanceOccurrence[];
};

const currentMonthKey = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
};

const extractError = (payload: unknown, fallback: string) => {
  if (payload && typeof payload === "object" && "error" in payload) {
    const candidate = (payload as { error?: unknown }).error;
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate;
  }
  return fallback;
};

const timeLabel = (value: string) => value.slice(0, 5);

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
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return formatTimeWithMeridiem(timeLabel(startTime));

  const startTotal = hour * 60 + minute;
  const endTotal = startTotal + Math.max(durationMinutes, 0);
  const endHour = Math.floor((endTotal / 60) % 24);
  const endMinute = endTotal % 60;
  const endClock = `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;

  return `${formatTimeWithMeridiem(timeLabel(startTime))} - ${formatTimeWithMeridiem(endClock)}`;
};

const formatDateHeading = (dateStr: string) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

export default function AdminOnlineAttendancePage() {
  const [month, setMonth] = React.useState(currentMonthKey());
  const [selectedTeacherId, setSelectedTeacherId] = React.useState("");
  const [payload, setPayload] = React.useState<MonthlyPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [teacherPickerOpen, setTeacherPickerOpen] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [expandedStudentId, setExpandedStudentId] = React.useState<string | null>(null);
  const [selectedDayOccurrences, setSelectedDayOccurrences] = React.useState<OnlineAttendanceOccurrence[]>([]);

  const expandedStudentIds = React.useMemo(
    () => new Set(expandedStudentId ? [expandedStudentId] : []),
    [expandedStudentId],
  );

  const refreshData = React.useCallback(
    async (withLoading = true, nextTeacherId = selectedTeacherId) => {
      if (withLoading) setLoading(true);
      else setRefreshing(true);
      setError("");
      try {
        const query = new URLSearchParams({ month });
        if (nextTeacherId) query.set("teacher_id", nextTeacherId);
        const response = await authFetch(`/api/admin/online/attendance/monthly?${query.toString()}`);
        const nextPayload = (await response.json()) as MonthlyPayload & { error?: string };
        if (!response.ok) {
          throw new Error(extractError(nextPayload, "Failed to load monthly online attendance"));
        }
        setPayload(nextPayload);
        setExpandedStudentId(null);
        if (!nextTeacherId && nextPayload.selected_teacher?.id) {
          setSelectedTeacherId(nextPayload.selected_teacher.id);
        }
      } catch (refreshError) {
        setError(
          refreshError instanceof Error ? refreshError.message : "Failed to load monthly online attendance",
        );
      } finally {
        if (withLoading) setLoading(false);
        else setRefreshing(false);
      }
    },
    [month, selectedTeacherId],
  );

  React.useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const teacherName = payload?.selected_teacher?.name ?? "No teacher selected";
  const selectedDayHeading = selectedDayOccurrences[0]?.session_date
    ? formatDateHeading(selectedDayOccurrences[0].session_date)
    : undefined;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(186,230,253,0.45),_transparent_34%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)]">
      <AdminNavbar />
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <header className="mb-6 flex flex-wrap items-center justify-end gap-3">
          <AdminScopeSwitch />
        </header>

        <Card className="rounded-[28px] border border-slate-200/70 bg-white/95 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-6">
          <div className="flex flex-col gap-5 border-b border-slate-100 pb-5">
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Monthly Attendance</h2>
                <p className="mt-1 text-sm text-slate-500">Monitor student attendance by selected teacher.</p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-start">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-600">Total Attendance</p>
                  <p className="mt-1 text-2xl font-semibold text-emerald-700">
                    {payload?.summary.total_attendance ?? 0}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Total Sessions</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">
                    {payload?.summary.total_sessions ?? 0}
                  </p>
                </div>
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-rose-500">Absent</p>
                  <p className="mt-1 text-2xl font-semibold text-rose-700">
                    {payload?.summary.absent_count ?? 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Popover open={teacherPickerOpen} onOpenChange={setTeacherPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="min-w-[240px] justify-between rounded-2xl border-slate-200 px-4"
                    >
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
                          {(payload?.teachers ?? []).map((teacher) => (
                            <CommandItem
                              key={teacher.id}
                              value={teacher.name}
                              onSelect={() => {
                                setSelectedTeacherId(teacher.id);
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
                              {teacher.id === selectedTeacherId ? (
                                <Check className="h-4 w-4 text-emerald-600" />
                              ) : null}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                <input
                  type="month"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                  className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm shadow-sm transition focus:ring-2 focus:ring-slate-300"
                />

                <Button
                  variant="outline"
                  className="rounded-2xl border-slate-200"
                  onClick={() => void refreshData(false)}
                  disabled={refreshing}
                >
                  <RefreshCw className={cn("h-4 w-4", refreshing ? "animate-spin" : "")} />
                  {refreshing ? "Refreshing..." : "Refresh"}
                </Button>
              </div>
            </div>
          </div>

          {payload?.warning ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {payload.warning}
            </div>
          ) : null}
          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="mt-6">
            <MonthlyAttendancePanel
              month={month}
              occurrences={payload?.monthly_occurrences ?? []}
              loading={loading}
              expandedStudentIds={expandedStudentIds}
              onStudentToggle={(studentId) => setExpandedStudentId((current) => (current === studentId ? null : studentId))}
              onDayClick={(occurrences) => setSelectedDayOccurrences(occurrences)}
              studentCountMode="presentOnly"
              emptyTitle={payload?.selected_teacher ? "No sessions for this month." : "No teacher selected."}
              emptyDescription={
                payload?.selected_teacher
                  ? "Sessions will appear once packages are assigned and scheduled."
                  : "Choose an online teacher to view monthly attendance."
              }
            />
          </div>

          {loading ? <div className="mt-4 text-sm text-slate-500">Loading monthly attendance...</div> : null}
        </Card>
      </div>

      <Modal
        open={selectedDayOccurrences.length > 0}
        title={selectedDayOccurrences[0]?.student_name ?? "Session details"}
        description={selectedDayHeading}
        onClose={() => setSelectedDayOccurrences([])}
      >
        <div className="space-y-3">
          {selectedDayOccurrences.map((occurrence) => {
            const isMarked = occurrence.attendance_status !== null;
            return (
              <Card
                key={occurrence.id ?? `${occurrence.package_slot_id}:${occurrence.session_date}:${occurrence.start_time}`}
                className={cn("p-4 shadow-sm", isMarked && "bg-slate-50/60")}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{occurrence.course_name}</p>
                      {isMarked ? (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                            occurrence.attendance_status === "present"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-700",
                          )}
                        >
                          {occurrence.attendance_status}
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          unmarked
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs font-medium text-sky-700">
                      {timeRangeLabel(occurrence.start_time, occurrence.duration_minutes)}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
