"use client";

import React from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { authFetch } from "@/lib/authFetch";
import { dayOfWeekLabel, startTimeToMinutes } from "@/lib/online/slots";
import { cn } from "@/lib/utils";

type Teacher = {
  id: string;
  name: string;
};

type OnlineCourse = {
  id: string;
  name: string;
  is_active: boolean;
  sessions_per_week: number | null;
};

type OnlineSlotTemplate = {
  id: string;
  course_id: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  timezone: string;
  is_active: boolean;
};

type OnlineTeacherAvailability = {
  slot_template_id: string;
  teacher_id: string;
  is_available: boolean;
  last_assigned_at: string | null;
};

type OnlineSlotManagerProps = {
  courses: OnlineCourse[];
  templates: OnlineSlotTemplate[];
  teacherAvailability: OnlineTeacherAvailability[];
  teachers: Teacher[];
  onRefresh: () => Promise<void>;
};

type SlotFormState = {
  courseGroupKey: string;
  dayOfWeek: string;
  startTime: string;
  timezone: string;
  isActive: boolean;
};

type GeneratorFormState = {
  courseScope: string;
  startTime: string;
  endTime: string;
  timezone: string;
  isActive: boolean;
};

type CourseGroup = {
  key: string;
  label: string;
  courseIds: string[];
  isActive: boolean;
};

type SlotGroup = {
  id: string;
  courseGroupKey: string;
  courseLabel: string;
  templateIds: string[];
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  timezone: string;
  teacherAssignmentCounts: Map<string, number>;
  activeTemplateCount: number;
  totalTemplateCount: number;
};

type SelectedSlotState = {
  teacherId: string;
  slotId: string;
};

type SlotTone = {
  key: "hafazan" | "arabic" | "other";
  label: string;
  dotClassName: string;
  assignedClassName: string;
  unassignedClassName: string;
};

const DEFAULT_TIMEZONE = "Asia/Kuala_Lumpur";
const ALL_ACTIVE_COURSES = "__all_active__";
const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5];
const TAHFIZ_ONLINE_GROUP_KEY = "course-group:tahfiz-online";
const WEEKDAY_SEQUENCE = [1, 2, 3, 4, 5, 6, 0];

const defaultFormState = (): SlotFormState => ({
  courseGroupKey: "",
  dayOfWeek: "1",
  startTime: "",
  timezone: DEFAULT_TIMEZONE,
  isActive: true,
});

const defaultGeneratorState = (): GeneratorFormState => ({
  courseScope: ALL_ACTIVE_COURSES,
  startTime: "08:00",
  endTime: "22:00",
  timezone: DEFAULT_TIMEZONE,
  isActive: true,
});

