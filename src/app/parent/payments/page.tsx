"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Navbar from "@/components/Navbar";
import { supabase } from "@/lib/supabaseClient";
import { FamilyFeeSelector } from "@/components/payments/FamilyFeeSelector";
import { PaymentBreakdown } from "@/components/payments/PaymentBreakdown";
import { PaymentStatusBanner } from "@/components/payments/PaymentStatusBanner";
import { PaymentHistory } from "@/components/payments/PaymentHistory";
import { OutstandingBalanceCard } from "@/components/payments/OutstandingBalanceCard";
import type {
  ChildFeeAssignment,
  FeeCatalogItem,
  ParentOutstandingBreakdown,
  PaymentLineItem,
  PaymentRecord
} from "@/types/payments";
import type {
  FamilyFeeItem,
  FeeSelectionState,
  MonthOption,
  OutstandingChildSummary,
  OutstandingTarget
} from "@/components/payments/types";
import { MERCHANT_FEE_CENTS, buildPaymentPreview } from "@/lib/payments/pricingUtils";
import type { PaymentCartItem } from "@/types/payments";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { CheckCircle2 } from "lucide-react";

interface RawAssignment extends ChildFeeAssignment {
  fee?: FeeCatalogItem;
  child?: {
    id: string;
    name: string;
  };
  assignmentKey?: string;
  isSynthetic?: boolean;
}

interface ParentProfile {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

type PaymentWithItems = PaymentRecord & { line_items?: PaymentLineItem[] };

function buildMonthOptions(count = 6): MonthOption[] {
  const now = new Date();
  const options: MonthOption[] = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    options.push({
      key,
      label: date.toLocaleDateString("en-MY", { month: "short", year: "numeric" })
    });
  }
  return options;
}

