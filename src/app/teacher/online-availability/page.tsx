"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTeachingModeContext } from "@/contexts/TeachingModeContext";
import { authFetch } from "@/lib/authFetch";
import { timeToMinutes, type AvailabilityDayRange } from "@/lib/online/availabilityRanges";
import { cn } from "@/lib/utils";

type OnlineSlotTemplateOption = {
  id: string;
  course_id: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  timezone: string;
  is_active: boolean;
};

type TeacherAvailabilityRow = {
  slot_template_id: string;
  teacher_id: string;
  is_available: boolean;
  last_assigned_at: string | null;
  availability_source?: "manual" | "auto_schedule" | null;
};

type OccupiedSlotRow = {
  slot_template_id: string;
  package_count: number;
};

type AvailabilitySlotGroup = {
  id: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  timezone: string;
  slot_template_ids: string[];
  is_available: boolean;
  availability_source: "manual" | "auto_schedule" | null;
  occupied_count: number;
  configured_count: number;
};

type AvailabilityPayload = {
  templates?: OnlineSlotTemplateOption[];
  day_ranges?: AvailabilityDayRange[];
  slot_groups?: AvailabilitySlotGroup[];
  availability?: TeacherAvailabilityRow[];
  occupied_slots?: OccupiedSlotRow[];
  error?: string;
};

type ActiveTimeEditor = {
  groupId: string;
  startTime: string;
  sourceDay: number;
};

type InvalidTimeIssue = {
  startTime: string;
  label: string;
  selectedDays: number;
  requiredDays: number;
  missingDays: number;
};

const DAY_OPTIONS = [
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
  { value: 0, short: "Sun", label: "Sunday" },
];

const MIN_FREE_DAYS_PER_AVAILABLE_TIME = 2;

const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  count === 1 ? singular : plural;

const formatTime = (value: string) => {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour24 = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour24) || !Number.isFinite(minute)) return value.slice(0, 5);

  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
};

const formatInvalidTimeIssue = (issue: InvalidTimeIssue) =>
  `${issue.label} has ${issue.selectedDays} of ${issue.requiredDays} required days selected. ` +
  `Add ${issue.missingDays} more ${pluralize(issue.missingDays, "day")} or turn off ${issue.label}.`;

const formatAvailabilityIssueMessage = (issues: InvalidTimeIssue[]) => {
  if (issues.length === 0) return "";
  if (issues.length === 1) return formatInvalidTimeIssue(issues[0]);

  const issueList = issues
    .map((issue) => `${issue.label} (${issue.selectedDays}/${issue.requiredDays})`)
    .join(", ");
  return `${issues.length} time slots need more available days before saving: ${issueList}. ` +
    "Add days or turn those times off.";
};

const availabilityMapFromRows = (
  rows: TeacherAvailabilityRow[] = [],
  slotTemplateIds: string[] = [],
) => {
  const map = new Map<string, boolean>();
  slotTemplateIds.forEach((slotTemplateId) => {
    map.set(slotTemplateId, false);
  });
  rows.forEach((row) => {
    map.set(row.slot_template_id, row.is_available === true);
  });
  return map;
};

const mapKey = (map: Map<string, boolean>) =>
  Array.from(map.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([slotTemplateId, isAvailable]) => `${slotTemplateId}:${isAvailable ? "1" : "0"}`)
    .join("|");

