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
  OutstandingChildSummary
} from "@/components/payments/types";
import { MERCHANT_FEE_CENTS, buildPaymentPreview } from "@/lib/payments/pricingUtils";
import type { PaymentCartItem } from "@/types/payments";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

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
  const paymentSectionRef = useRef<HTMLDivElement | null>(null);
  const [outstandingLedger, setOutstandingLedger] = useState<ParentOutstandingBreakdown | null>(null);
  const [outstandingLedgerLoading, setOutstandingLedgerLoading] = useState(false);
  const tabs = [
    { id: "payment", label: "Payments", description: "Select fees and review the bill summary." },
    { id: "history", label: "Payment History", description: "Track past transactions and statuses." }
  ] as const;
  type TabId = (typeof tabs)[number]["id"];
  const [activeTab, setActiveTab] = useState<TabId>("payment");

  const monthOptions = useMemo(() => buildMonthOptions(8), []);
  const monthFallback = useMemo(
    () => (monthOptions[0]?.key ? [monthOptions[0].key] : []),
    [monthOptions]
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
      setParentProfile({
        name: (data.user.user_metadata as any)?.name || data.user.email?.split("@")[0],
        phone: (data.user.user_metadata as any)?.phone || "",
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
    } catch (err: any) {
      console.error("Failed to load payments data", err);
      setError(err.message ?? "Failed to load payment data");
    } finally {
      setLoading(false);
    }
  }, [applyCustomAmounts, parentId, fetchParentProfile, refreshOutstandingLedger]);

  useEffect(() => {
    if (!parentId) return;
    loadData();
  }, [parentId, loadData]);

  useEffect(() => {
    if (!assignments.length) return;
    setSelections(prev => {
      const next: Record<string, FeeSelectionState> = { ...prev };
      assignments.forEach(assignment => {
        const key = assignment.assignmentKey ?? assignment.id ?? `${assignment.child_id}_${assignment.fee_id}`;
        if (!next[key]) {
          const months =
            assignment.fee?.billing_cycle === "monthly"
              ? assignment.effective_months?.slice(0, 3) ?? monthFallback
              : [];
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
  }, [assignments, monthFallback]);

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

  const cartItems: PaymentCartItem[] = useMemo(() => {
    return familyFeeItems.flatMap(item => {
      const selection = selections[item.assignmentId];
      if (!selection?.include) return [];

      const months =
        item.billingCycle === "monthly"
          ? (selection.months.length ? selection.months : monthFallback)
          : [];
      const quantity =
        item.billingCycle === "monthly"
          ? Math.max(1, months.length || 1)
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
  }, [familyFeeItems, selections, monthFallback]);

  const preview = useMemo(() => buildPaymentPreview(cartItems, MERCHANT_FEE_CENTS), [cartItems]);

  const pendingPayment = useMemo(
    () => payments.find(payment => payment.status === "pending" || payment.status === "initiated") ?? null,
    [payments]
  );

  const handleSelectionChange = useCallback((assignmentId: string, selection: FeeSelectionState) => {
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
    if (!parentProfile.email || !parentProfile.phone) {
      setError("Add your email and phone number to your profile before paying.");
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
        throw new Error(payload.error || "Unable to generate a Billplz bill.");
      }

      const payload = await response.json();
      window.location.href = payload.billUrl;
    } catch (err: any) {
      console.error("checkout error", err);
      setError(err.message ?? "Failed to continue with the payment");
    } finally {
      setSubmitting(false);
    }
  }, [parentId, cartItems, parentProfile]);

  const refreshPendingStatus = useCallback(async () => {
    if (!pendingPayment?.billplz_id) return;
    try {
      await fetch(`/api/payments/${pendingPayment.billplz_id}/refresh`, { method: "GET" });
      loadData();
    } catch (err) {
      console.error("refresh error", err);
    }
  }, [pendingPayment, loadData]);

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9]">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-wide text-primary/70">Payments</p>
                <h1 className="text-3xl font-semibold text-slate-900">Student billing & Billplz</h1>
                <p className="text-sm text-slate-600">
                  Choose fees, review the total, and head to Billplz in just a few clicks.
                </p>
              </div>
            </div>

            <div className="sticky top-14 z-30 rounded-2xl border border-white/60 bg-white/80 p-2 shadow-sm backdrop-blur">
              <div className="grid grid-cols-2 gap-2">
            {tabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                    <button
                      key={tab.id}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setActiveTab(tab.id)}
                      className={`rounded-xl border px-4 py-3 text-left transition ${
                        isActive
                          ? "border-primary/40 bg-gradient-to-r from-primary/10 to-secondary/10 text-primary shadow-md"
                          : "border-transparent bg-transparent text-slate-600 hover:border-white/40 hover:bg-white/50 hover:text-slate-900"
                      }`}
                    >
                      <p className="text-sm font-semibold text-slate-900">{tab.label}</p>
                      <p className="text-xs text-slate-500">{tab.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="rounded-xl border-l-4 border-rose-400 bg-rose-50/80 px-4 py-3 text-sm text-rose-800">
                {error}
              </div>
            )}

            <OutstandingBalanceCard
              totalCents={outstandingSummary.totalCents}
              earliestDueMonth={outstandingSummary.earliestDueMonth}
              childSummaries={outstandingSummary.childSummaries}
              isLoading={(loading && assignments.length === 0) || outstandingLedgerLoading}
              onPayNow={() => {
                setActiveTab("payment");
                requestAnimationFrame(() => {
                  paymentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                });
              }}
              onViewHistory={() => {
                setActiveTab("history");
                requestAnimationFrame(() => {
                  paymentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                });
              }}
            />

            {activeTab === "payment" ? (
              <>
                <section className="rounded-3xl border border-white/30 bg-white/80 p-6 shadow-xl backdrop-blur">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-primary/70">Contact information</p>
                      <h2 className="text-xl font-semibold text-slate-900">
                        You are paying as {contactInputs.name || "-"}
                      </h2>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={loadData}
                      className="text-primary hover:text-secondary"
                      disabled={loading}
                    >
                      Refresh profile
                    </Button>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <label className="flex flex-col gap-1 text-sm font-medium text-slate-800 md:col-span-3">
                      Full name
                      <Input
                        value={contactInputs.name}
                        onChange={event => handleContactChange("name", event.target.value)}
                        placeholder="Parent name"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm font-medium text-slate-800">
                      Email address
                      <Input
                        type="email"
                        value={contactInputs.email}
                        onChange={event => handleContactChange("email", event.target.value)}
                        placeholder="name@example.com"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm font-medium text-slate-800 md:col-span-2">
                      Mobile number
                      <Input
                        value={contactInputs.phone}
                        onChange={event => handleContactChange("phone", event.target.value)}
                        placeholder="+60123456789"
                      />
                    </label>
                  </div>
                  <div className="mt-4 rounded-2xl border border-dashed border-primary/30 bg-gradient-to-r from-primary/5 to-secondary/5 px-4 py-3 text-sm text-primary/80">
                    {(!parentProfile.email || !parentProfile.phone) ? (
                      <span className="font-medium text-secondary">
                        Please provide both an email and phone number before continuing with payment.
                      </span>
                    ) : (
                      "This information is only used for this bill. Save permanent updates on your profile page."
                    )}
                  </div>
                </section>

                <div ref={paymentSectionRef}>
                  {pendingPayment && (
                    <PaymentStatusBanner payment={pendingPayment} onRefresh={refreshPendingStatus} />
                  )}

                  {loading ? (
                    <div className="rounded-xl border border-white/30 bg-white/70 p-6 text-center text-slate-600 shadow-xl backdrop-blur">
                      Loading payment data...
                    </div>
                  ) : (
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                      <div className="space-y-6">
                        <div className="scroll-mt-32">
                          <FamilyFeeSelector
                            items={familyFeeItems}
                            selections={selections}
                            monthOptions={monthOptions}
                            onSelectionChange={handleSelectionChange}
                          />
                        </div>
                      </div>
                      <div className="scroll-mt-32">
                        <PaymentBreakdown
                          cartItems={cartItems}
                          totalCents={preview.totalCents}
                          merchantFeeCents={preview.merchantFeeCents}
                          isSubmitting={submitting}
                          onCheckout={handleCheckout}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <section className="rounded-3xl border border-white/30 bg-white/80 p-6 shadow-xl backdrop-blur">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-semibold text-primary/70">Payment records</p>
                  <h2 className="text-2xl font-semibold text-slate-900">Transaction history</h2>
                  <p className="text-sm text-slate-600">Review the status and reference for each Billplz bill.</p>
                </div>
                <div className="mt-6">
                  {loading ? (
                    <div className="rounded-xl border border-white/30 bg-white/70 p-6 text-center text-slate-600 shadow-xl backdrop-blur">
                      Loading payment records...
                    </div>
                  ) : (
                    <PaymentHistory payments={payments} />
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
