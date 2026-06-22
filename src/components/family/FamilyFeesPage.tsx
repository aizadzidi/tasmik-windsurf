"use client";

import React, { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import { authFetch } from "@/lib/authFetch";
import { dayOfWeekLabel } from "@/lib/online/slots";
import { ONLINE_SELF_SERVICE_ENROLLMENT_ENABLED } from "@/lib/online/selfService";
import { supabase } from "@/lib/supabaseClient";
import { getUserWithRecovery } from "@/lib/supabase/clientAuth";
import { useProgramScope } from "@/hooks/useProgramScope";
import { cn } from "@/lib/utils";
import { Check, ChevronRight, CreditCard, Download } from "lucide-react";
import type { PaymentLineItem, PaymentRecord } from "@/types/payments";

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
  payments: Array<PaymentRecord & { line_items?: PaymentLineItem[] }>;
  online_fee_summary?: {
    pendingPackageCents: number;
    activeMonthlyCents: number;
  };
  warning?: string;
};

const formatMoney = (value: number | null | undefined) =>
  typeof value === "number" ? `RM ${(value / 100).toFixed(2)}` : "RM 0.00";

const timeLabel = (value: string) => value.slice(0, 5);

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

const planActionLabel = (currentAmount: number | null, optionAmount: number | null | undefined) => {
  if (currentAmount === null) return "Select plan";
  return (optionAmount ?? 0) < currentAmount ? "Downgrade" : "Upgrade";
};

const pageBackgroundClass = "min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9]";
const surfaceClass = "rounded-xl bg-white/80 p-6 shadow-lg backdrop-blur-md";
const mutedSurfaceClass = `${surfaceClass} text-sm text-gray-600`;
const tableSurfaceClass = "overflow-hidden rounded-xl bg-white/80 shadow-lg backdrop-blur-md";
// Available plans design is intentionally kept dormant for the future self-service flow.
const SHOW_SELF_SERVICE_AVAILABLE_PLANS = ONLINE_SELF_SERVICE_ENROLLMENT_ENABLED;