const formatMinutes = (value: number) => {
  const hour = Math.floor(value / 60) % 24;
  const minute = value % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const formatTimeRange = (startTime: string, durationMinutes: number) => {
  const startMinutes = startTimeToMinutes(startTime);
  return `${formatMinutes(startMinutes)} - ${formatMinutes(startMinutes + durationMinutes)}`;
};

const timeInputValue = (value: string | null | undefined) => (value ?? "").slice(0, 5);

const isTahfizOnlineCourse = (courseName: string) => /^tahfiz online\b/i.test(courseName.trim());

const getCourseGroupIdentity = (course: OnlineCourse) => {
  if (isTahfizOnlineCourse(course.name)) {
    return {
      key: TAHFIZ_ONLINE_GROUP_KEY,
      label: "Tahfiz Online",
    };
  }

  return {
    key: `course:${course.id}`,
    label: course.name,
  };
};

const getActiveState = (slot: SlotGroup) => {
  if (slot.activeTemplateCount === 0) return "inactive";
  if (slot.activeTemplateCount === slot.totalTemplateCount) return "active";
  return "mixed";
};

const getSlotTone = (courseLabel: string): SlotTone => {
  if (/arabic/i.test(courseLabel)) {
    return {
      key: "arabic",
      label: "Arabic",
      dotClassName: "bg-sky-400",
      assignedClassName: "border-sky-200 bg-sky-50 text-sky-800 shadow-sm",
      unassignedClassName: "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700 hover:bg-slate-50 block",
    };
  }

  if (/tahfiz|hafazan/i.test(courseLabel)) {
    return {
      key: "hafazan",
      label: "Hafazan",
      dotClassName: "bg-emerald-400",
      assignedClassName: "border-emerald-200 bg-emerald-50 text-emerald-800 shadow-sm",
      unassignedClassName: "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700 hover:bg-slate-50",
    };
  }

  return {
    key: "other",
    label: courseLabel,
    dotClassName: "bg-slate-400",
    assignedClassName: "border-slate-200 bg-slate-50 text-slate-800 shadow-sm",
    unassignedClassName: "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700 hover:bg-slate-50",
  };
};

export default function OnlineSlotManager({
  courses,
  templates,
  teacherAvailability,
  teachers,
  onRefresh,
}: OnlineSlotManagerProps) {
  const [form, setForm] = React.useState<SlotFormState>(defaultFormState);
  const [generator, setGenerator] = React.useState<GeneratorFormState>(defaultGeneratorState);
  const [selectedSlot, setSelectedSlot] = React.useState<SelectedSlotState | null>(null);
  const [editingSlotId, setEditingSlotId] = React.useState<string | null>(null);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  const courseGroups = React.useMemo(() => {
    const groupMap = new Map<string, CourseGroup>();

    courses.forEach((course) => {
      const identity = getCourseGroupIdentity(course);
      const group = groupMap.get(identity.key) ?? {
        key: identity.key,
        label: identity.label,
        courseIds: [],
        isActive: false,
      };

      group.courseIds.push(course.id);
      group.isActive = group.isActive || course.is_active;
      groupMap.set(identity.key, group);
    });

    return Array.from(groupMap.values()).sort((left, right) => left.label.localeCompare(right.label));
  }, [courses]);

  const courseGroupByKey = React.useMemo(
    () => new Map(courseGroups.map((group) => [group.key, group])),
    [courseGroups]
  );

  const courseGroupByCourseId = React.useMemo(() => {
    const map = new Map<string, CourseGroup>();
    courseGroups.forEach((group) => {
      group.courseIds.forEach((courseId) => {
        map.set(courseId, group);
      });
    });
    return map;
  }, [courseGroups]);

  React.useEffect(() => {
    setForm((current) => {
      if (current.courseGroupKey || courseGroups.length === 0) return current;
      return { ...current, courseGroupKey: courseGroups[0].key };
    });
  }, [courseGroups]);

  React.useEffect(() => {
    setGenerator((current) => {
      if (current.courseScope === ALL_ACTIVE_COURSES) return current;
      if (courseGroups.some((group) => group.key === current.courseScope)) return current;
      return { ...current, courseScope: ALL_ACTIVE_COURSES };
    });
  }, [courseGroups]);

  const resetForm = React.useCallback(() => {
    setEditingSlotId(null);
    setForm({
      ...defaultFormState(),
      courseGroupKey: courseGroups[0]?.key ?? "",
    });
  }, [courseGroups]);

  const activeCourseIds = React.useMemo(
    () => courses.filter((course) => course.is_active).map((course) => course.id),
    [courses]
  );

  const slotGroups = React.useMemo(() => {
    const slotGroupMap = new Map<string, SlotGroup>();
    const slotGroupIdByTemplateId = new Map<string, string>();

    [...templates]
      .sort((left, right) => {
        if (left.day_of_week !== right.day_of_week) {
          return left.day_of_week - right.day_of_week;
        }
        return left.start_time.localeCompare(right.start_time);
      })
      .forEach((template) => {
        const courseGroup = courseGroupByCourseId.get(template.course_id);
        const groupKey = courseGroup?.key ?? `course:${template.course_id}`;
        const slotGroupId = [
          groupKey,
          template.day_of_week,
          template.start_time,
          template.duration_minutes,
          template.timezone || DEFAULT_TIMEZONE,
        ].join(":");

        const slotGroup = slotGroupMap.get(slotGroupId) ?? {
          id: slotGroupId,
          courseGroupKey: groupKey,
          courseLabel: courseGroup?.label ?? "Unknown Course",
          templateIds: [],
          dayOfWeek: template.day_of_week,
          startTime: template.start_time,
          durationMinutes: template.duration_minutes,
          timezone: template.timezone || DEFAULT_TIMEZONE,
          teacherAssignmentCounts: new Map<string, number>(),
          activeTemplateCount: 0,
          totalTemplateCount: 0,
        };

        slotGroup.templateIds.push(template.id);
        slotGroup.totalTemplateCount += 1;
        if (template.is_active) {
          slotGroup.activeTemplateCount += 1;
        }

        slotGroupMap.set(slotGroupId, slotGroup);
        slotGroupIdByTemplateId.set(template.id, slotGroupId);
      });

    teacherAvailability.forEach((row) => {
      if (!row.is_available) return;
      const slotGroupId = slotGroupIdByTemplateId.get(row.slot_template_id);
      if (!slotGroupId) return;

      const slotGroup = slotGroupMap.get(slotGroupId);
      if (!slotGroup) return;

      slotGroup.teacherAssignmentCounts.set(
        row.teacher_id,
        (slotGroup.teacherAssignmentCounts.get(row.teacher_id) ?? 0) + 1
      );
    });

    return Array.from(slotGroupMap.values()).sort((left, right) => {
      if (left.dayOfWeek !== right.dayOfWeek) {
        return left.dayOfWeek - right.dayOfWeek;
      }
      if (left.startTime !== right.startTime) {
        return left.startTime.localeCompare(right.startTime);
      }
      return left.courseLabel.localeCompare(right.courseLabel);
    });
  }, [courseGroupByCourseId, teacherAvailability, templates]);

  const slotGroupById = React.useMemo(
    () => new Map(slotGroups.map((slotGroup) => [slotGroup.id, slotGroup])),
    [slotGroups]
  );

  const activeSlotGroups = slotGroups.filter((slotGroup) => getActiveState(slotGroup) !== "inactive");
  const selectedSlotGroup = selectedSlot ? slotGroupById.get(selectedSlot.slotId) ?? null : null;
  const editingSlot = editingSlotId ? slotGroupById.get(editingSlotId) ?? null : null;

  const legendTones = React.useMemo(() => {
    const toneMap = new Map<string, SlotTone>();
    slotGroups.forEach((slotGroup) => {
      const tone = getSlotTone(slotGroup.courseLabel);
      toneMap.set(tone.key, tone);
    });
    return Array.from(toneMap.values());
  }, [slotGroups]);

  const runSlotGroupMutation = React.useCallback(
    async (
      slotGroup: SlotGroup,
      requestFactory: (slotTemplateId: string) => Promise<Response>,
      defaultError: string
    ) => {
      const responses = await Promise.all(
        slotGroup.templateIds.map((slotTemplateId) => requestFactory(slotTemplateId))
      );
      const payloads = await Promise.all(
        responses.map(async (response) => {
          try {
            return (await response.json()) as { error?: string };
          } catch {
            return {};
          }
        })
      );

      const failedIndex = responses.findIndex((response) => !response.ok);
      if (failedIndex >= 0) {
        throw new Error(payloads[failedIndex]?.error || defaultError);
      }
    },
    []
  );

  const generateSlots = async () => {
    const courseIds =
      generator.courseScope === ALL_ACTIVE_COURSES
        ? activeCourseIds
        : courseGroupByKey.get(generator.courseScope)?.courseIds ?? [];

    if (courseIds.length === 0) {
      setError("Tiada course aktif untuk jana slot.");
      return;
    }

    setBusyKey("generate");
    setError("");
    setSuccess("");

    try {
      const response = await authFetch("/api/admin/online/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_generate_templates",
          course_ids: courseIds,
          day_of_weeks: DEFAULT_WEEKDAYS,
          start_time: generator.startTime,
          end_time: generator.endTime,
          timezone: generator.timezone.trim() || DEFAULT_TIMEZONE,
          is_active: generator.isActive,
        }),
      });
      const data = (await response.json()) as { error?: string; created_count?: number; skipped_count?: number };
      if (!response.ok) {
        throw new Error(data.error || "Failed to generate online slots");
      }

      await onRefresh();
      setSuccess(
        `Siap. ${data.created_count ?? 0} slot dijana, ${data.skipped_count ?? 0} slot sedia ada dikekalkan.`
      );
    } catch (generateError) {
      setError(
        generateError instanceof Error ? generateError.message : "Failed to generate online slots"
      );
    } finally {
      setBusyKey(null);
    }
  };

  const selectSlotForTeacher = (teacherId: string, slotId: string) => {
    setSelectedSlot((current) => {
      if (current?.teacherId === teacherId && current.slotId === slotId) {
        setEditingSlotId(null);
        return null;
      }
      return { teacherId, slotId };
    });
    setError("");
    setSuccess("");
  };

  const toggleTeacherAvailability = async (
    slotGroup: SlotGroup,
    teacherId: string,
    nextValue: boolean
  ) => {
    setBusyKey(`teacher:${slotGroup.id}:${teacherId}`);
    setError("");
    setSuccess("");

    try {
      await runSlotGroupMutation(
        slotGroup,
        (slotTemplateId) =>
          authFetch("/api/admin/online/slots", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "toggle_teacher",
              slot_template_id: slotTemplateId,
              teacher_id: teacherId,
              is_available: nextValue,
            }),
          }),
        "Failed to update teacher availability"
      );

      await onRefresh();
      setSuccess(nextValue ? "Slot ditanda untuk guru ini." : "Slot dibuang daripada guru ini.");
    } catch (toggleError) {
      setError(
        toggleError instanceof Error ? toggleError.message : "Failed to update teacher availability"
      );
    } finally {
      setBusyKey(null);
    }
  };

  const startEdit = (slotGroup: SlotGroup) => {
    setEditingSlotId(slotGroup.id);
    setForm({
      courseGroupKey: slotGroup.courseGroupKey,
      dayOfWeek: String(slotGroup.dayOfWeek),
      startTime: timeInputValue(slotGroup.startTime),
      timezone: slotGroup.timezone || DEFAULT_TIMEZONE,
      isActive: getActiveState(slotGroup) !== "inactive",
    });
    setError("");
    setSuccess("");
  };

  const submitForm = async () => {
    if (!editingSlot || !form.startTime) {
      setError("Slot dan masa slot diperlukan.");
      return;
    }

    setBusyKey(`save:${editingSlot.id}`);
    setError("");
    setSuccess("");

    try {
      await runSlotGroupMutation(
        editingSlot,
        (slotTemplateId) =>
          authFetch("/api/admin/online/slots", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              slot_template_id: slotTemplateId,
              day_of_week: Number(form.dayOfWeek),
              start_time: form.startTime,
              timezone: form.timezone.trim() || DEFAULT_TIMEZONE,
              is_active: form.isActive,
            }),
          }),
        "Failed to save online slot"
      );

      await onRefresh();
      resetForm();
      setSuccess("Slot berjaya dikemas kini.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save online slot");
    } finally {
      setBusyKey(null);
    }
  };

  const toggleSlotActive = async (slotGroup: SlotGroup) => {
    const nextIsActive = getActiveState(slotGroup) === "inactive";

    setBusyKey(`status:${slotGroup.id}`);
    setError("");
    setSuccess("");

    try {
      await runSlotGroupMutation(
        slotGroup,
        (slotTemplateId) =>
          authFetch("/api/admin/online/slots", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              slot_template_id: slotTemplateId,
              is_active: nextIsActive,
            }),
          }),
        "Failed to update slot status"
      );

      await onRefresh();
      if (editingSlotId === slotGroup.id) {
        setForm((current) => ({ ...current, isActive: nextIsActive }));
      }
      setSuccess(nextIsActive ? "Slot diaktifkan." : "Slot dinyahaktifkan.");
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Failed to update slot status");
    } finally {
      setBusyKey(null);
    }
  };

  const deleteSlot = async (slotGroup: SlotGroup) => {
    const confirmed = window.confirm(
      slotGroup.templateIds.length > 1
        ? "Padam semua slot berkongsi ini? Slot dengan booking aktif tidak boleh dipadam."
        : "Padam slot ini? Slot dengan booking aktif tidak boleh dipadam."
    );
    if (!confirmed) return;

    setBusyKey(`delete:${slotGroup.id}`);
    setError("");
    setSuccess("");

    try {
      await runSlotGroupMutation(
        slotGroup,
        (slotTemplateId) =>
          authFetch(`/api/admin/online/slots?id=${encodeURIComponent(slotTemplateId)}`, {
            method: "DELETE",
          }),
        "Failed to delete online slot"
      );

      await onRefresh();
      setSelectedSlot((current) => (current?.slotId === slotGroup.id ? null : current));
      if (editingSlotId === slotGroup.id) {
        resetForm();
      }
      setSuccess("Slot berjaya dipadam.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete online slot");
    } finally {
      setBusyKey(null);
    }
  };

  const totalSlots = slotGroups.length;
  const activeSlots = activeSlotGroups.length;

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Online Attendance Slots</h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Paparan guru mingguan yang lebih ringkas, dengan slot ikut hari.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm sm:w-auto">
          <div className="flex w-28 flex-col items-center justify-center rounded-2xl border border-slate-200/60 bg-slate-50/50 px-4 py-3 shadow-sm backdrop-blur-sm">
            <p className="text-xs font-medium text-slate-500">Total Slot</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{totalSlots}</p>
          </div>
          <div className="flex w-28 flex-col items-center justify-center rounded-2xl border border-emerald-200/60 bg-emerald-50/50 px-4 py-3 shadow-sm backdrop-blur-sm">
            <p className="text-xs font-medium text-emerald-600">Aktif</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-emerald-700">{activeSlots}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div>
          <div className="rounded-[24px] border border-slate-200/60 bg-slate-50/50 p-6 shadow-sm">
            <h3 className="text-lg font-semibold tracking-tight text-slate-900">Generate Slot 30 Minit</h3>
            <p className="mt-1 text-sm text-slate-500">
              Jana semua slot untuk Isnin hingga Jumaat.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Course</label>
                <select
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                  value={generator.courseScope}
                  onChange={(event) =>
                    setGenerator((current) => ({ ...current, courseScope: event.target.value }))
                  }
                  disabled={courseGroups.length === 0}
                >
                  <option value={ALL_ACTIVE_COURSES}>Semua course aktif</option>
                  {courseGroups.map((group) => (
                    <option key={group.key} value={group.key}>
                      {group.label}
                      {group.isActive ? "" : " (inactive)"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Mula</label>
                  <Input
                    type="time"
                    value={generator.startTime}
                    onChange={(event) =>
                      setGenerator((current) => ({ ...current, startTime: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Akhir</label>
                  <Input
                    type="time"
                    value={generator.endTime}
                    onChange={(event) =>
                      setGenerator((current) => ({ ...current, endTime: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Timezone</label>
                <Input
                  value={generator.timezone}
                  onChange={(event) =>
                    setGenerator((current) => ({ ...current, timezone: event.target.value }))
                  }
                  placeholder={DEFAULT_TIMEZONE}
                />
              </div>

              <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                Hari dijana: {DEFAULT_WEEKDAYS.map((day) => dayOfWeekLabel(day)).join(", ")}.
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={generator.isActive}
                  onChange={(event) =>
                    setGenerator((current) => ({ ...current, isActive: event.target.checked }))
                  }
                />
                Aktifkan slot yang dijana
              </label>

              <Button
                type="button"
                className="w-full rounded-xl bg-slate-900 py-6 text-sm font-medium text-white shadow-md transition-all hover:bg-slate-800 hover:shadow-lg active:scale-[0.98]"
                disabled={courseGroups.length === 0 || busyKey !== null}
                onClick={generateSlots}
              >
                {busyKey === "generate" ? "Menjana..." : "Jana Semua Slot 30 Minit"}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {teachers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50/50 p-12 text-center text-sm text-slate-500">
              Tiada guru ditemui untuk tenant ini.
            </div>
          ) : slotGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50/50 p-12 text-center text-sm text-slate-500">
              Belum ada slot. Gunakan generator di sebelah untuk sediakan semua slot 30 minit.
            </div>
          ) : (
            teachers.map((teacher) => {
              const isTeacherSelected = selectedSlot?.teacherId === teacher.id;
              const teacherSelectedSlot = isTeacherSelected ? selectedSlotGroup : null;
              const teacherSelectedCount = teacherSelectedSlot
                ? teacherSelectedSlot.teacherAssignmentCounts.get(teacher.id) ?? 0
                : 0;
              const teacherSelectionAssigned =
                teacherSelectedSlot !== null &&
                teacherSelectedCount === teacherSelectedSlot.totalTemplateCount;
              const teacherSelectionPartial =
                teacherSelectedSlot !== null &&
                teacherSelectedCount > 0 &&
                teacherSelectedCount < teacherSelectedSlot.totalTemplateCount;

              return (
                <section
                  key={teacher.id}
                  className="rounded-[24px] border border-slate-200/60 bg-white p-6 shadow-sm transition-all hover:shadow-md md:p-8"
                >
                  <div className="flex flex-col gap-4 border-b border-slate-100 pb-6 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-xl font-semibold tracking-tight text-slate-900">{teacher.name}</h3>
                      <p className="mt-1.5 text-sm text-slate-500">
                        Klik pill slot untuk pilih, assign, atau edit.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
                      {legendTones.map((tone) => (
                        <div key={tone.key} className="flex items-center gap-2 text-slate-600">
                          <span
                            className={cn("h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-slate-900/10", tone.dotClassName)}
                          />
                          <span>{tone.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 space-y-5">
                    {WEEKDAY_SEQUENCE.map((day) => {
                      const daySlots = slotGroups.filter((slotGroup) => slotGroup.dayOfWeek === day);

                      return (
                        <div
                          key={`${teacher.id}:${day}`}
                          className="grid gap-4 md:grid-cols-[120px_minmax(0,1fr)] items-start"
                        >
                          <div className="pt-3 text-sm font-semibold text-slate-400 uppercase tracking-wider">
                            {dayOfWeekLabel(day)}
                          </div>
                          <div className="min-h-[52px] rounded-2xl bg-slate-50/50 p-2.5 ring-1 ring-inset ring-slate-100/50">
                            <div className="flex flex-wrap gap-2.5">
                              {daySlots.map((slotGroup) => {
                                const tone = getSlotTone(slotGroup.courseLabel);
                                const assignedCount = slotGroup.teacherAssignmentCounts.get(teacher.id) ?? 0;
                                const isAssigned = assignedCount === slotGroup.totalTemplateCount;
                                const isPartial =
                                  assignedCount > 0 && assignedCount < slotGroup.totalTemplateCount;
                                const activeState = getActiveState(slotGroup);
                                const isSelected =
                                  selectedSlot?.teacherId === teacher.id &&
                                  selectedSlot.slotId === slotGroup.id;

                                return (
                                  <button
                                    key={`${teacher.id}:${slotGroup.id}`}
                                    type="button"
                                    onClick={() => selectSlotForTeacher(teacher.id, slotGroup.id)}
                                    className={cn(
                                      "min-w-[120px] rounded-full border px-4 py-2 text-center transition-all duration-200 ease-out",
                                      isAssigned || isPartial
                                        ? tone.assignedClassName
                                        : tone.unassignedClassName,
                                      activeState === "inactive" && "opacity-45 grayscale",
                                      isSelected ? "ring-2 ring-slate-900 ring-offset-1 scale-[1.02]" : "hover:scale-[1.02]"
                                    )}
                                  >
                                    <div className="text-sm font-semibold tracking-tight">
                                      {formatTimeRange(slotGroup.startTime, slotGroup.durationMinutes)}
                                    </div>
                                    <div className="mt-0.5 text-[11px] font-medium opacity-80">
                                      {tone.label}
                                      {isPartial ? " • sebahagian" : ""}
                                      {activeState === "inactive" ? " • inactive" : ""}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {teacherSelectedSlot && (
                    <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            Slot dipilih: {dayOfWeekLabel(teacherSelectedSlot.dayOfWeek)} ·{" "}
                            {formatTimeRange(
                              teacherSelectedSlot.startTime,
                              teacherSelectedSlot.durationMinutes
                            )}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {teacherSelectedSlot.courseLabel}
                            {teacherSelectionPartial
                              ? " · Guru ini baru diset pada sebahagian slot berkongsi."
                              : teacherSelectionAssigned
                                ? " · Slot ini sedang ditanda untuk guru ini."
                                : " · Slot ini belum ditanda untuk guru ini."}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              toggleTeacherAvailability(
                                teacherSelectedSlot,
                                teacher.id,
                                !teacherSelectionAssigned
                              )
                            }
                            disabled={
                              busyKey === `teacher:${teacherSelectedSlot.id}:${teacher.id}` ||
                              busyKey !== null
                            }
                          >
                            {busyKey === `teacher:${teacherSelectedSlot.id}:${teacher.id}`
                              ? "Menyimpan..."
                              : teacherSelectionAssigned
                                ? "Buang Dari Guru"
                                : teacherSelectionPartial
                                  ? "Samakan Untuk Guru"
                                  : "Assign Kepada Guru"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => startEdit(teacherSelectedSlot)}
                            disabled={busyKey !== null}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => toggleSlotActive(teacherSelectedSlot)}
                            disabled={
                              busyKey === `status:${teacherSelectedSlot.id}` || busyKey !== null
                            }
                          >
                            {busyKey === `status:${teacherSelectedSlot.id}`
                              ? "Updating..."
                              : getActiveState(teacherSelectedSlot) === "inactive"
                                ? "Activate"
                                : "Deactivate"}
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={() => deleteSlot(teacherSelectedSlot)}
                            disabled={
                              busyKey === `delete:${teacherSelectedSlot.id}` || busyKey !== null
                            }
                          >
                            {busyKey === `delete:${teacherSelectedSlot.id}` ? "Deleting..." : "Delete"}
                          </Button>
                        </div>
                      </div>

                      {editingSlot?.id === teacherSelectedSlot.id && (
                        <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <h4 className="text-lg font-semibold text-slate-900">Edit Slot</h4>
                              <p className="mt-1 text-sm text-slate-500">
                                Editor ini hanya muncul selepas klik Edit.
                              </p>
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={resetForm}>
                              Batal
                            </Button>
                          </div>

                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <div className="md:col-span-2">
                              <label className="mb-2 block text-sm font-medium text-slate-700">
                                Course
                              </label>
                              <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                {courseGroupByKey.get(form.courseGroupKey)?.label ?? editingSlot.courseLabel}
                              </div>
                            </div>

                            <div>
                              <label className="mb-2 block text-sm font-medium text-slate-700">
                                Hari
                              </label>
                              <select
                                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                                value={form.dayOfWeek}
                                onChange={(event) =>
                                  setForm((current) => ({ ...current, dayOfWeek: event.target.value }))
                                }
                              >
                                {Array.from({ length: 7 }, (_, index) => (
                                  <option key={index} value={String(index)}>
                                    {dayOfWeekLabel(index)}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="mb-2 block text-sm font-medium text-slate-700">
                                Masa Mula
                              </label>
                              <Input
                                type="time"
                                value={form.startTime}
                                onChange={(event) =>
                                  setForm((current) => ({ ...current, startTime: event.target.value }))
                                }
                              />
                            </div>

                            <div className="md:col-span-2">
                              <label className="mb-2 block text-sm font-medium text-slate-700">
                                Timezone
                              </label>
                              <Input
                                value={form.timezone}
                                onChange={(event) =>
                                  setForm((current) => ({ ...current, timezone: event.target.value }))
                                }
                                placeholder={DEFAULT_TIMEZONE}
                              />
                            </div>

                            <div className="md:col-span-2">
                              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={form.isActive}
                                  onChange={(event) =>
                                    setForm((current) => ({ ...current, isActive: event.target.checked }))
                                  }
                                />
                                Slot aktif
                              </label>
                            </div>
                          </div>

                          <Button
                            type="button"
                            className="mt-4 w-full rounded-xl bg-blue-600 text-white hover:bg-blue-700"
                            disabled={!form.startTime || busyKey !== null}
                            onClick={submitForm}
                          >
                            {busyKey === `save:${editingSlot.id}` ? "Menyimpan..." : "Simpan Perubahan Slot"}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>
      </div>
    </Card>
  );
}
