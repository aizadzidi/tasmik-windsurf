"use client";

import React, { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { authFetch } from "@/lib/authFetch";
import { dayOfWeekLabel } from "@/lib/online/slots";
import { supabase } from "@/lib/supabaseClient";
import { getUserWithRecovery } from "@/lib/supabase/clientAuth";
import { useProgramScope } from "@/hooks/useProgramScope";
import { cn } from "@/lib/utils";

type StudentRow = {
  id: string;
  name: string | null;
};

type CourseRow = {
  id: string;
  name: string;
  description: string | null;
  monthly_fee_cents: number | null;
  sessions_per_week: number | null;
  default_slot_duration_minutes?: number | null;
};

type PackageTemplate = {
  slot_template_id: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  available_teachers: number;
};

type PackageOption = {
  course_id: string;
  course_name: string;
  sessions_per_week: number | null;
  monthly_fee_cents: number | null;
  duration_minutes: number;
  templates: PackageTemplate[];
};

type PackageSlot = {
  id: string;
  slot_template_id: string;
  day_of_week_snapshot: number;
  start_time_snapshot: string;
  duration_minutes_snapshot: number;
  status: string;
};

type PackageRow = {
  id: string;
  student_id: string;
  student_name: string;
  course_id: string;
  course_name: string;
  teacher_id: string;
  status: string;
  effective_month: string;
  sessions_per_week: number;
  monthly_fee_cents_snapshot: number;
  hold_expires_at?: string | null;
  slots: PackageSlot[];
};

type ExplorePayload = {
  setup_required?: boolean;
  students: StudentRow[];
  courses: CourseRow[];
  package_options: PackageOption[];
  pending_packages: PackageRow[];
  active_packages: PackageRow[];
  warning?: string;
};

const formatMoney = (value: number | null | undefined) =>
  typeof value === "number" ? `RM ${(value / 100).toFixed(2)}` : "RM 0.00";

const timeLabel = (value: string) => value.slice(0, 5);

const expiresInLabel = (value: string | null | undefined) => {
  if (!value) return "No hold";
  const ms = new Date(value).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const mins = Math.ceil(ms / 60000);
  return `${mins} min left`;
};

const monthLabel = (value: string | null | undefined) => {
  if (!value) return "Current month";
  const normalized = value.length >= 7 ? value.slice(0, 7) : value;
  const [yearRaw, monthRaw] = normalized.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return normalized;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-MY", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
};

const slotSummary = (slots: PackageSlot[]) =>
  [...slots]
    .sort((left, right) => {
      if (left.day_of_week_snapshot !== right.day_of_week_snapshot) {
        return left.day_of_week_snapshot - right.day_of_week_snapshot;
      }
      return left.start_time_snapshot.localeCompare(right.start_time_snapshot);
    })
    .map(
      (slot) =>
        `${dayOfWeekLabel(slot.day_of_week_snapshot)} ${timeLabel(slot.start_time_snapshot)}`
    )
    .join(" • ");

const templateSummary = (templates: PackageTemplate[]) =>
  [...templates]
    .sort((left, right) => {
      if (left.day_of_week !== right.day_of_week) return left.day_of_week - right.day_of_week;
      return left.start_time.localeCompare(right.start_time);
    })
    .map((slot) => `${dayOfWeekLabel(slot.day_of_week)} ${timeLabel(slot.start_time)}`)
    .join(" • ");

export default function ParentOnlinePage() {
  const [parentId, setParentId] = useState<string | null>(null);
  const { programScope } = useProgramScope({ role: "parent", userId: parentId });
  const [payload, setPayload] = useState<ExplorePayload | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const loadExplore = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch("/api/parent/online/explore");
      const data = (await response.json()) as ExplorePayload & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to load online package options");
      }
      setPayload({
        students: data.students ?? [],
        courses: data.courses ?? [],
        package_options: data.package_options ?? [],
        pending_packages: data.pending_packages ?? [],
        active_packages: data.active_packages ?? [],
        setup_required: Boolean(data.setup_required),
        warning: data.warning,
      });
      setSelectedStudentId((current) => {
        if (current && (data.students ?? []).some((student) => student.id === current)) return current;
        return data.students?.[0]?.id ?? "";
      });
      setSelectedCourseId((current) => {
        if (current && (data.package_options ?? []).some((option) => option.course_id === current)) return current;
        return data.package_options?.[0]?.course_id ?? "";
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load data");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      const { data, error: userError } = await getUserWithRecovery(supabase);
      if (!mounted) return;
      if (userError || !data.user) {
        window.location.href = "/login";
        return;
      }
      setParentId(data.user.id);
    };
    void loadUser();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!parentId) return;
    void loadExplore();
  }, [parentId]);

  const selectedCourseOption = useMemo(
    () => payload?.package_options.find((option) => option.course_id === selectedCourseId) ?? null,
    [payload?.package_options, selectedCourseId],
  );

  const requiredSlots = Math.max(selectedCourseOption?.sessions_per_week ?? 1, 1);

  useEffect(() => {
    if (!selectedCourseOption) {
      setSelectedSlotIds([]);
      return;
    }
    const allowedIds = new Set(selectedCourseOption.templates.map((template) => template.slot_template_id));
    setSelectedSlotIds((current) => current.filter((id) => allowedIds.has(id)).slice(0, requiredSlots));
  }, [requiredSlots, selectedCourseOption]);

  const templatesByDay = useMemo(() => {
    if (!selectedCourseOption) return [] as Array<{ day: number; label: string; templates: PackageTemplate[] }>;
    const grouped = new Map<number, PackageTemplate[]>();
    selectedCourseOption.templates.forEach((template) => {
      const list = grouped.get(template.day_of_week) ?? [];
      list.push(template);
      grouped.set(template.day_of_week, list);
    });
    return Array.from(grouped.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([day, templates]) => ({
        day,
        label: dayOfWeekLabel(day),
        templates: [...templates].sort((left, right) => left.start_time.localeCompare(right.start_time)),
      }));
  }, [selectedCourseOption]);

  const selectedStudent = useMemo(
    () => payload?.students.find((student) => student.id === selectedStudentId) ?? null,
    [payload?.students, selectedStudentId],
  );

  const handleToggleSlot = (slotTemplateId: string) => {
    setSelectedSlotIds((current) => {
      if (current.includes(slotTemplateId)) {
        return current.filter((value) => value !== slotTemplateId);
      }
      if (current.length >= requiredSlots) {
        return [...current.slice(1), slotTemplateId];
      }
      return [...current, slotTemplateId];
    });
  };

  const handleHoldPackage = async () => {
    if (!selectedStudentId || !selectedCourseOption) {
      setError("Select a student and course first.");
      return;
    }
    if (selectedSlotIds.length !== requiredSlots) {
      setError(`Select exactly ${requiredSlots} weekly slot(s) before continuing.`);
      return;
    }

    setBusyKey("hold");
    setError(null);
    try {
      const response = await authFetch("/api/parent/online/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: selectedStudentId,
          course_id: selectedCourseOption.course_id,
          slot_template_ids: selectedSlotIds,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to hold weekly package");
      }
      setSelectedSlotIds([]);
      await loadExplore();
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : "Failed to hold weekly package");
    } finally {
      setBusyKey(null);
    }
  };

  const handlePayPackage = async (packageId: string) => {
    setBusyKey(`pay:${packageId}`);
    setError(null);
    try {
      const response = await authFetch("/api/parent/online/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          package_id: packageId,
          payment_reference: `manual-${Date.now()}`,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to confirm payment");
      }
      await loadExplore();
    } catch (payError) {
      setError(payError instanceof Error ? payError.message : "Failed to confirm payment");
    } finally {
      setBusyKey(null);
    }
  };

  const handleReleasePackage = async (packageId: string) => {
    setBusyKey(`release:${packageId}`);
    setError(null);
    try {
      const response = await authFetch("/api/parent/online/claim", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package_id: packageId }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to release package draft");
      }
      await loadExplore();
    } catch (releaseError) {
      setError(releaseError instanceof Error ? releaseError.message : "Failed to release package draft");
    } finally {
      setBusyKey(null);
    }
  };

  if (programScope === "campus") {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar programScope={programScope} />
        <main className="mx-auto max-w-4xl p-6">
          <Card className="p-6">
            <h1 className="text-xl font-semibold text-slate-900">Online Package Picker Unavailable</h1>
            <p className="mt-2 text-sm text-slate-600">
              This parent account is currently scoped to campus programs only.
            </p>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(191,219,254,0.34),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)]">
      <Navbar programScope={programScope} />
      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        <header className="rounded-[28px] border border-slate-200 bg-white/95 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                Online Enrollment
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                Pick weekly package first, then pay
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Select a recurring weekly package, hold the full set of slots atomically, then
                confirm payment to activate next sessions.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={selectedStudentId}
                onChange={(event) => setSelectedStudentId(event.target.value)}
                className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
              >
                {(payload?.students ?? []).map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name ?? "Unnamed student"}
                  </option>
                ))}
              </select>
              <select
                value={selectedCourseId}
                onChange={(event) => setSelectedCourseId(event.target.value)}
                className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
              >
                {(payload?.package_options ?? []).map((option) => (
                  <option key={option.course_id} value={option.course_id}>
                    {option.course_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        {error ? (
          <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</Card>
        ) : null}
        {payload?.warning ? (
          <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{payload.warning}</Card>
        ) : null}
        {payload?.setup_required ? (
          <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Online packages are not configured yet. Please contact the admin team.
          </Card>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
          <Card className="rounded-[28px] border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Weekly package builder</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Choose exactly {requiredSlots} weekly slot(s) for{" "}
                  {selectedStudent?.name ?? "the selected student"}.
                </p>
              </div>
              {selectedCourseOption ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <p className="font-medium text-slate-900">{selectedCourseOption.course_name}</p>
                  <p className="mt-1">
                    {selectedCourseOption.sessions_per_week ?? requiredSlots} session(s)/week •{" "}
                    {selectedCourseOption.duration_minutes} min •{" "}
                    {formatMoney(selectedCourseOption.monthly_fee_cents)}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Package summary</p>
                  <p className="text-sm text-slate-500">
                    {selectedSlotIds.length}/{requiredSlots} selected
                  </p>
                </div>
                <Button
                  onClick={() => void handleHoldPackage()}
                  disabled={
                    loading ||
                    busyKey === "hold" ||
                    !selectedStudentId ||
                    !selectedCourseOption ||
                    selectedSlotIds.length !== requiredSlots
                  }
                >
                  {busyKey === "hold" ? "Holding package..." : "Hold Package"}
                </Button>
              </div>
              <p className="mt-3 text-sm text-slate-600">
                {selectedSlotIds.length === 0
                  ? "No weekly slots selected yet."
                  : templateSummary(
                      selectedCourseOption?.templates.filter((template) =>
                        selectedSlotIds.includes(template.slot_template_id),
                      ) ?? [],
                    )}
              </p>
            </div>

            <div className="mt-5 space-y-4">
              {loading ? (
                <Card className="p-4 text-sm text-slate-500">Loading package options...</Card>
              ) : !selectedCourseOption ? (
                <Card className="p-4 text-sm text-slate-500">No recurring package options available yet.</Card>
              ) : (
                templatesByDay.map((day) => (
                  <div key={day.day} className="rounded-[24px] border border-slate-200 bg-white p-4">
                    <div className="mb-3">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">
                        {day.label}
                      </h3>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {day.templates.map((template) => {
                        const isSelected = selectedSlotIds.includes(template.slot_template_id);
                        const isDisabled = template.available_teachers <= 0 && !isSelected;
                        return (
                          <button
                            key={template.slot_template_id}
                            type="button"
                            disabled={isDisabled}
                            onClick={() => handleToggleSlot(template.slot_template_id)}
                            className={cn(
                              "min-w-[172px] rounded-[24px] border px-4 py-3 text-left transition",
                              isSelected
                                ? "border-slate-900 bg-slate-900 text-white shadow-[0_18px_50px_rgba(15,23,42,0.16)]"
                                : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300",
                              isDisabled && "cursor-not-allowed opacity-45",
                            )}
                          >
                            <p className="text-sm font-semibold">{timeLabel(template.start_time)}</p>
                            <p className={cn("mt-1 text-xs", isSelected ? "text-slate-200" : "text-slate-500")}>
                              {template.duration_minutes} min • {template.available_teachers} teacher(s)
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="rounded-[28px] border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold text-slate-900">Pending payment</h2>
              <p className="mt-1 text-sm text-slate-500">
                Full package hold stays reserved until payment or expiry.
              </p>
              <div className="mt-4 space-y-3">
                {(payload?.pending_packages ?? []).length === 0 ? (
                  <p className="text-sm text-slate-500">No pending package holds.</p>
                ) : (
                  payload?.pending_packages.map((pkg) => (
                    <div key={pkg.id} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{pkg.student_name}</p>
                          <p className="text-xs text-slate-500">
                            {pkg.course_name} • {monthLabel(pkg.effective_month)}
                          </p>
                        </div>
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                          {expiresInLabel(pkg.hold_expires_at)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-slate-600">{slotSummary(pkg.slots)}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        {pkg.sessions_per_week} session(s)/week • {formatMoney(pkg.monthly_fee_cents_snapshot)}
                      </p>
                      <div className="mt-4 flex gap-2">
                        <Button
                          className="h-9 rounded-xl bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700"
                          disabled={busyKey === `pay:${pkg.id}`}
                          onClick={() => void handlePayPackage(pkg.id)}
                        >
                          {busyKey === `pay:${pkg.id}` ? "Paying..." : "Pay Now"}
                        </Button>
                        <Button
                          variant="outline"
                          className="h-9 rounded-xl px-3 text-xs"
                          disabled={busyKey === `release:${pkg.id}`}
                          onClick={() => void handleReleasePackage(pkg.id)}
                        >
                          {busyKey === `release:${pkg.id}` ? "Releasing..." : "Release"}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card className="rounded-[28px] border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold text-slate-900">Active packages</h2>
              <p className="mt-1 text-sm text-slate-500">
                Confirmed recurring packages now powering the weekly schedule.
              </p>
              <div className="mt-4 space-y-3">
                {(payload?.active_packages ?? []).length === 0 ? (
                  <p className="text-sm text-slate-500">No active online packages yet.</p>
                ) : (
                  payload?.active_packages.map((pkg) => (
                    <div key={pkg.id} className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-sm font-semibold text-emerald-900">{pkg.student_name}</p>
                      <p className="text-xs text-emerald-700">
                        {pkg.course_name} • {monthLabel(pkg.effective_month)}
                      </p>
                      <p className="mt-3 text-sm text-emerald-800">{slotSummary(pkg.slots)}</p>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card className="rounded-[28px] border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold text-slate-900">Course guide</h2>
              <div className="mt-4 space-y-3">
                {(payload?.courses ?? []).map((course) => (
                  <div key={course.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">{course.name}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {course.description || "Weekly recurring package with next-month package changes only."}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      {course.sessions_per_week ?? 0} session(s)/week •{" "}
                      {course.default_slot_duration_minutes ?? 30} min •{" "}
                      {formatMoney(course.monthly_fee_cents)}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