export default function FamilyFeesPage() {
  const [parentId, setParentId] = useState<string | null>(null);
  const { programScope } = useProgramScope({ role: "parent", userId: parentId });
  const [payload, setPayload] = useState<ExplorePayload | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
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
        payments: data.payments ?? [],
        online_fee_summary: data.online_fee_summary,
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
      const meta = data.user.user_metadata as { name?: string; phone?: string } | null | undefined;
      setParentId(data.user.id);
      setPayer({
        name: meta?.name ?? data.user.email?.split("@")[0] ?? "",
        email: data.user.email ?? "",
        phone: meta?.phone ?? "",
      });
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
      setError("Select a learner and course first.");
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

      const response = await authFetch("/api/parent/online/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          package_id: packageId,
          idempotencyKey,
          redirectUrl: "/family/fees",
          payer: {
            name: payer.name || "Parent",
            email: payer.email,
            mobile: payer.phone,
          },
        }),
      });
      const data = (await response.json()) as { error?: string; billUrl?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to confirm payment");
      }
      if (!data.billUrl) throw new Error("Payment gateway did not return a checkout URL.");
      window.location.href = data.billUrl;
    } catch (payError) {
      setError(payError instanceof Error ? payError.message : "Failed to confirm payment");
    } finally {
      setBusyKey(null);
    }
  };

  const pendingPayment = useMemo(
    () => payload?.payments.find((payment) => payment.status === "pending" || payment.status === "initiated") ?? null,
    [payload?.payments],
  );

  const refreshPendingStatus = async () => {
    if (!pendingPayment?.billplz_id) return;
    try {
      await authFetch(`/api/payments/${pendingPayment.billplz_id}/refresh`, { method: "GET" });
      await loadExplore();
    } catch (refreshError) {
      console.error("Online payment refresh error", refreshError);
    }
  };

  if (programScope === "campus") {
    return (
      <div className={pageBackgroundClass}>
        <Navbar programScope={programScope} />
        <main className="mx-auto max-w-4xl px-6 py-12">
          <div className={surfaceClass}>
            <h1 className="text-xl font-semibold text-gray-900">Family Online Unavailable</h1>
            <p className="mt-2 text-sm text-gray-600">
              This family account is currently scoped to campus programs only.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const activeForStudent =
    payload?.active_packages.find((pkg) => pkg.student_id === selectedStudentId) ?? null;
  const pendingForStudent =
    payload?.pending_packages.find((pkg) => pkg.student_id === selectedStudentId) ?? null;
  const currentAmount = activeForStudent?.monthly_fee_cents_snapshot ?? null;
  const paymentPackage = pendingForStudent;

  return (
    <div className={pageBackgroundClass}>
      <Navbar programScope={programScope} />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-12 flex items-start justify-between gap-6">
          <div>
            <h1 className="mb-2 text-2xl font-bold text-gray-800">Settings</h1>
            <p className="text-gray-600">Manage your subscription and billing</p>
          </div>
          <select
            value={selectedStudentId}
            onChange={(event) => setSelectedStudentId(event.target.value)}
            className="h-10 rounded-md border border-gray-200 bg-white/80 px-3 text-sm text-gray-700 shadow-sm backdrop-blur-md"
          >
            {(payload?.students ?? []).map((student) => (
              <option key={student.id} value={student.id}>
                {student.name ?? "Unnamed learner"}
              </option>
            ))}
          </select>
        </header>

        {error ? (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        {payload?.warning ? (
          <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            {payload.warning}
          </div>
        ) : null}
        {payload?.setup_required ? (
          <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            Online packages are not configured yet. Please contact the admin team.
          </div>
        ) : null}

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

        {activeTab === "subscription" ? (
          <div className="space-y-8">
            <div className={surfaceClass}>
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="mb-1 flex items-center gap-3">
                    <h2 className="text-xl font-semibold text-gray-900">Current plan</h2>
                    {activeForStudent ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                        Active
                      </span>
                    ) : null}
                  </div>
                  <p className="text-gray-600">{activeForStudent?.course_name ?? "No active plan"}</p>
                </div>
                <div className="text-right">
                  {activeForStudent ? (
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
                ) : (payload?.package_options ?? []).length === 0 ? (
                  <div className={mutedSurfaceClass}>
                    No recurring package options available yet.
                  </div>
                ) : (
                  payload?.package_options.map((option) => {
                    const isSelected = option.course_id === selectedCourseId;
                    const isCurrent = activeForStudent?.course_id === option.course_id;
                    const isPending = pendingForStudent?.course_id === option.course_id;
                    return (
                      <div
                        key={option.course_id}
                        className={cn(
                          `${surfaceClass} transition-colors`,
                          isSelected ? "ring-1 ring-gray-300" : "hover:bg-white",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedCourseId(option.course_id)}
                          className="flex w-full items-start justify-between gap-8 text-left"
                        >
                          <div className="flex-1">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-semibold text-gray-900">{option.course_name}</h3>
                              {isCurrent ? (
                                <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-600">
                                  Current
                                </span>
                              ) : null}
                              {isPending ? (
                                <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
                                  Pending payment
                                </span>
                              ) : null}
                            </div>
                            <p className="mb-4 text-gray-600">
                              {option.sessions_per_week ?? 0} classes per week
                            </p>
                            <ul className="space-y-2">
                              <li className="flex items-center gap-2 text-sm text-gray-600">
                                <Check className="h-4 w-4 text-gray-900" />
                                {option.sessions_per_week ?? 0} live sessions per week
                              </li>
                              <li className="flex items-center gap-2 text-sm text-gray-600">
                                <Check className="h-4 w-4 text-gray-900" />
                                {option.duration_minutes} minutes per session
                              </li>
                              <li className="flex items-center gap-2 text-sm text-gray-600">
                                <Check className="h-4 w-4 text-gray-900" />
                                Progress tracking
                              </li>
                            </ul>
                          </div>
                          <div className="text-right">
                            <div className="mb-2">
                              <span className="text-2xl font-semibold text-gray-900">
                                {formatMoney(option.monthly_fee_cents)}
                              </span>
                              <span className="text-gray-600">/month</span>
                            </div>
                            {!isCurrent ? (
                              <span className="flex items-center justify-end gap-1 text-sm font-medium text-gray-600">
                                {planActionLabel(currentAmount, option.monthly_fee_cents)}
                                <ChevronRight className="h-4 w-4" />
                              </span>
                            ) : null}
                          </div>
                        </button>

                        {isSelected ? (
                          <div className="mt-6 border-t border-gray-200 pt-5">
                            <div className="mb-4 flex items-center justify-between gap-4">
                              <div>
                                <p className="text-sm font-semibold text-gray-900">Weekly slots</p>
                                <p className="text-sm text-gray-600">
                                  {selectedSlotIds.length}/{requiredSlots} selected
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleHoldPackage()}
                                disabled={
                                  loading ||
                                  busyKey === "hold" ||
                                  !selectedStudentId ||
                                  !selectedCourseOption ||
                                  selectedSlotIds.length !== requiredSlots
                                }
                                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {busyKey === "hold" ? "Holding..." : "Hold Package"}
                              </button>
                            </div>
                            <div className="space-y-4">
                              {templatesByDay.map((day) => (
                                <div key={day.day}>
                                  <p className="mb-2 text-sm font-medium text-gray-600">{day.label}</p>
                                  <div className="flex flex-wrap gap-2">
                                    {day.templates.map((template) => {
                                      const isSlotSelected = selectedSlotIds.includes(template.slot_template_id);
                                      const isDisabled = template.available_teachers <= 0 && !isSlotSelected;
                                      return (
                                        <button
                                          key={template.slot_template_id}
                                          type="button"
                                          disabled={isDisabled}
                                          onClick={() => handleToggleSlot(template.slot_template_id)}
                                          className={cn(
                                            "rounded-lg border px-3 py-2 text-sm transition-colors",
                                            isSlotSelected
                                              ? "border-gray-900 bg-gray-900 text-white"
                                              : "border-gray-200 text-gray-600 hover:border-gray-300",
                                            isDisabled && "cursor-not-allowed opacity-40",
                                          )}
                                        >
                                          {timeLabel(template.start_time)}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <p className="mt-4 text-sm text-gray-600">
                              {selectedSlotIds.length === 0
                                ? "No weekly slots selected yet."
                                : templateSummary(
                                    selectedCourseOption?.templates.filter((template) =>
                                      selectedSlotIds.includes(template.slot_template_id),
                                    ) ?? [],
                                  )}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
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
                            activeForStudent?.course_name ??
                            pendingForStudent?.course_name ??
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
