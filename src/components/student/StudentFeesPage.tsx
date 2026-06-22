"use client";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import { authFetch } from "@/lib/authFetch";
import { dayOfWeekLabel } from "@/lib/online/slots";
import { ONLINE_SELF_SERVICE_ENROLLMENT_ENABLED } from "@/lib/online/selfService";
import { getUserWithRecovery } from "@/lib/supabase/clientAuth";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { Check, CreditCard, Download } from "lucide-react";
import type { PaymentLineItem, PaymentRecord } from "@/types/payments";

type StudentRow = { id: string; name: string | null };
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
  student: StudentRow | null;
  package_options: PackageOption[];
  pending_packages: PackageRow[];
  active_packages: PackageRow[];
  payments: Array<PaymentRecord & { line_items?: PaymentLineItem[] }>;
  online_fee_summary?: {
    pendingPackageCents: number;
    activeMonthlyCents: number;
  };
};

const formatMoney = (value: number | null | undefined) =>
  typeof value === "number" ? `RM ${(value / 100).toFixed(2)}` : "RM 0.00";

const timeLabel = (value: string) => value.slice(0, 5);
const classHourOptions = Array.from({ length: 12 }, (_, index) => String(index + 1));
const classMinuteOptions = ["00", "30"] as const;
const classPeriodOptions = ["AM", "PM"] as const;
type ClassPeriod = (typeof classPeriodOptions)[number];

const toStartTime = (hourValue: string, minuteValue: string, period: ClassPeriod) => {
  const hour = Number(hourValue);
  if (!Number.isInteger(hour) || hour < 1 || hour > 12) return "";
  const normalizedHour = (hour % 12) + (period === "PM" ? 12 : 0);
  return `${String(normalizedHour).padStart(2, "0")}:${minuteValue}:00`;
};

const flexibleTimeLabel = (hourValue: string, minuteValue: string, period: ClassPeriod) =>
  `${hourValue}:${minuteValue} ${period}`;

const templateSummary = (templates: PackageTemplate[]) =>
  [...templates]
    .sort((left, right) => {
      if (left.day_of_week !== right.day_of_week) return left.day_of_week - right.day_of_week;
      return left.start_time.localeCompare(right.start_time);
    })
    .map((slot) => `${dayOfWeekLabel(slot.day_of_week)} ${timeLabel(slot.start_time)}`)
    .join(" • ");

const formatDate = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "-";

const nextBillingDate = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const statusClass = (status: PaymentRecord["status"]) => {
  if (status === "paid") return "text-green-700";
  if (status === "pending" || status === "initiated") return "text-yellow-700";
  if (status === "failed" || status === "expired") return "text-red-700";
  return "text-gray-600";
};