function parseMonthKey(monthKey?: string | null) {
  if (!monthKey) return null;
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  const date = new Date(year, month - 1, 1);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatMonthLabel(monthKey: string | null) {
  if (!monthKey) return null;
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey;
  const date = new Date(year, month - 1, 1);
  return Number.isNaN(date.getTime())
    ? monthKey
    : date.toLocaleDateString("ms-MY", { month: "short", year: "numeric" });
}

function getEarliestOutstandingTarget(
  ledger: ParentOutstandingBreakdown | null,
  childLookup: Record<string, string>
): OutstandingTarget | null {
  if (!ledger || !Array.isArray(ledger.childBreakdown)) return null;
  let target: OutstandingTarget | null = null;

  ledger.childBreakdown.forEach(child => {
    (child.dueMonths ?? []).forEach(monthKey => {
      if (!target || monthKey < target.monthKey) {
        const childId = child.childId ?? "manual-adjustment";
        target = {
          childId,
          childName: child.childName ?? childLookup[childId] ?? "Anak",
          monthKey
        };
      }
    });
  });

  return target;
}

function getCustomAmountForParent(
  fee: FeeCatalogItem | undefined,
  parentUserId?: string | null
): number | null {
  if (!fee || !parentUserId) return null;
  const overrides = Array.isArray(fee.metadata?.customAmounts) ? fee.metadata?.customAmounts : [];
  const match = overrides.find((entry) => entry?.userId === parentUserId);
  if (!match) {
    return null;
  }

  const amount = Number(match.amountCents);
  return Number.isFinite(amount) ? amount : null;
}

export default function ParentPaymentsPage() {
  const [loading, setLoading] = useState(true);
  const [parentId, setParentId] = useState<string | null>(null);
  const [parentProfile, setParentProfile] = useState<ParentProfile>({});
  const [contactInputs, setContactInputs] = useState({
    name: "",
    email: "",
    phone: ""
  });
  const [children, setChildren] = useState<{ id: string; name: string }[]>([]);
  const [assignments, setAssignments] = useState<RawAssignment[]>([]);
  const [payments, setPayments] = useState<PaymentWithItems[]>([]);
  const [selections, setSelections] = useState<Record<string, FeeSelectionState>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [contactSaveStatus, setContactSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [contactAttention, setContactAttention] = useState(false);
  const paymentSectionRef = useRef<HTMLDivElement | null>(null);
  const contactSectionRef = useRef<HTMLLabelElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const [outstandingLedger, setOutstandingLedger] = useState<ParentOutstandingBreakdown | null>(null);
  const [outstandingLedgerLoading, setOutstandingLedgerLoading] = useState(false);
  const [outstandingSelection, setOutstandingSelection] = useState<OutstandingTarget | null>(null);
  const outstandingSelectionActive = !!outstandingSelection;
  const childCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const tabs = [
    { id: "payment", label: "Payments", description: "Select fees and review the bill summary." },
    { id: "history", label: "Payment History", description: "Track past transactions and statuses." }
  ] as const;
  type TabId = (typeof tabs)[number]["id"];
  const [activeTab, setActiveTab] = useState<TabId>("payment");

  const monthOptions = useMemo(() => {
    const base = buildMonthOptions(8);
    if (outstandingSelection?.monthKey && !base.some(opt => opt.key === outstandingSelection.monthKey)) {
      const label = formatMonthLabel(outstandingSelection.monthKey) || outstandingSelection.monthKey;
      const injected = { key: outstandingSelection.monthKey, label };
      return [...base, injected].sort((a, b) => a.key.localeCompare(b.key));
    }
    return base;
  }, [outstandingSelection?.monthKey]);

  const isContactComplete = Boolean(contactInputs.email && contactInputs.phone);

  // Auto-save contact info to Supabase auth metadata so it persists across sessions
  useEffect(() => {
    if (!parentId) return;
    const hasSomeContact = Boolean(contactInputs.email || contactInputs.phone || contactInputs.name);
    if (!hasSomeContact) return;
    const timer = setTimeout(async () => {
      try {
        setContactSaveStatus("saving");
        const { error: updateError } = await supabase.auth.updateUser({
          data: {
            name: contactInputs.name,
            email: contactInputs.email,
            phone: contactInputs.phone
          }
        });
        if (updateError) throw updateError;
        setContactSaveStatus("saved");
        setTimeout(() => setContactSaveStatus("idle"), 1500);
      } catch (err) {
        console.error("Failed to save contact info", err);
        setContactSaveStatus("error");
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [contactInputs, parentId]);

  const focusContactSection = useCallback(() => {
    contactSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    requestAnimationFrame(() => {
      phoneInputRef.current?.focus();
      setContactAttention(true);
      setTimeout(() => setContactAttention(false), 900);
    });
  }, []);

  const registerChildRef = useCallback((childId: string, node: HTMLDivElement | null) => {
    childCardRefs.current[childId] = node;
  }, []);

  const scrollToOutstandingSection = useCallback(
    (childId: string) => {
      requestAnimationFrame(() => {
        const targetEl = childCardRefs.current[childId];
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        setTimeout(() => {
          summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 250);
      });
    },
    []
  );

  const applyCustomAmounts = useCallback(
    (assignmentList: RawAssignment[]): RawAssignment[] => {
      if (!parentId) return assignmentList;
      return assignmentList.map((assignment) => {
        if (
          assignment.custom_amount_cents !== null &&
          assignment.custom_amount_cents !== undefined
        ) {
          return assignment;
        }
        const customAmount = getCustomAmountForParent(assignment.fee, parentId);
        if (customAmount === null) {
          return assignment;
        }
        return { ...assignment, custom_amount_cents: customAmount };
      });
    },
    [parentId]
  );

  useEffect(() => {
    async function bootstrap() {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data?.user) {
        setError("Please log in again.");
        setLoading(false);
        return;
      }
      setParentId(data.user.id);
      const meta = data.user.user_metadata as { name?: string; phone?: string } | null | undefined;
      setParentProfile({
        name: meta?.name || data.user.email?.split("@")[0],
        phone: meta?.phone || "",
        email: data.user.email
      });
    }
    bootstrap();
  }, []);

  useEffect(() => {
    setContactInputs({
      name: parentProfile.name ?? "",
      email: parentProfile.email ?? "",
      phone: parentProfile.phone ?? ""
    });
  }, [parentProfile]);

  const fetchParentProfile = useCallback(
    async (userId: string) => {
      const { data } = await supabase
        .from("users")
        .select("name, email")
        .eq("id", userId)
        .maybeSingle();
      if (data) {
        setParentProfile(prev => ({
          name: data.name ?? prev.name,
          email: data.email ?? prev.email,
          phone: prev.phone // phone is solely sourced from auth metadata for now
        }));
      }
    },
    []
  );

  const refreshOutstandingLedger = useCallback(async (parentIdValue: string) => {
    setOutstandingLedgerLoading(true);
    try {
      const response = await fetch(`/api/parent/payments/outstanding?parentId=${parentIdValue}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to fetch outstanding balance.");
      }
      setOutstandingLedger(payload as ParentOutstandingBreakdown);
    } catch (ledgerError) {
      console.error("Failed to fetch outstanding ledger", ledgerError);
      setOutstandingLedger(null);
    } finally {
      setOutstandingLedgerLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!parentId) return;
    setLoading(true);
    setError(null);

    try {
      await fetchParentProfile(parentId);

      const { data: childRows, error: childError } = await supabase
        .from("students")
        .select("id, name")
        .neq("record_type", "prospect")
        .eq("parent_id", parentId)
        .order("name", { ascending: true });

      if (childError) throw childError;

      setChildren(childRows ?? []);
      const childIds = (childRows ?? []).map(child => child.id);

      if (childIds.length === 0) {
        setAssignments([]);
        setPayments([]);
        await refreshOutstandingLedger(parentId);
        return;
      }

      const [{ data: assignmentRows, error: assignmentError }, { data: paymentRows, error: paymentError }] =
        await Promise.all([
          supabase
            .from("child_fee_assignments")
            .select("*, fee:payment_fee_catalog(*), child:students(id, name)")
            .in("child_id", childIds)
            .eq("is_active", true),
          supabase
            .from("payments")
            .select(
              "id,parent_id,status,currency,total_amount_cents,merchant_fee_cents,redirect_url,billplz_id,created_at,paid_at,line_items:payment_line_items(id,label,metadata,child_id,fee_id)"
            )
            .eq("parent_id", parentId)
            .order("created_at", { ascending: false })
            .limit(5)
        ]);

      if (assignmentError) throw assignmentError;
      if (paymentError) throw paymentError;

      let effectiveAssignments: RawAssignment[] = assignmentRows ?? [];

      if ((!effectiveAssignments || effectiveAssignments.length === 0) && (childRows?.length ?? 0) > 0) {
        const { data: feeCatalog } = await supabase
          .from("payment_fee_catalog")
          .select("*")
          .eq("is_active", true);

        if (feeCatalog && feeCatalog.length > 0) {
          effectiveAssignments = childRows!.flatMap((child) =>
            feeCatalog.map((fee) => ({
              id: `${child.id}_${fee.id}`,
              assignmentKey: `${child.id}_${fee.id}`,
              child_id: child.id,
              fee_id: fee.id,
              custom_amount_cents: null,
              effective_months: [],
              notes: null,
              is_active: true,
              fee,
              child,
              isSynthetic: true,
            }))
          );
        }
      } else {
        effectiveAssignments = effectiveAssignments.map((assignment) => ({
          ...assignment,
          assignmentKey: assignment.id ?? `${assignment.child_id}_${assignment.fee_id}`,
        }));
      }

      const assignmentsWithCustomAmounts = applyCustomAmounts(effectiveAssignments);
      setAssignments(assignmentsWithCustomAmounts);
      setPayments((paymentRows ?? []) as PaymentWithItems[]);
      await refreshOutstandingLedger(parentId);
    } catch (err: unknown) {
      console.error("Failed to load payments data", err);
      setError(err instanceof Error ? err.message : "Failed to load payment data");
    } finally {
      setLoading(false);
    }
  }, [applyCustomAmounts, parentId, fetchParentProfile, refreshOutstandingLedger]);

  useEffect(() => {
    if (!parentId) return;
    loadData();
  }, [parentId, loadData]);

  useEffect(() => {
    if (!outstandingLedger || (outstandingLedger.totalOutstandingCents ?? 0) <= 0) {
      setOutstandingSelection(null);
    }
  }, [outstandingLedger]);

  useEffect(() => {
    if (!assignments.length) return;
    setSelections(prev => {
      const next: Record<string, FeeSelectionState> = { ...prev };
      assignments.forEach(assignment => {
        const key = assignment.assignmentKey ?? assignment.id ?? `${assignment.child_id}_${assignment.fee_id}`;
        if (!next[key]) {
          const months = assignment.fee?.billing_cycle === "monthly" ? [] : [];
          next[key] = { include: false, months, quantity: 1 };
        }
      });
      Object.keys(next).forEach(key => {
        if (!assignments.find(assignment => (assignment.assignmentKey ?? assignment.id ?? `${assignment.child_id}_${assignment.fee_id}`) === key)) {
          delete next[key];
        }
      });
      return next;
    });
  }, [assignments]);

  const childLookup = useMemo(
    () => Object.fromEntries(children.map(child => [child.id, child.name])),
    [children]
  );

  const outstandingSummary = useMemo(() => {
    const defaultSummary = {
      totalCents: outstandingLedger?.totalOutstandingCents ?? 0,
      earliestDueMonth: outstandingLedger?.earliestDueMonth ?? null,
      childSummaries: [] as OutstandingChildSummary[]
    };
    if (!outstandingLedger) {
      return defaultSummary;
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let earliestMonth: string | null = outstandingLedger.earliestDueMonth ?? null;

    const childSummaries: OutstandingChildSummary[] = outstandingLedger.childBreakdown
      .filter(child => child.outstandingCents !== 0)
      .map(child => {
        const months = [...(child.dueMonths ?? [])].sort();
        months.forEach(monthKey => {
          if (!earliestMonth || monthKey < earliestMonth) {
            earliestMonth = monthKey;
          }
        });
        let status: OutstandingChildSummary["status"] = "upcoming";
        months.forEach(monthKey => {
          const parsed = parseMonthKey(monthKey);
          if (!parsed) return;
          if (parsed < startOfMonth) {
            status = "past_due";
          } else if (
            parsed.getFullYear() === startOfMonth.getFullYear() &&
            parsed.getMonth() === startOfMonth.getMonth() &&
            status !== "past_due"
          ) {
            status = "due_now";
          }
        });
        return {
          childId: child.childId ?? "manual-adjustment",
          childName: child.childName ?? "Pelarasan pentadbir",
          amountCents: Math.abs(child.outstandingCents),
          months,
          status
        };
      })
      .sort((a, b) => b.amountCents - a.amountCents);

    return {
      totalCents: Math.abs(outstandingLedger.totalOutstandingCents),
      earliestDueMonth: earliestMonth,
      childSummaries
    };
  }, [outstandingLedger]);

  const earliestOutstandingTarget = useMemo(
    () => getEarliestOutstandingTarget(outstandingLedger, childLookup),
    [childLookup, outstandingLedger]
  );

  const familyFeeItems: FamilyFeeItem[] = useMemo(
    () =>
      assignments.map(assignment => {
        const assignmentId = assignment.assignmentKey ?? assignment.id ?? `${assignment.child_id}_${assignment.fee_id}`;
        return {
        assignmentId,
        childId: assignment.child_id,
        childName: assignment.child?.name ?? childLookup[assignment.child_id] ?? "Child",
        feeId: assignment.fee_id,
        feeName: assignment.fee?.name ?? "Fee",
        description: assignment.fee?.description,
        amountCents: assignment.custom_amount_cents ?? assignment.fee?.amount_cents ?? 0,
        billingCycle: (assignment.fee?.billing_cycle as FamilyFeeItem["billingCycle"]) ?? "monthly",
        category: (assignment.fee?.category as FamilyFeeItem["category"]) ?? "tuition",
        isOptional: assignment.fee?.is_optional ?? true
      }}),
    [assignments, childLookup]
  );

  const assignmentLookup = useMemo(
    () =>
      Object.fromEntries(
        assignments.map(assignment => [
          assignment.assignmentKey ?? assignment.id ?? `${assignment.child_id}_${assignment.fee_id}`,
          assignment
        ])
      ),
    [assignments]
  );

  const cartItems: PaymentCartItem[] = useMemo(() => {
    return familyFeeItems.flatMap(item => {
      const selection = selections[item.assignmentId];
      if (!selection?.include) return [];

      const months =
        item.billingCycle === "monthly"
          ? selection.months
          : [];
      const quantity =
        item.billingCycle === "monthly"
          ? Math.max(0, months.length)
          : Math.max(1, selection.quantity || 1);
      const subtotal = item.amountCents * quantity;

      return [
        {
          childId: item.childId,
          childName: item.childName,
          feeId: item.feeId,
          feeName: item.feeName,
          months,
          quantity,
          unitAmountCents: item.amountCents,
          subtotalCents: subtotal
        }
      ];
    });
  }, [familyFeeItems, selections]);

  const applyOutstandingSelection = useCallback(
    (target: OutstandingTarget) => {
      setSelections(prev => {
        const next: Record<string, FeeSelectionState> = { ...prev };

        familyFeeItems.forEach(item => {
          const current = next[item.assignmentId] ?? { include: false, months: [], quantity: 1 };

          if (item.childId !== target.childId) {
            next[item.assignmentId] = { ...current, include: false };
            return;
          }

          if (item.billingCycle === "monthly") {
            const assignment = assignmentLookup[item.assignmentId];
            const isApplicable =
              !assignment?.effective_months?.length || assignment.effective_months.includes(target.monthKey);

            if (!isApplicable) {
              next[item.assignmentId] = { ...current, include: false };
              return;
            }

            next[item.assignmentId] = { include: true, months: [target.monthKey], quantity: 1 };
            return;
          }

          next[item.assignmentId] = { ...current, include: false, quantity: 1 };
        });

        return next;
      });
    },
    [assignmentLookup, familyFeeItems]
  );

  const preview = useMemo(() => buildPaymentPreview(cartItems, MERCHANT_FEE_CENTS), [cartItems]);

  const pendingPayment = useMemo(
    () => payments.find(payment => payment.status === "pending" || payment.status === "initiated") ?? null,
    [payments]
  );

  const handleSelectionChange = useCallback((assignmentId: string, selection: FeeSelectionState) => {
    setOutstandingSelection(null);
    setSelections(prev => ({ ...prev, [assignmentId]: selection }));
  }, []);

  const handleContactChange = useCallback(
    (field: "name" | "email" | "phone", value: string) => {
      setContactInputs(prev => ({ ...prev, [field]: value }));
      setParentProfile(prev => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleCheckout = useCallback(async () => {
    if (!parentId) return;
    if (!cartItems.length) {
      setError("Select at least one fee.");
      return;
    }
    if (cartItems.some(item => !item.months || item.months.length === 0)) {
      setError("Sila pilih bulan yuran sebelum meneruskan pembayaran.");
      return;
    }
    if (!parentProfile.email || !parentProfile.phone) {
      setError("Add your email and phone number to your profile before paying.");
      focusContactSection();
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/billplz/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId,
          payer: {
            name: parentProfile.name ?? "Parent",
            email: parentProfile.email,
            mobile: parentProfile.phone
          },
          items: cartItems,
          merchantFeeCents: MERCHANT_FEE_CENTS
        })
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "Unable to generate the online bill.");
      }

      const payload = await response.json();
      window.location.href = payload.billUrl;
    } catch (err: unknown) {
      console.error("checkout error", err);
      setError(err instanceof Error ? err.message : "Failed to continue with the payment");
    } finally {
      setSubmitting(false);
    }
  }, [parentId, cartItems, parentProfile, focusContactSection]);

  const refreshPendingStatus = useCallback(async () => {
    if (!pendingPayment?.billplz_id) return;
    try {
      await fetch(`/api/payments/${pendingPayment.billplz_id}/refresh`, { method: "GET" });
      loadData();
    } catch (err) {
      console.error("refresh error", err);
    }
  }, [pendingPayment, loadData]);

  const handleSettleOutstanding = useCallback(() => {
    if (!earliestOutstandingTarget) return;
    setActiveTab("payment");
    applyOutstandingSelection(earliestOutstandingTarget);
    setOutstandingSelection(earliestOutstandingTarget);
    setTimeout(() => {
      scrollToOutstandingSection(earliestOutstandingTarget.childId);
    }, 200);
  }, [applyOutstandingSelection, earliestOutstandingTarget, scrollToOutstandingSection]);

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9]">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="space-y-6 lg:space-y-8">
            <header className="space-y-2">
              <h1 className="text-[26px] font-semibold text-slate-900 lg:text-[28px]">
                Yuran pelajar & bayaran
              </h1>
              <p className="text-[15px] leading-relaxed text-slate-700">
                Bayar yuran anak anda dengan pantas, pantau baki tertunggak, dan buat bayaran secara dalam talian.
              </p>
            </header>

            <div className="flex items-center gap-6 border-b border-slate-200">
              {tabs.map(tab => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className="relative pb-3 text-sm font-medium"
                  >
                    <span className={isActive ? "text-slate-900" : "text-slate-500 transition hover:text-slate-700"}>
                      {tab.label}
                    </span>
                    {isActive && (
                      <span className="absolute inset-x-0 -bottom-[1px] h-0.5 rounded-full bg-indigo-500" />
                    )}
                  </button>
                );
              })}
            </div>

            {error && (
              <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {error}
              </div>
            )}

            <OutstandingBalanceCard
              totalCents={outstandingSummary.totalCents}
              earliestDueMonth={outstandingSummary.earliestDueMonth}
              childSummaries={outstandingSummary.childSummaries}
              isLoading={(loading && assignments.length === 0) || outstandingLedgerLoading}
              onSettleOutstanding={handleSettleOutstanding}
              primaryDisabled={!earliestOutstandingTarget || outstandingSummary.totalCents <= 0}
              onViewHistory={() => {
                setActiveTab("history");
                requestAnimationFrame(() => {
                  paymentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                });
              }}
            />

            {activeTab === "payment" ? (
              <div className="mt-6 space-y-5 lg:space-y-6" ref={paymentSectionRef}>
                {pendingPayment && (
                  <PaymentStatusBanner payment={pendingPayment} onRefresh={refreshPendingStatus} />
                )}

                {outstandingSelectionActive && outstandingSelection && (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs text-indigo-800">
                    Tunggakan {formatMonthLabel(outstandingSelection.monthKey)} untuk {outstandingSelection.childName} telah dipilih. Semak butiran di bawah dan tekan &quot;Teruskan ke bayaran&quot;.
                  </div>
                )}

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2.2fr)_minmax(260px,1fr)] lg:gap-8">
                  <div className="space-y-6">
                    <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm">
                      <CardContent className="space-y-5 p-5 lg:p-6">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                              Contact information
                            </p>
                            <h2 className="text-sm font-semibold text-slate-900">
                              You are paying as {contactInputs.name || "-"}
                            </h2>
                            <p className="text-xs text-slate-500 sm:text-[13px]">
                              Pastikan maklumat di bawah tepat sebelum meneruskan bayaran dalam talian.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={loadData}
                            className="text-xs font-medium text-indigo-600 underline-offset-4 hover:text-indigo-700"
                            disabled={loading}
                          >
                            Segarkan profil
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <label className="flex flex-col">
                            <span className="mb-1 text-xs font-medium text-slate-600">Full name</span>
                            <Input
                              value={contactInputs.name}
                              onChange={event => handleContactChange("name", event.target.value)}
                              placeholder="Parent name"
                              className="h-11 text-sm"
                            />
                          </label>
                          <label className="flex flex-col">
                            <span className="mb-1 text-xs font-medium text-slate-600">Email address</span>
                            <Input
                              type="email"
                              value={contactInputs.email}
                              onChange={event => handleContactChange("email", event.target.value)}
                              placeholder="name@example.com"
                              className="h-11 text-sm"
                            />
                          </label>
                          <label className="flex flex-col sm:col-span-2 lg:col-span-1" ref={contactSectionRef}>
                            <span className="mb-1 text-xs font-medium text-slate-600">Mobile number</span>
                            <Input
                              ref={phoneInputRef}
                              value={contactInputs.phone}
                              onChange={event => handleContactChange("phone", event.target.value)}
                              placeholder="+60123456789"
                              className={`h-11 text-sm ${contactAttention ? "ring-2 ring-rose-400 ring-offset-1" : ""}`}
                            />
                            {!contactInputs.phone && (
                              <span className="mt-1 text-xs text-rose-600">Sila isi nombor telefon untuk meneruskan bayaran.</span>
                            )}
                          </label>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          {contactSaveStatus === "saving" && <span>Menyimpan maklumat…</span>}
                          {contactSaveStatus === "saved" && (
                            <span className="inline-flex items-center gap-1 text-emerald-600">
                              <CheckCircle2 className="h-4 w-4" /> Disimpan
                            </span>
                          )}
                          {contactSaveStatus === "error" && <span className="text-rose-600">Gagal simpan maklumat. Cuba lagi.</span>}
                        </div>
                      </CardContent>
                    </Card>

                    {loading ? (
                      <div className="rounded-2xl border border-slate-100 bg-white p-6 text-center text-slate-600 shadow-sm">
                        Loading payment data...
                      </div>
                    ) : (
                      <FamilyFeeSelector
                        items={familyFeeItems}
                        selections={selections}
                        monthOptions={monthOptions}
                        onSelectionChange={handleSelectionChange}
                        focusChildId={outstandingSelection?.childId ?? null}
                        outstandingSelection={outstandingSelection}
                        outstandingSelectionActive={outstandingSelectionActive}
                        registerChildRef={registerChildRef}
                      />
                    )}
                  </div>

                  <div ref={summaryRef}>
                    <PaymentBreakdown
                      cartItems={cartItems}
                      totalCents={preview.totalCents}
                      merchantFeeCents={preview.merchantFeeCents}
                      isSubmitting={submitting}
                      onCheckout={handleCheckout}
                      isContactComplete={isContactComplete}
                      onRequestContactFocus={focusContactSection}
                      outstandingSelection={outstandingSelection}
                      outstandingSelectionActive={outstandingSelectionActive}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm">
                <CardContent className="space-y-4 p-5 lg:p-6">
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Payment records</p>
                    <h2 className="text-xl font-semibold text-slate-900">Transaction history</h2>
                    <p className="text-sm text-slate-500">Review status dan rujukan untuk setiap bil anda.</p>
                  </div>
                  {loading ? (
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-6 text-center text-slate-600">
                      Loading payment records...
                    </div>
                  ) : (
                    <PaymentHistory payments={payments} />
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