const isTimeInsideDayRange = (
  dayRanges: AvailabilityDayRange[],
  dayOfWeek: number,
  startTime: string,
) => {
  const range = dayRanges.find((item) => item.day_of_week === dayOfWeek);
  if (!range) return false;

  const slotMinutes = timeToMinutes(startTime);
  const startMinutes = timeToMinutes(range.start_time);
  const endMinutes = timeToMinutes(range.end_time);
  if (!Number.isFinite(slotMinutes) || !Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {
    return false;
  }

  return slotMinutes >= startMinutes && slotMinutes <= endMinutes;
};

export default function TeacherOnlineAvailabilityPage() {
  const { programScope } = useTeachingModeContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [templates, setTemplates] = useState<OnlineSlotTemplateOption[]>([]);
  const [dayRanges, setDayRanges] = useState<AvailabilityDayRange[]>([]);
  const [slotGroups, setSlotGroups] = useState<AvailabilitySlotGroup[]>([]);
  const [availabilityRows, setAvailabilityRows] = useState<TeacherAvailabilityRow[]>([]);
  const [occupiedSlots, setOccupiedSlots] = useState<OccupiedSlotRow[]>([]);
  const [draftAvailability, setDraftAvailability] = useState<Map<string, boolean>>(() => new Map());
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [activeTimeEditor, setActiveTimeEditor] = useState<ActiveTimeEditor | null>(null);
  const [editorSelectedDays, setEditorSelectedDays] = useState<Set<number>>(() => new Set());
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 640px)");
    const syncIsDesktop = () => setIsDesktop(mediaQuery.matches);
    syncIsDesktop();
    mediaQuery.addEventListener("change", syncIsDesktop);
    return () => mediaQuery.removeEventListener("change", syncIsDesktop);
  }, []);

  const allSlotTemplateIds = useMemo(
    () => Array.from(new Set(templates.map((template) => template.id))),
    [templates],
  );
  const initialAvailability = useMemo(
    () => availabilityMapFromRows(availabilityRows, allSlotTemplateIds),
    [allSlotTemplateIds, availabilityRows],
  );
  const initialAvailabilityKey = useMemo(() => mapKey(initialAvailability), [initialAvailability]);
  const draftAvailabilityKey = useMemo(() => mapKey(draftAvailability), [draftAvailability]);
  const hasChanges = initialAvailabilityKey !== draftAvailabilityKey;

  const occupiedCounts = useMemo(() => {
    const map = new Map<string, number>();
    occupiedSlots.forEach((slot) => {
      map.set(slot.slot_template_id, Number(slot.package_count) || 0);
    });
    return map;
  }, [occupiedSlots]);

  const dedupedSlotGroups = useMemo(() => {
    const groups =
      slotGroups.length > 0
        ? slotGroups
        : templates.map((template) => ({
            id: `${template.day_of_week}:${template.start_time}`,
            day_of_week: template.day_of_week,
            start_time: template.start_time,
            duration_minutes: template.duration_minutes,
            timezone: template.timezone,
            slot_template_ids: [template.id],
            is_available: draftAvailability.get(template.id) === true,
            availability_source: null,
            occupied_count: occupiedCounts.get(template.id) ?? 0,
            configured_count: 1,
          }));

    return groups.slice().sort((left, right) => {
      const leftDay = DAY_OPTIONS.findIndex((day) => day.value === left.day_of_week);
      const rightDay = DAY_OPTIONS.findIndex((day) => day.value === right.day_of_week);
      if (leftDay !== rightDay) return leftDay - rightDay;
      return left.start_time.localeCompare(right.start_time);
    });
  }, [draftAvailability, occupiedCounts, slotGroups, templates]);

  const groupedTemplates = useMemo(
    () =>
      DAY_OPTIONS.map((day) => ({
        ...day,
        groups: dedupedSlotGroups.filter((group) => group.day_of_week === day.value),
      })).filter((day) => day.groups.length > 0),
    [dedupedSlotGroups],
  );

  const groupIsSelected = useCallback(
    (group: AvailabilitySlotGroup) =>
      group.slot_template_ids.length > 0 &&
      group.slot_template_ids.every((slotTemplateId) => draftAvailability.get(slotTemplateId) === true),
    [draftAvailability],
  );

  const groupIsInUse = useCallback(
    (group: AvailabilitySlotGroup) =>
      group.occupied_count > 0 ||
      group.slot_template_ids.some((slotTemplateId) => (occupiedCounts.get(slotTemplateId) ?? 0) > 0),
    [occupiedCounts],
  );

  const timeCapacity = useMemo(() => {
    const map = new Map<
      string,
      { configuredDays: Set<number>; freeDays: Set<number>; occupiedDays: Set<number> }
    >();

    dedupedSlotGroups.forEach((group) => {
      const capacity =
        map.get(group.start_time) ??
        { configuredDays: new Set<number>(), freeDays: new Set<number>(), occupiedDays: new Set<number>() };
      const inUse = groupIsInUse(group);
      capacity.configuredDays.add(group.day_of_week);
      if (inUse) capacity.occupiedDays.add(group.day_of_week);
      if (groupIsSelected(group) && !inUse) capacity.freeDays.add(group.day_of_week);
      map.set(group.start_time, capacity);
    });

    return map;
  }, [dedupedSlotGroups, groupIsInUse, groupIsSelected]);

  const invalidTimeIssues = useMemo<InvalidTimeIssue[]>(
    () =>
      Array.from(timeCapacity.entries())
        .filter(([, capacity]) => capacity.freeDays.size > 0 && capacity.freeDays.size < MIN_FREE_DAYS_PER_AVAILABLE_TIME)
        .map(([startTime, capacity]) => ({
          startTime,
          label: formatTime(startTime),
          selectedDays: capacity.freeDays.size,
          requiredDays: MIN_FREE_DAYS_PER_AVAILABLE_TIME,
          missingDays: MIN_FREE_DAYS_PER_AVAILABLE_TIME - capacity.freeDays.size,
        })),
    [timeCapacity],
  );
  const invalidTimeIssueMap = useMemo(
    () => new Map(invalidTimeIssues.map((issue) => [issue.startTime, issue])),
    [invalidTimeIssues],
  );
  const availabilityIssueMessage = useMemo(
    () => formatAvailabilityIssueMessage(invalidTimeIssues),
    [invalidTimeIssues],
  );
  const hasAvailabilityIssues = invalidTimeIssues.length > 0;

  const totalAvailable = useMemo(
    () => dedupedSlotGroups.filter((group) => groupIsSelected(group) && !groupIsInUse(group)).length,
    [dedupedSlotGroups, groupIsInUse, groupIsSelected],
  );

  const totalInUse = useMemo(
    () => dedupedSlotGroups.filter((group) => groupIsInUse(group)).length,
    [dedupedSlotGroups, groupIsInUse],
  );

  const groupsByStartTime = useMemo(() => {
    const map = new Map<string, AvailabilitySlotGroup[]>();
    dedupedSlotGroups.forEach((group) => {
      const groups = map.get(group.start_time) ?? [];
      groups.push(group);
      map.set(group.start_time, groups);
    });
    return map;
  }, [dedupedSlotGroups]);

  const daySummary = useMemo(() => {
    const map = new Map<number, { available: number; booked: number }>();
    dedupedSlotGroups.forEach((group) => {
      const summary = map.get(group.day_of_week) ?? { available: 0, booked: 0 };
      if (groupIsInUse(group)) {
        summary.booked += 1;
      } else if (groupIsSelected(group)) {
        summary.available += 1;
      }
      map.set(group.day_of_week, summary);
    });
    return map;
  }, [dedupedSlotGroups, groupIsInUse, groupIsSelected]);

  const closeTimeEditor = useCallback(() => {
    setActiveTimeEditor(null);
    setEditorSelectedDays(new Set());
  }, []);

  const groupIsSelectedInAvailability = useCallback(
    (group: AvailabilitySlotGroup, availability: Map<string, boolean>) =>
      group.slot_template_ids.length > 0 &&
      group.slot_template_ids.every((slotTemplateId) => availability.get(slotTemplateId) === true),
    [],
  );

  const selectedDaysForStartTime = useCallback(
    (startTime: string, availability: Map<string, boolean>) => {
      const sameTimeGroups = groupsByStartTime.get(startTime) ?? [];
      return new Set(
        sameTimeGroups
          .filter((timeGroup) => groupIsSelectedInAvailability(timeGroup, availability) && !groupIsInUse(timeGroup))
          .map((timeGroup) => timeGroup.day_of_week),
      );
    },
    [groupIsInUse, groupIsSelectedInAvailability, groupsByStartTime],
  );

  const openTimeEditor = (group: AvailabilitySlotGroup, availability: Map<string, boolean>) => {
    if (groupIsInUse(group)) return;
    setActiveTimeEditor({
      groupId: group.id,
      startTime: group.start_time,
      sourceDay: group.day_of_week,
    });
    setEditorSelectedDays(selectedDaysForStartTime(group.start_time, availability));
    setSuccess(null);
  };

  const toggleGroupAndSuggest = (group: AvailabilitySlotGroup) => {
    if (groupIsInUse(group)) return;
    const nextAvailability = new Map(draftAvailability);
    const nextValue = !groupIsSelectedInAvailability(group, nextAvailability);

    group.slot_template_ids.forEach((slotTemplateId) => {
      nextAvailability.set(slotTemplateId, nextValue);
    });

    setDraftAvailability(nextAvailability);
    openTimeEditor(group, nextAvailability);
  };

  const applyTimeEditor = () => {
    if (!activeTimeEditor) return;
    const sameTimeGroups = groupsByStartTime.get(activeTimeEditor.startTime) ?? [];
    setDraftAvailability((current) => {
      const next = new Map(current);
      sameTimeGroups.forEach((group) => {
        if (groupIsInUse(group)) return;
        const nextValue = editorSelectedDays.has(group.day_of_week);
        group.slot_template_ids.forEach((slotTemplateId) => {
          next.set(slotTemplateId, nextValue);
        });
      });
      return next;
    });
    closeTimeEditor();
  };

  const renderTimeEditor = () => {
    if (!activeTimeEditor) return null;
    const editableDays = DAY_OPTIONS.filter((day) =>
      isTimeInsideDayRange(dayRanges, day.value, activeTimeEditor.startTime),
    );
    const editorSelectedDayCount = editableDays.filter((day) => {
      const group = groupsByStartTime
        .get(activeTimeEditor.startTime)
        ?.find((timeGroup) => timeGroup.day_of_week === day.value);
      return group && !groupIsInUse(group) && editorSelectedDays.has(day.value);
    }).length;
    const editorMissingDayCount = MIN_FREE_DAYS_PER_AVAILABLE_TIME - editorSelectedDayCount;
    const editorHasIssue =
      editorSelectedDayCount > 0 && editorSelectedDayCount < MIN_FREE_DAYS_PER_AVAILABLE_TIME;

    return (
      <div className="space-y-4">
        <div>
          <p className="text-lg font-semibold text-slate-950">{formatTime(activeTimeEditor.startTime)}</p>
          <p className="text-sm text-slate-500">Set this time across days</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {editableDays.map((day) => {
            const group = groupsByStartTime
              .get(activeTimeEditor.startTime)
              ?.find((timeGroup) => timeGroup.day_of_week === day.value);
            const missing = !group;
            const booked = group ? groupIsInUse(group) : false;
            const selected = editorSelectedDays.has(day.value);
            const currentDay = activeTimeEditor.sourceDay === day.value;
            return (
              <button
                key={day.value}
                type="button"
                disabled={missing || booked}
                onClick={() => {
                  setEditorSelectedDays((current) => {
                    const next = new Set(current);
                    if (next.has(day.value)) {
                      next.delete(day.value);
                    } else {
                      next.add(day.value);
                    }
                    return next;
                  });
                }}
                className={cn(
                  "min-h-12 rounded-lg border px-3 py-2 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-slate-300",
                  selected
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-400",
                  currentDay && "ring-2 ring-slate-300",
                  (missing || booked) && "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400",
                )}
              >
                <span className="block font-semibold">{day.short}</span>
                <span className="mt-0.5 block text-xs">
                  {booked ? "Booked" : missing ? "Unavailable" : selected ? "Available" : "Off"}
                </span>
              </button>
            );
          })}
        </div>
        {editorHasIssue ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            Add {editorMissingDayCount} more {pluralize(editorMissingDayCount, "day")} or turn this time off.
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={closeTimeEditor}>
            Cancel
          </Button>
          <Button type="button" className="flex-1 bg-slate-950 text-white hover:bg-slate-800" onClick={applyTimeEditor}>
            Apply
          </Button>
        </div>
      </div>
    );
  };

  const loadAvailability = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await authFetch("/api/teacher/online/availability");
      const payload = (await response.json().catch(() => ({}))) as AvailabilityPayload;
      if (!response.ok) throw new Error(payload.error || "Failed to load availability.");

      const nextTemplates = payload.templates ?? [];
      const nextAvailability = payload.availability ?? [];
      setTemplates(nextTemplates);
      setDayRanges(payload.day_ranges ?? []);
      setSlotGroups(payload.slot_groups ?? []);
      setAvailabilityRows(nextAvailability);
      setDraftAvailability(availabilityMapFromRows(nextAvailability, nextTemplates.map((template) => template.id)));
      setOccupiedSlots(payload.occupied_slots ?? []);
      closeTimeEditor();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load availability.");
    } finally {
      setLoading(false);
    }
  }, [closeTimeEditor]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  const discardChanges = () => {
    setDraftAvailability(new Map(initialAvailability));
    closeTimeEditor();
    setSuccess(null);
  };

  const saveChanges = async () => {
    if (!hasChanges || saving) return;
    if (hasAvailabilityIssues) {
      setSuccess(null);
      return;
    }

    const changedUpdates = Array.from(draftAvailability.entries())
      .filter(([slotTemplateId, isAvailable]) => initialAvailability.get(slotTemplateId) !== isAvailable)
      .map(([slot_template_id, is_available]) => ({ slot_template_id, is_available }));

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await authFetch("/api/teacher/online/availability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: changedUpdates }),
      });
      const payload = (await response.json().catch(() => ({}))) as AvailabilityPayload;
      if (!response.ok) throw new Error(payload.error || "Failed to save availability.");
      await loadAvailability();
      setSuccess("Availability saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save availability.");
    } finally {
      setSaving(false);
    }
  };

  if (programScope === "campus") {
    return (
      <main className="min-h-screen bg-[#F2F2F7] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <Card className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-semibold text-slate-950">Online availability unavailable</h1>
            <p className="mt-3 text-slate-600">
              Your teacher account is currently assigned to campus classes only.
            </p>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F2F2F7] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">
              Set Availability for New Online Enrollments
            </h1>
            <p className="mt-2 text-base text-slate-600">
              Changing this does not move your current classes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="rounded-full bg-white px-3 py-1.5 shadow-sm">
              {totalAvailable} available
            </span>
            <span className="rounded-full bg-white px-3 py-1.5 shadow-sm">
              {totalInUse} booked
            </span>
          </div>
        </header>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        {hasAvailabilityIssues ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {availabilityIssueMessage}
          </div>
        ) : null}
        {success ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        ) : null}

        <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : groupedTemplates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
              <h2 className="text-lg font-semibold text-slate-950">No slot templates yet</h2>
              <p className="mt-2 text-sm text-slate-500">
                Ask admin to create active online slot templates before setting availability.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {groupedTemplates.map((day) => (
                <section
                  key={day.value}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-slate-50"
                    onClick={() => {
                      setOpenDay((current) => (current === day.value ? null : day.value));
                      closeTimeEditor();
                    }}
                  >
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-slate-950">{day.label}</h2>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {daySummary.get(day.value)?.available ?? 0} available
                        {daySummary.get(day.value)?.booked
                          ? ` / ${daySummary.get(day.value)?.booked ?? 0} booked`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500">
                        {day.groups.length} slots
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 text-slate-400 transition-transform",
                          openDay === day.value && "rotate-180",
                        )}
                        aria-hidden="true"
                      />
                    </div>
                  </button>
                  {openDay === day.value ? (
                    <div className="border-t border-slate-100 bg-slate-50/70 p-4">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                        {day.groups.map((group) => {
                          const selected = groupIsSelected(group);
                          const isInUse = groupIsInUse(group);
                          const timeIssue = invalidTimeIssueMap.get(group.start_time);
                          const hasTimeIssue = !isInUse && Boolean(timeIssue);
                          const slotStatus = isInUse
                            ? "Booked"
                            : selected && timeIssue
                              ? `${timeIssue.selectedDays}/${timeIssue.requiredDays} days selected`
                              : !selected && timeIssue
                                ? "Add day"
                                : selected
                                  ? "Available"
                                  : "Off";
                          const slotButton = (
                            <button
                              key={group.id}
                              type="button"
                              disabled={isInUse}
                              onClick={(event) => {
                                event.preventDefault();
                                toggleGroupAndSuggest(group);
                              }}
                              className={cn(
                                "min-h-16 w-full rounded-lg border px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-slate-300",
                                isInUse
                                  ? "cursor-not-allowed border-slate-300 bg-slate-200 text-slate-500"
                                  : selected && hasTimeIssue
                                    ? "border-amber-300 bg-slate-950 text-white ring-2 ring-amber-200"
                                    : selected
                                      ? "border-slate-950 bg-slate-950 text-white"
                                      : hasTimeIssue
                                        ? "border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-500"
                                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-400",
                              )}
                            >
                              <span className="block text-sm font-semibold">{formatTime(group.start_time)}</span>
                              <span className="mt-1 block text-xs">{slotStatus}</span>
                            </button>
                          );

                          if (isInUse || !isDesktop) return slotButton;

                          return (
                            <Popover
                              key={group.id}
                              open={activeTimeEditor?.groupId === group.id}
                              onOpenChange={(nextOpen) => {
                                if (!nextOpen && activeTimeEditor?.groupId === group.id) {
                                  closeTimeEditor();
                                }
                              }}
                            >
                              <PopoverTrigger asChild>{slotButton}</PopoverTrigger>
                              <PopoverContent
                                align="start"
                                className="hidden w-80 rounded-2xl border-slate-200 bg-white p-4 shadow-2xl sm:block"
                              >
                                {renderTimeEditor()}
                              </PopoverContent>
                            </Popover>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
          )}
        </Card>

        {activeTimeEditor && !isDesktop ? (
          <div className="fixed inset-0 z-50 sm:hidden">
            <button
              type="button"
              aria-label="Close time editor"
              className="absolute inset-0 z-0 bg-slate-950/35"
              onClick={closeTimeEditor}
            />
            <div className="absolute inset-x-0 bottom-0 z-10 rounded-t-3xl border border-slate-200 bg-white p-4 shadow-2xl">
              {renderTimeEditor()}
            </div>
          </div>
        ) : null}
      </div>

      {hasChanges ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className={cn("text-sm font-medium", hasAvailabilityIssues ? "text-red-700" : "text-slate-700")}>
              {hasAvailabilityIssues
                ? `Fix ${invalidTimeIssues.length} availability ${pluralize(invalidTimeIssues.length, "issue")} before saving.`
                : "You have unsaved availability changes."}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 sm:flex-none"
                onClick={discardChanges}
                disabled={saving}
              >
                Discard
              </Button>
              <Button
                type="button"
                className="flex-1 bg-slate-950 text-white hover:bg-slate-800 sm:flex-none"
                onClick={saveChanges}
                disabled={saving || hasAvailabilityIssues}
              >
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