const statusLabel = (status: PaymentRecord["status"]) => {
  if (status === "paid") return "Success";
  if (status === "initiated") return "Pending";
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const pageBackgroundClass = "min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9]";
const surfaceClass = "rounded-xl bg-white/80 p-6 shadow-lg backdrop-blur-md";
const mutedSurfaceClass = `${surfaceClass} text-sm text-gray-600`;
const tableSurfaceClass = "overflow-hidden rounded-xl bg-white/80 shadow-lg backdrop-blur-md";
// Available plans design is intentionally kept dormant for the future self-service flow.
const SHOW_SELF_SERVICE_AVAILABLE_PLANS = ONLINE_SELF_SERVICE_ENROLLMENT_ENABLED;

export default function StudentFeesPage() {
  const [payload, setPayload] = useState<ExplorePayload | null>(null);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [selectedHour, setSelectedHour] = useState("12");
  const [selectedMinute, setSelectedMinute] = useState<(typeof classMinuteOptions)[number]>("00");
  const [selectedPeriod, setSelectedPeriod] = useState<ClassPeriod>("PM");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [payer, setPayer] = useState({ name: "", email: "", phone: "" });
  const [checkoutKeys, setCheckoutKeys] = useState<Record<string, string>>({});
  const tabs = [
    { id: "subscription", label: "Subscription" },
    { id: "billing", label: "Billing history" },
    { id: "payment", label: "Make payment" },
  ] as const;
  type TabId = (typeof tabs)[number]["id"];
  const [activeTab, setActiveTab] = useState<TabId>("subscription");

  const loadExplore = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch("/api/student/online/explore");
      const data = (await response.json()) as ExplorePayload & { error?: string };
      if (!response.ok) throw new Error(data.error || "Failed to load online packages");
      setPayload({
        student: data.student ?? null,
        package_options: data.package_options ?? [],
        pending_packages: data.pending_packages ?? [],
        active_packages: data.active_packages ?? [],
        payments: data.payments ?? [],
        online_fee_summary: data.online_fee_summary,
        setup_required: Boolean(data.setup_required),
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
      const meta = data.user.user_metadata as { name?: string; phone?: string } | null | undefined;
      setPayer({
        name: meta?.name ?? data.user.email?.split("@")[0] ?? "",
        email: data.user.email ?? "",
        phone: meta?.phone ?? "",
      });
      await loadExplore();
    };
    void loadUser();
    return () => {
      mounted = false;
    };
  }, []);

  const packageOptions = useMemo(
    () =>
      [...(payload?.package_options ?? [])].sort((left, right) => {
        const leftSessions = left.sessions_per_week ?? 0;
        const rightSessions = right.sessions_per_week ?? 0;
        if (leftSessions !== rightSessions) return leftSessions - rightSessions;
        return (left.monthly_fee_cents ?? 0) - (right.monthly_fee_cents ?? 0);
      }),
    [payload?.package_options],
  );

  const supportedDayCounts = useMemo(
    () =>
      new Set(
        packageOptions
          .map((option) => option.sessions_per_week ?? 0)
          .filter((count) => count > 0),
      ),
    [packageOptions],
  );

  const maxSelectableDays = useMemo(
    () => Math.max(0, ...Array.from(supportedDayCounts)),
    [supportedDayCounts],
  );

  const selectedCourseOption = useMemo(() => {
    if (selectedDays.length === 0) return null;
    return (
      packageOptions.find((option) => (option.sessions_per_week ?? 0) === selectedDays.length) ??
      null
    );
  }, [packageOptions, selectedDays.length]);

  const availableDayOptions = useMemo(() => {
    const days = new Map<number, boolean>();
    packageOptions.forEach((option) => {
      option.templates.forEach((template) => {
        const hasAvailableTeacher = template.available_teachers > 0;
        days.set(template.day_of_week, (days.get(template.day_of_week) ?? false) || hasAvailableTeacher);
      });
    });

    return Array.from(days.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([day, hasAvailableTemplate]) => ({
        day,
        hasAvailableTemplate,
        label: dayOfWeekLabel(day),
      }));
  }, [packageOptions]);

  useEffect(() => {
    const allowedDays = new Set(availableDayOptions.map((option) => option.day));
    setSelectedDays((current) => {
      const next = current
        .filter((day) => allowedDays.has(day))
        .slice(0, maxSelectableDays);
      if (next.length === current.length && next.every((day, index) => day === current[index])) {
        return current;
      }
      return next;
    });
  }, [availableDayOptions, maxSelectableDays]);

  const selectedStartTime = useMemo(
    () => toStartTime(selectedHour, selectedMinute, selectedPeriod),
    [selectedHour, selectedMinute, selectedPeriod],
  );

  const pendingPayment = useMemo(
    () => payload?.payments.find((payment) => payment.status === "pending" || payment.status === "initiated") ?? null,
    [payload?.payments],
  );

  const selectedSlotIds = useMemo(() => {
    if (!selectedCourseOption || selectedDays.length === 0 || !selectedStartTime) return [];

    const templates = selectedDays.map((day) =>
      selectedCourseOption.templates.find(
        (template) =>
          template.day_of_week === day &&
          template.start_time === selectedStartTime &&
          template.available_teachers > 0,
      ),
    );

    if (templates.some((template) => !template)) return [];
    return templates.map((template) => template!.slot_template_id);
  }, [selectedCourseOption, selectedDays, selectedStartTime]);
  const selectedTemplates = useMemo(() => {
    if (!selectedCourseOption || selectedSlotIds.length === 0) return [] as PackageTemplate[];
    const selectedIds = new Set(selectedSlotIds);
    return selectedCourseOption.templates.filter((template) =>
      selectedIds.has(template.slot_template_id),
    );
  }, [selectedCourseOption, selectedSlotIds]);
  const selectedDayCount = selectedDays.length;
  const displayDuration = selectedCourseOption?.duration_minutes ?? packageOptions[0]?.duration_minutes ?? 30;
  const displayPlanTitle =
    selectedCourseOption?.course_name ??
    (selectedDayCount > 0 ? `${selectedDayCount}x - Custom` : "Custom weekly plan");
  const canHoldPackage =
    !loading &&
    busyKey !== "hold" &&
    Boolean(selectedCourseOption) &&
    selectedDayCount > 0 &&
    selectedSlotIds.length === selectedDayCount;

  const handleToggleDay = (day: number) => {
    setSelectedDays((current) => {
      if (current.includes(day)) return current.filter((value) => value !== day);
      if (!supportedDayCounts.has(current.length + 1)) return current;
      return [...current, day].sort((left, right) => left - right);
    });
  };

  const handleHoldPackage = async () => {
    if (!selectedCourseOption || selectedDayCount === 0) {
      setError("Select at least one class day before continuing.");
      return;
    }
    if (selectedSlotIds.length !== selectedDayCount) {
      setError("Select a class time that is available for every selected day.");
      return;
    }
    setBusyKey("hold");
    setError(null);
    try {
      const response = await authFetch("/api/student/online/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: selectedCourseOption.course_id,
          slot_template_ids: selectedSlotIds,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Failed to hold weekly package");
      setSelectedDays([]);
      setSelectedHour("12");
      setSelectedMinute("00");
      setSelectedPeriod("PM");
      await loadExplore();
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : "Failed to hold weekly package");
    } finally {
      setBusyKey(null);
    }
  };

  const handlePayPackage = async (packageId: string) => {
    if (!payer.email || !payer.phone) {
      setError("Enter payer email and phone number before paying.");
      return;
    }
    setBusyKey(`pay:${packageId}`);
    setError(null);
    try {
      const idempotencyKey =
        checkoutKeys[packageId] ??
        (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
      setCheckoutKeys((current) => ({ ...current, [packageId]: idempotencyKey }));
      const response = await authFetch("/api/student/online/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          package_id: packageId,
          idempotencyKey,
          redirectUrl: "/student/fees",
          payer: {
            name: payer.name || payload?.student?.name || "Student",
            email: payer.email,
            mobile: payer.phone,
          },
        }),
      });
      const data = (await response.json()) as { error?: string; billUrl?: string };
      if (!response.ok) throw new Error(data.error || "Failed to create payment checkout");
      if (!data.billUrl) throw new Error("Payment gateway did not return a checkout URL.");
      window.location.href = data.billUrl;
    } catch (payError) {
      setError(payError instanceof Error ? payError.message : "Failed to create payment checkout");
    } finally {
      setBusyKey(null);
    }
  };

  const refreshPendingStatus = async () => {
    if (!pendingPayment?.billplz_id) return;
    await authFetch(`/api/payments/${pendingPayment.billplz_id}/refresh`, { method: "GET" });
    await loadExplore();
  };

  const currentPackage = payload?.active_packages[0] ?? null;
  const pendingPackage = payload?.pending_packages[0] ?? null;
  const currentAmount = currentPackage?.monthly_fee_cents_snapshot ?? null;
  const paymentPackage = payload?.pending_packages[0] ?? null;

  return (
    <div className={pageBackgroundClass}>
      <Navbar programScope="online" />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-12">
          <h1 className="mb-2 text-2xl font-bold text-gray-800">Settings</h1>
          <p className="text-gray-600">Manage your subscription and billing</p>
        </header>

        <div className="mb-8 flex gap-6 border-b border-gray-200">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative px-1 pb-3 text-sm font-medium transition-colors",
                  isActive ? "text-gray-900" : "text-gray-600 hover:text-gray-900",
                )}
              >
                {tab.label}
                {isActive ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-gray-900" /> : null}
              </button>
            );
          })}
        </div>

        {error ? (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        {payload?.setup_required ? (
          <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            Online packages are not configured yet. Please contact the admin team.
          </div>
        ) : null}

        {activeTab === "subscription" ? (
          <div className="space-y-8">
            <div className={surfaceClass}>
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="mb-1 flex items-center gap-3">
                    <h2 className="text-xl font-semibold text-gray-900">Current plan</h2>
                    {currentPackage ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                        Active
                      </span>
                    ) : null}
                  </div>
                  <p className="text-gray-600">{currentPackage?.course_name ?? "No active plan"}</p>
                </div>
                <div className="text-right">
                  {currentPackage ? (
                    <>
                      <div className="mb-1">
                        <span className="font-semibold text-gray-900">{formatMoney(currentAmount)}</span>
                        <span className="text-gray-600">/month</span>
                      </div>
                      <p className="text-sm text-gray-600">Next billing on {nextBillingDate()}</p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-600">No billing scheduled</p>
                  )}
                </div>
              </div>
            </div>

            {SHOW_SELF_SERVICE_AVAILABLE_PLANS ? (
              <div>
              <h2 className="mb-6 text-xl font-semibold text-gray-900">Available plans</h2>
              <div className="space-y-4">
                {loading ? (
                  <div className={mutedSurfaceClass}>
                    Loading package options...
                  </div>
                ) : packageOptions.length === 0 ? (
                  <div className={mutedSurfaceClass}>
                    No recurring package options available yet.
                  </div>
                ) : (
                  <div className={`${surfaceClass} ring-1 ring-gray-200`}>
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-gray-900">{displayPlanTitle}</h3>
                          {selectedCourseOption &&
                          currentPackage?.course_id === selectedCourseOption.course_id ? (
                            <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-600">
                              Current
                            </span>
                          ) : null}
                          {selectedCourseOption &&
                          pendingPackage?.course_id === selectedCourseOption.course_id ? (
                            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
                              Pending payment
                            </span>
                          ) : null}
                        </div>
                        <p className="mb-4 text-gray-600">
                          {selectedDayCount} {selectedDayCount === 1 ? "class" : "classes"} per week
                        </p>
                        <ul className="space-y-2">
                          <li className="flex items-center gap-2 text-sm text-gray-600">
                            <Check className="h-4 w-4 text-gray-900" />
                            {selectedDayCount} live {selectedDayCount === 1 ? "session" : "sessions"} per week
                          </li>
                          <li className="flex items-center gap-2 text-sm text-gray-600">
                            <Check className="h-4 w-4 text-gray-900" />
                            {displayDuration} minutes per session
                          </li>
                          <li className="flex items-center gap-2 text-sm text-gray-600">
                            <Check className="h-4 w-4 text-gray-900" />
                            Progress tracking
                          </li>
                        </ul>
                      </div>
                      <div className="lg:text-right">
                        <div>
                          <span className="text-2xl font-semibold text-gray-900">
                            {formatMoney(selectedCourseOption?.monthly_fee_cents)}
                          </span>
                          <span className="text-gray-600">/month</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 border-t border-gray-200 pt-5">
                      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Weekly slots</p>
                          <p className="text-sm text-gray-600">
                            {selectedDayCount}/{maxSelectableDays} days selected
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleHoldPackage()}
                          disabled={!canHoldPackage}
                          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {busyKey === "hold" ? "Holding..." : "Hold Package"}
                        </button>
                      </div>

                      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
                        <div>
                          <p className="mb-2 text-sm font-medium text-gray-700">Class days</p>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {availableDayOptions.map((day) => {
                              const isChecked = selectedDays.includes(day.day);
                              const cannotAddMore = !supportedDayCounts.has(selectedDayCount + 1);
                              const isDisabled =
                                !isChecked && (!day.hasAvailableTemplate || cannotAddMore);

                              return (
                                <label
                                  key={day.day}
                                  className={cn(
                                    "flex h-10 items-center gap-2 rounded-md border px-3 text-sm transition-colors",
                                    isChecked
                                      ? "border-gray-900 bg-gray-50 text-gray-900"
                                      : "border-gray-200 text-gray-600 hover:border-gray-300",
                                    isDisabled && "cursor-not-allowed opacity-40 hover:border-gray-200",
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    disabled={isDisabled}
                                    onChange={() => handleToggleDay(day.day)}
                                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                  />
                                  <span>{day.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <p className="text-sm font-medium text-gray-700">Class time</p>
                          <div className="mt-2 grid grid-cols-[1fr_auto_1fr_1fr] items-center gap-2">
                            <select
                              value={selectedHour}
                              onChange={(event) => setSelectedHour(event.target.value)}
                              className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm font-normal text-gray-900 outline-none transition focus:border-gray-400"
                            >
                              {classHourOptions.map((hour) => (
                                <option key={hour} value={hour}>
                                  {hour}
                                </option>
                              ))}
                            </select>
                            <span className="text-center text-sm font-semibold text-gray-500">:</span>
                            <select
                              value={selectedMinute}
                              onChange={(event) =>
                                setSelectedMinute(event.target.value as (typeof classMinuteOptions)[number])
                              }
                              className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm font-normal text-gray-900 outline-none transition focus:border-gray-400"
                            >
                              {classMinuteOptions.map((minute) => (
                                <option key={minute} value={minute}>
                                  {minute}
                                </option>
                              ))}
                            </select>
                            <select
                              value={selectedPeriod}
                              onChange={(event) => setSelectedPeriod(event.target.value as ClassPeriod)}
                              className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm font-normal text-gray-900 outline-none transition focus:border-gray-400"
                            >
                              {classPeriodOptions.map((period) => (
                                <option key={period} value={period}>
                                  {period}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      <p className="mt-4 text-sm text-gray-600">
                        {selectedDayCount === 0
                          ? "No weekly slots selected yet."
                          : selectedTemplates.length === selectedDayCount
                            ? templateSummary(selectedTemplates)
                            : `${flexibleTimeLabel(
                                selectedHour,
                                selectedMinute,
                                selectedPeriod,
                              )} is not available for every selected day yet.`}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === "billing" ? (
          <div>
            <h2 className="mb-6 text-xl font-semibold text-gray-900">Billing history</h2>
            <div className={tableSurfaceClass}>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-white/70">
                    <th className="px-6 py-3 text-left text-sm font-normal text-gray-600">Date</th>
                    <th className="px-6 py-3 text-left text-sm font-normal text-gray-600">Description</th>
                    <th className="px-6 py-3 text-left text-sm font-normal text-gray-600">Amount</th>
                    <th className="px-6 py-3 text-left text-sm font-normal text-gray-600">Status</th>
                    <th className="px-6 py-3 text-right text-sm font-normal text-gray-600">Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {(payload?.payments ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-5 text-sm text-gray-600">
                        No payment records yet.
                      </td>
                    </tr>
                  ) : (
                    payload?.payments.map((payment, index, items) => (
                      <tr
                        key={payment.id}
                        className={cn(index !== items.length - 1 && "border-b border-gray-200")}
                      >
                        <td className="px-6 py-4 text-sm">{formatDate(payment.created_at)}</td>
                        <td className="px-6 py-4 text-sm">
                          {payment.line_items?.[0]?.label ??
                            currentPackage?.course_name ??
                            pendingPackage?.course_name ??
                            "Online package"}
                        </td>
                        <td className="px-6 py-4 text-sm">{formatMoney(payment.total_amount_cents)}</td>
                        <td className={cn("px-6 py-4 text-sm", statusClass(payment.status))}>
                          {statusLabel(payment.status)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {payment.redirect_url ? (
                            <button
                              type="button"
                              onClick={() => window.open(payment.redirect_url!, "_blank")}
                              className="ml-auto flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
                            >
                              <Download className="h-4 w-4" />
                              Download
                            </button>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {activeTab === "payment" ? (
          <div className="max-w-2xl">
            <h2 className="mb-6 text-xl font-semibold text-gray-900">Make a payment</h2>

            <div className={cn(surfaceClass, "mb-6")}>
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="mb-1 text-lg font-semibold text-gray-900">Payment details</h3>
                  <p className="text-sm text-gray-600">Secure payment via Billplz</p>
                </div>
                <CreditCard className="h-5 w-5 text-gray-600" />
              </div>

              <div className="mb-6 grid gap-3 sm:grid-cols-3">
                <label className="text-sm font-medium text-gray-700">
                  Name
                  <input
                    value={payer.name}
                    onChange={(event) =>
                      setPayer((current) => ({ ...current, name: event.target.value }))
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white/80 px-3 text-sm font-normal text-gray-900 shadow-sm outline-none transition focus:border-gray-400"
                    placeholder="Payer name"
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Email
                  <input
                    type="email"
                    value={payer.email}
                    onChange={(event) =>
                      setPayer((current) => ({ ...current, email: event.target.value }))
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white/80 px-3 text-sm font-normal text-gray-900 shadow-sm outline-none transition focus:border-gray-400"
                    placeholder="email@example.com"
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Phone
                  <input
                    type="tel"
                    value={payer.phone}
                    onChange={(event) =>
                      setPayer((current) => ({ ...current, phone: event.target.value }))
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white/80 px-3 text-sm font-normal text-gray-900 shadow-sm outline-none transition focus:border-gray-400"
                    placeholder="+60123456789"
                  />
                </label>
              </div>

              <div className="mb-6 space-y-3">
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">Plan</span>
                  <span>{paymentPackage?.course_name ?? "No package held"}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">Billing period</span>
                  <span>Monthly</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">Next billing date</span>
                  <span>{paymentPackage ? nextBillingDate() : "-"}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-3">
                  <span>Amount due</span>
                  <span className="text-xl font-semibold">
                    {formatMoney(paymentPackage?.monthly_fee_cents_snapshot)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => paymentPackage && void handlePayPackage(paymentPackage.id)}
                disabled={!paymentPackage || busyKey === `pay:${paymentPackage?.id}`}
                className="w-full rounded-lg bg-gray-900 py-3 font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {!paymentPackage
                  ? "Hold a package first"
                  : busyKey === `pay:${paymentPackage.id}`
                    ? "Processing..."
                    : `Pay ${formatMoney(paymentPackage.monthly_fee_cents_snapshot)} with Billplz`}
              </button>
            </div>

            {pendingPayment ? (
              <button
                type="button"
                onClick={() => void refreshPendingStatus()}
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Refresh payment status
              </button>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}
