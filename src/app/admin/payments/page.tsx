"use client";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { cn } from "@/lib/utils";
import { Layers, Plus, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createBalanceAdjustment,
  createFee,
  deleteFee,
  fetchAdminPayments,
  fetchFeeCatalog,
  fetchParentUsers,
  fetchOutstandingParents,
  fetchOutstandingSummary,
  listBalanceAdjustments,
  updateFee,
} from "@/lib/payments/adminApi";
import { formatRinggit } from "@/lib/payments/pricingUtils";
import type {
  AdminOutstandingSummary,
  AdminParentUser,
  FeeCatalogItem,
  FeeCustomAmount,
  FeeMetadata,
  ParentBalanceAdjustment,
  ParentOutstandingRow,
  PaymentRecord,
} from "@/types/payments";

const categoryOptions: Array<{ value: FeeCatalogItem["category"]; label: string }> = [
  { value: "tuition", label: "Tuition" },
  { value: "club", label: "Club / Co-curricular" },
  { value: "donation", label: "Donations" },
  { value: "program", label: "Special Programs" },
  { value: "other", label: "Other" },
];

const billingOptions: Array<{ value: FeeCatalogItem["billing_cycle"]; label: string }> = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "one_time", label: "One-off" },
  { value: "ad_hoc", label: "Ad-hoc / Program" },
];

const statusStyles: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-800",
  failed: "bg-rose-100 text-rose-700",
  expired: "bg-slate-200 text-slate-700",
  refunded: "bg-purple-100 text-purple-700",
  initiated: "bg-slate-100 text-slate-600",
  draft: "bg-slate-100 text-slate-600",
};

type CustomAmountEntry = { amount: string; userIds: string[]; search: string };

type FeeFormState = {
  name: string;
  description: string;
  amount: string;
  category: FeeCatalogItem["category"];
  billing_cycle: FeeCatalogItem["billing_cycle"];
  is_optional: boolean;
  customAmounts: CustomAmountEntry[];
  metadata?: FeeMetadata;
};

const buildBlankFeeForm = (): FeeFormState => ({
  name: "",
  description: "",
  amount: "",
  category: "tuition",
  billing_cycle: "monthly",
  is_optional: false,
  customAmounts: [],
  metadata: {},
});

const blankAdjustmentForm = {
  parentId: "",
  childId: "",
  feeId: "",
  monthKey: "",
  amount: "",
  reason: "",
};

type AdjustmentFormState = typeof blankAdjustmentForm;

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [fees, setFees] = useState<FeeCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feeForm, setFeeForm] = useState<FeeFormState>(buildBlankFeeForm());
  const [editingFeeId, setEditingFeeId] = useState<string | null>(null);
  const [savingFee, setSavingFee] = useState(false);
  const [paymentSearch, setPaymentSearch] = useState("");
  const [isFeeCatalogOpen, setIsFeeCatalogOpen] = useState(false);
  const [isFeeFormOpen, setIsFeeFormOpen] = useState(false);
  const [ledgerSummary, setLedgerSummary] = useState<AdminOutstandingSummary | null>(null);
  const [outstandingParents, setOutstandingParents] = useState<ParentOutstandingRow[]>([]);
  const [adjustments, setAdjustments] = useState<ParentBalanceAdjustment[]>([]);
  const [isAdjustmentFormOpen, setIsAdjustmentFormOpen] = useState(false);
  const [adjustmentForm, setAdjustmentForm] = useState<AdjustmentFormState>(blankAdjustmentForm);
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [parentOptions, setParentOptions] = useState<AdminParentUser[]>([]);
  const [loadingParents, setLoadingParents] = useState(false);

  const totalCollected = useMemo(
    () =>
      payments
        .filter((p) => p.status === "paid")
        .reduce((sum, payment) => sum + (payment.total_amount_cents ?? 0), 0),
    [payments]
  );

  const outstandingAmount = ledgerSummary?.totalOutstandingCents ?? 0;
  const collectedAmount = ledgerSummary?.totalCollectedCents ?? totalCollected;

  const filteredPayments = useMemo(() => {
    const query = paymentSearch.trim().toLowerCase();
    if (!query) {
      return payments;
    }

    return payments.filter((payment) => {
      const parentName = ((payment as any).parent?.name ?? "").toLowerCase();
      const parentEmail = ((payment as any).parent?.email ?? "").toLowerCase();
      const status = payment.status.toLowerCase();
      const billId = (payment.billplz_id ?? "").toLowerCase();
      const items = ((payment as any).line_items ?? [])
        .map((item: any) => (item?.label ?? "").toLowerCase())
        .join(" ");

      return [parentName, parentEmail, status, billId, items].some((value) =>
        value.includes(query)
      );
    });
  }, [payments, paymentSearch]);

  const paymentSummary = useMemo(() => {
    if (loading) {
      return "Loading transactions...";
    }

    if (paymentSearch.trim()) {
      return `${filteredPayments.length} matching records out of ${payments.length} transactions.`;
    }

    return `${payments.length} recent records shown.`;
  }, [filteredPayments.length, loading, paymentSearch, payments.length]);


  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (!isFeeFormOpen || parentOptions.length > 0 || loadingParents) return;
    setLoadingParents(true);
    fetchParentUsers()
      .then((res) => setParentOptions(res.parents ?? []))
      .catch((err) => {
        console.error(err);
        setError((prev) => prev ?? "Failed to load parent list.");
      })
      .finally(() => setLoadingParents(false));
  }, [isFeeFormOpen, loadingParents, parentOptions.length]);

  async function reloadLedgerData() {
    try {
      const [summaryRes, outstandingRes, adjustmentsRes] = await Promise.all([
        fetchOutstandingSummary(),
        fetchOutstandingParents(50),
        listBalanceAdjustments(20),
      ]);
      setLedgerSummary(summaryRes.summary ?? null);
      setOutstandingParents(outstandingRes.parents ?? []);
      setAdjustments(adjustmentsRes.adjustments ?? []);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Failed to load balance status.");
    }
  }

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      const [paymentsRes, feesRes, parentsRes] = await Promise.all([
        fetchAdminPayments(),
        fetchFeeCatalog(),
        fetchParentUsers().catch((err) => {
          console.error(err);
          return { parents: [] };
        }),
      ]);
      setPayments(paymentsRes.payments ?? []);
      setFees(feesRes.fees ?? []);
      setParentOptions(parentsRes.parents ?? []);
      await reloadLedgerData();
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Failed to load payment data.");
    } finally {
      setLoading(false);
    }
  }

  type FeeFormField = keyof Omit<FeeFormState, "customAmounts" | "metadata">;

  const handleFeeInputChange = (field: FeeFormField, value: string | boolean) => {
    setFeeForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAdjustmentInputChange = (field: keyof AdjustmentFormState, value: string) => {
    setAdjustmentForm((prev) => ({ ...prev, [field]: value }));
  };

  function extractCustomAmounts(meta?: FeeMetadata | null): CustomAmountEntry[] {
    const overrides = Array.isArray(meta?.customAmounts)
      ? (meta.customAmounts as FeeCustomAmount[])
      : [];
    const grouped = overrides.reduce<Record<number, string[]>>((acc, entry) => {
      if (typeof entry?.amountCents !== "number" || !entry.userId) {
        return acc;
      }
      const key = entry.amountCents;
      acc[key] = acc[key] ? [...acc[key], entry.userId] : [entry.userId];
      return acc;
    }, {});

    return Object.entries(grouped).map(([amountCents, userIds]) => ({
      amount: (Number(amountCents) / 100).toString(),
      userIds,
      search: "",
    }));
  }

  function addCustomAmountRow() {
    setFeeForm((prev) => ({
      ...prev,
      customAmounts: [...prev.customAmounts, { userIds: [], amount: "", search: "" }],
    }));
  }

  function toggleParentForCustomAmount(entryIndex: number, userId: string, checked: boolean) {
    setFeeForm((prev) => {
      const next = [...prev.customAmounts];
      const current = next[entryIndex];
      if (!current) return prev;
      const existing = new Set(current.userIds);
      if (checked) {
        existing.add(userId);
      } else {
        existing.delete(userId);
      }
      next[entryIndex] = { ...current, userIds: Array.from(existing) };
      return { ...prev, customAmounts: next };
    });
  }

  function updateCustomAmountRow(
    index: number,
    field: keyof CustomAmountEntry,
    value: string | string[]
  ) {
    setFeeForm((prev) => {
      const next = [...prev.customAmounts];
      next[index] = { ...next[index], [field]: value as any };
      return { ...prev, customAmounts: next };
    });
  }

  function removeCustomAmountRow(index: number) {
    setFeeForm((prev) => ({
      ...prev,
      customAmounts: prev.customAmounts.filter((_, entryIndex) => entryIndex !== index),
    }));
  }

  function startEditing(fee: FeeCatalogItem) {
    setEditingFeeId(fee.id);
    const metadata: FeeMetadata = fee.metadata ?? {};
    setFeeForm({
      name: fee.name,
      description: fee.description ?? "",
      amount: (fee.amount_cents / 100).toString(),
      category: fee.category,
      billing_cycle: fee.billing_cycle,
      is_optional: fee.is_optional,
      customAmounts: extractCustomAmounts(metadata),
      metadata,
    });
    setIsFeeCatalogOpen(false);
    setIsFeeFormOpen(true);
  }

  function resetForm() {
    setEditingFeeId(null);
    setFeeForm(buildBlankFeeForm());
  }

  function closeFeeFormModal() {
    resetForm();
    setIsFeeFormOpen(false);
  }

  function openCreateFeeModal() {
    resetForm();
    setIsFeeFormOpen(true);
  }

  function openAdjustmentForm(parentId?: string) {
    setAdjustmentForm({
      ...blankAdjustmentForm,
      parentId: parentId ?? "",
    });
    setIsAdjustmentFormOpen(true);
  }

  function closeAdjustmentForm() {
    setAdjustmentForm(blankAdjustmentForm);
    setIsAdjustmentFormOpen(false);
  }

  async function handleFeeSubmit(event: React.FormEvent) {
    event.preventDefault();

    const amountNumber = parseFloat(feeForm.amount);
    if (Number.isNaN(amountNumber) || amountNumber < 0) {
      setError("Invalid fee amount.");
      return;
    }

    setSavingFee(true);
    setError(null);

    const customAmountsPayload: FeeCustomAmount[] = [];
    for (const entry of feeForm.customAmounts) {
      const amountInput = entry.amount.trim();
      if (!amountInput && entry.userIds.length === 0) continue;
      if (entry.userIds.length === 0) {
        setError("Select at least one parent for each custom amount.");
        setSavingFee(false);
        return;
      }
      const customAmountNumber = parseFloat(amountInput);
      if (!Number.isFinite(customAmountNumber) || customAmountNumber < 0) {
        setError("Custom amounts must be zero or more.");
        setSavingFee(false);
        return;
      }
      const amountCents = Math.round(customAmountNumber * 100);
      entry.userIds.forEach((userId) => {
        customAmountsPayload.push({
          userId,
          amountCents,
        });
      });
    }

    const payload = {
      name: feeForm.name.trim(),
      description: feeForm.description?.trim() || undefined,
      amount_cents: Math.round(amountNumber * 100),
      category: feeForm.category,
      billing_cycle: feeForm.billing_cycle,
      is_optional: feeForm.is_optional,
      metadata: {
        ...(feeForm.metadata ?? {}),
        customAmounts: customAmountsPayload,
      } as FeeMetadata,
    };

    try {
      if (editingFeeId) {
        await updateFee(editingFeeId, payload);
      } else {
        await createFee(payload);
      }
      resetForm();
      setIsFeeFormOpen(false);
      await loadDashboard();
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Failed to save fee.");
    } finally {
      setSavingFee(false);
    }
  }

  async function handleAdjustmentSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adjustmentForm.parentId.trim()) {
      setError("Select a parent for the adjustment.");
      return;
    }
    const amountNumber = parseFloat(adjustmentForm.amount);
    if (!Number.isFinite(amountNumber) || amountNumber === 0) {
      setError("Invalid adjustment amount.");
      return;
    }

    setSavingAdjustment(true);
    setError(null);
    const amountCents = Math.round(amountNumber * 100);

    try {
      await createBalanceAdjustment({
        parentId: adjustmentForm.parentId.trim(),
        childId: adjustmentForm.childId.trim() || null,
        feeId: adjustmentForm.feeId.trim() || null,
        monthKey: adjustmentForm.monthKey || null,
        amountCents,
        reason: adjustmentForm.reason.trim(),
      });
      closeAdjustmentForm();
      await reloadLedgerData();
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Failed to save adjustment.");
    } finally {
      setSavingAdjustment(false);
    }
  }

  async function handleDeleteFee(id: string) {
    const confirmDelete = window.confirm("Delete this fee? This action cannot be undone.");
    if (!confirmDelete) return;

    try {
      await deleteFee(id);
      if (editingFeeId === id) {
        resetForm();
      }
      await loadDashboard();
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Failed to delete fee.");
    }
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9]">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-slate-500">Admin · Payments</p>
              <h1 className="text-3xl font-semibold text-slate-900">Manage Billplz & Fees</h1>
              <p className="text-sm text-slate-600">
                Monitor parent payments, manage fee types, and keep the Billplz catalog fresh.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={openCreateFeeModal}
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Add Fee
              </Button>
              <Button variant="outline" onClick={() => setIsFeeCatalogOpen(true)}>
                <Layers className="h-4 w-4" />
                Manage Fee Types
              </Button>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {error}
            </div>
          )}

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Collection status</CardTitle>
                <p className="text-sm text-slate-500">Total received (Billplz)</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-3xl font-semibold text-slate-900">
                  {formatRinggit(collectedAmount)}
                </p>
                <div className="rounded-lg border border-slate-200 bg-white/80 p-3 text-sm text-slate-600">
                  <p className="font-semibold text-slate-900">Quick notes</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    <li>Only the latest 100 transactions are shown.</li>
                    <li>Open the Billplz status to view the full transaction and bank reference.</li>
                    <li>Update fee types in the panel on the right for parent visibility.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-100 bg-blue-50/40">
              <CardHeader>
                <CardTitle>Outstanding total</CardTitle>
                <p className="text-sm text-slate-500">Mandatory amount as of this month</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-3xl font-semibold text-slate-900">
                  {formatRinggit(outstandingAmount)}
                </p>
                <p className="text-sm text-slate-600">
                  Includes {formatRinggit(ledgerSummary?.totalDueCents ?? 0)} in mandatory fees minus{" "}
                  {formatRinggit(ledgerSummary?.totalPaidAgainstDueCents ?? 0)} recorded payments and{" "}
                  {formatRinggit(ledgerSummary?.totalAdjustmentsCents ?? 0)} manual adjustments.
                </p>
                <Button
                  variant="outline"
                  onClick={() => openAdjustmentForm()}
                  className="w-full justify-center"
                >
                  Adjust parent balance
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-2">
                  <CardTitle>Top outstanding parents</CardTitle>
                  <p className="text-sm text-slate-500">
                    List of 50 parents with the highest balances (mandatory fee calculation).
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                {outstandingParents.length ? (
                  <div className="max-h-80 overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-white">
                        <TableRow>
                          <TableHead>Parent</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {outstandingParents.map((parent) => (
                          <TableRow key={parent.parentId}>
                            <TableCell>
                              <p className="font-semibold text-slate-900">
                                {parent.parent?.name ?? "Unnamed"}
                              </p>
                              <p className="text-xs text-slate-500">{parent.parent?.email ?? parent.parentId}</p>
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatRinggit(parent.outstandingCents)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openAdjustmentForm(parent.parentId)}
                              >
                                Adjust
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">No outstanding balances right now.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Manual adjustments</CardTitle>
                    <p className="text-sm text-slate-500">Track off-system credits and debits.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openAdjustmentForm()}>
                    Add adjustment
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {adjustments.length ? (
                  adjustments.map((adjustment) => (
                    <div
                      key={adjustment.id}
                      className="rounded-lg border border-slate-200 bg-white/70 p-3 text-sm text-slate-700"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900">{formatRinggit(adjustment.amountCents)}</p>
                          <p className="text-xs text-slate-500">
                            {new Date(adjustment.createdAt).toLocaleString("en-MY", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-semibold",
                            adjustment.amountCents >= 0
                              ? "bg-rose-100 text-rose-700"
                              : "bg-emerald-100 text-emerald-700"
                          )}
                        >
                          {adjustment.amountCents >= 0 ? "Add to balance" : "Reduce balance"}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Parent: {adjustment.parentId}
                        {adjustment.childId ? ` · Child: ${adjustment.childId}` : ""}
                        {adjustment.monthKey ? ` · Month: ${adjustment.monthKey.slice(0, 7)}` : ""}
                      </p>
                      <p className="mt-2 text-sm text-slate-700">{adjustment.reason}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-600">No adjustments recorded yet.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {isAdjustmentFormOpen && (
            <Card className="mt-6">
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Add balance adjustment</CardTitle>
                    <p className="text-sm text-slate-500">
                      Positive values increase the outstanding balance; negative values reduce it.
                    </p>
                  </div>
                  <Button variant="ghost" onClick={closeAdjustmentForm}>
                    <X className="h-4 w-4" />
                    Close
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleAdjustmentSubmit}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-slate-700">Parent ID *</label>
                      <Input
                        value={adjustmentForm.parentId}
                        onChange={(event) => handleAdjustmentInputChange("parentId", event.target.value)}
                        placeholder="e.g. user UUID"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">Child ID (optional)</label>
                      <Input
                        value={adjustmentForm.childId}
                        onChange={(event) => handleAdjustmentInputChange("childId", event.target.value)}
                        placeholder="Set if specific to a child"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-slate-700">Fee ID (optional)</label>
                      <Input
                        value={adjustmentForm.feeId}
                        onChange={(event) => handleAdjustmentInputChange("feeId", event.target.value)}
                        placeholder="Refer to the fee catalog if needed"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">Target month (optional)</label>
                      <Input
                        type="month"
                        value={adjustmentForm.monthKey}
                        onChange={(event) => handleAdjustmentInputChange("monthKey", event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-slate-700">Amount (RM) *</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={adjustmentForm.amount}
                        onChange={(event) => handleAdjustmentInputChange("amount", event.target.value)}
                        placeholder="Use a negative value to waive"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">Reason *</label>
                      <Input
                        value={adjustmentForm.reason}
                        onChange={(event) => handleAdjustmentInputChange("reason", event.target.value)}
                        placeholder="Example: Cash payment on 12 March"
                        required
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button type="submit" disabled={savingAdjustment}>
                      {savingAdjustment ? "Saving..." : "Save adjustment"}
                    </Button>
                    <Button type="button" variant="outline" onClick={closeAdjustmentForm}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <Card className="mt-6">
            <CardHeader>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle>Recent transactions</CardTitle>
                  <p className="text-sm text-slate-500">{paymentSummary}</p>
                </div>
                <Input
                  value={paymentSearch}
                  onChange={(event) => setPaymentSearch(event.target.value)}
                  placeholder="Search name, status, or item"
                  className="lg:w-72"
                  aria-label="Search transactions by name, status, or item"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <div className="max-h-96 overflow-y-auto pr-2">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white">
                      <TableRow>
                        <TableHead>Parent</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Item</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPayments.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-slate-500">
                            {paymentSearch.trim()
                              ? "No transactions match that search."
                              : "No payment records found."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredPayments.map((payment) => (
                          <TableRow key={payment.id}>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  {(payment as any).parent?.name ?? "Unnamed"}
                                </span>
                                <span className="text-xs text-slate-500">
                                  {(payment as any).parent?.email ?? "-"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                                  statusStyles[payment.status] ?? "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {payment.status}
                              </span>
                            </TableCell>
                            <TableCell className="font-semibold">
                              {formatRinggit(payment.total_amount_cents ?? 0)}
                            </TableCell>
                            <TableCell className="text-sm text-slate-500">
                              {payment.created_at
                                ? new Date(payment.created_at).toLocaleString("en-MY", {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                  })
                                : "-"}
                            </TableCell>
                            <TableCell className="max-w-xs text-xs text-slate-500">
                              {(payment as any).line_items?.map((item: any) => item.label).join(", ") ||
                                "-"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>

          {isFeeCatalogOpen && (
            <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 py-8 backdrop-blur-sm">
              <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl">
                <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-blue-50 p-2">
                      <Layers className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900">Fee types</h2>
                      <p className="text-sm text-slate-500">
                        List of every item in the Billplz catalog and parent portal.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsFeeCatalogOpen(false)}
                    className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100"
                    aria-label="Close fee type modal"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-3">
                  <p className="text-sm text-slate-500">
                    {fees.length > 0
                      ? `${fees.length} active fees in the catalog.`
                      : "No fees configured yet."}
                  </p>
                  <Button size="sm" onClick={openCreateFeeModal}>
                    <Plus className="h-4 w-4" />
                    Add new fee
                  </Button>
                </div>
                <div className="px-6 pb-6 pt-4">
                  <div className="max-h-[60vh] overflow-y-auto pr-2">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fees.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-slate-500">
                              No fees configured yet.
                            </TableCell>
                          </TableRow>
                        )}
                        {fees.map((fee) => (
                          <TableRow key={fee.id}>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium">{fee.name}</span>
                                {fee.description && (
                                  <span className="text-xs text-slate-500">{fee.description}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm capitalize">
                              {fee.category}
                              <span className="block text-xs text-slate-500">{fee.billing_cycle}</span>
                            </TableCell>
                            <TableCell className="font-semibold">
                              {formatRinggit(fee.amount_cents)}
                            </TableCell>
                            <TableCell className="space-x-2 text-right">
                              <Button variant="ghost" size="sm" onClick={() => startEditing(fee)}>
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-rose-600 hover:text-rose-700"
                                onClick={() => handleDeleteFee(fee.id)}
                              >
                                Delete
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {isFeeFormOpen && (
            <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 py-8 backdrop-blur-sm">
              <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-blue-50 p-2">
                      <Plus className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900">
                        {editingFeeId ? "Update fee" : "Add new fee"}
                      </h2>
                      <p className="text-sm text-slate-500">
                        Provide the fee details so they appear inside the parent portal.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={closeFeeFormModal}
                    className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100"
                    aria-label="Close fee modal"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <form className="space-y-4 px-6 py-6" onSubmit={handleFeeSubmit}>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Fee name</label>
                    <Input
                      value={feeForm.name}
                      onChange={(event) => handleFeeInputChange("name", event.target.value)}
                      placeholder="Example: Yearly Tuition (First Child)"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Description (optional)</label>
                    <Input
                      value={feeForm.description}
                      onChange={(event) => handleFeeInputChange("description", event.target.value)}
                      placeholder="Example: Includes modules & activities"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-slate-700">Category</label>
                      <select
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={feeForm.category}
                        onChange={(event) => handleFeeInputChange("category", event.target.value)}
                      >
                        {categoryOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">Billing cycle</label>
                      <select
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={feeForm.billing_cycle}
                        onChange={(event) =>
                          handleFeeInputChange("billing_cycle", event.target.value)
                        }
                      >
                        {billingOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Amount (RM)</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={feeForm.amount}
                      onChange={(event) => handleFeeInputChange("amount", event.target.value)}
                      required
                    />
                  </div>
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          Custom amounts for specific parents
                        </p>
                        <p className="text-xs text-slate-500">
                          Add an amount then pick parents who should see that price. Parents can only belong
                          to one custom amount per fee.
                        </p>
                      </div>
                      <Button type="button" size="sm" variant="ghost" onClick={addCustomAmountRow}>
                        <Plus className="mr-1 h-4 w-4" />
                        Add amount
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {feeForm.customAmounts.length === 0 && (
                        <p className="text-xs text-slate-500">
                          No custom amounts yet. Parents not listed here will see the default amount.
                        </p>
                      )}
                      {feeForm.customAmounts.map((entry, index) => {
                        const takenUserIds = new Set(
                          feeForm.customAmounts
                            .filter((_, idx) => idx !== index)
                            .flatMap((custom) => custom.userIds)
                        );
                        const filteredParents = (() => {
                          const query = entry.search.trim().toLowerCase();
                          if (!query) return parentOptions;
                          return parentOptions.filter((parent) => {
                            const name = parent.name?.toLowerCase() ?? "";
                            const email = parent.email?.toLowerCase() ?? "";
                            return (
                              name.includes(query) ||
                              email.includes(query) ||
                              parent.id.toLowerCase().includes(query)
                            );
                          });
                        })();
                        return (
                          <div
                            key={`custom-${index}`}
                            className="space-y-3 rounded-lg border border-slate-200 bg-white/80 p-3"
                          >
                            <div className="flex flex-wrap items-center gap-3">
                              <div className="flex-1 min-w-[160px]">
                                <label className="text-xs font-semibold uppercase tracking-wide text-primary/70">
                                  Amount (RM)
                                </label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={entry.amount}
                                  onChange={(event) =>
                                    updateCustomAmountRow(index, "amount", event.target.value)
                                  }
                                  placeholder="e.g. 50.00"
                                />
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                className="text-rose-600 hover:text-rose-700"
                                onClick={() => removeCustomAmountRow(index)}
                              >
                                Remove
                              </Button>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-primary/70">
                                Select parents
                              </p>
                              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                <Input
                                  value={entry.search}
                                  onChange={(event) =>
                                    updateCustomAmountRow(index, "search", event.target.value)
                                  }
                                  placeholder="Search parent name, email, or user ID"
                                  className="w-full sm:w-64"
                                />
                                <p className="text-[11px] text-slate-500">
                                  Selected {entry.userIds.length} of {parentOptions.length}
                                </p>
                              </div>
                              <div className="mt-2 max-h-48 overflow-y-auto space-y-2">
                                {filteredParents.length === 0 ? (
                                  <p className="text-xs text-slate-500">
                                    {entry.search.trim()
                                      ? "No parents match that search."
                                      : "No parents found."}
                                  </p>
                                ) : (
                                  filteredParents.map((parent) => {
                                    const checked = entry.userIds.includes(parent.id);
                                    const disabled = !checked && takenUserIds.has(parent.id);
                                    const label =
                                      parent.name ||
                                      parent.email ||
                                      parent.id.slice(0, 6).concat("…");
                                    return (
                                      <label
                                        key={parent.id}
                                        className={cn(
                                          "flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition",
                                          checked
                                            ? "bg-blue-50 text-slate-900"
                                            : "hover:bg-white"
                                        )}
                                      >
                                        <div className="min-w-0 flex-1">
                                          <p className="truncate font-medium">{label}</p>
                                          <p className="truncate text-xs text-slate-500">
                                            {parent.email ?? parent.id}
                                          </p>
                                        </div>
                                        <input
                                          type="checkbox"
                                          className="h-4 w-4"
                                          checked={checked}
                                          disabled={disabled}
                                          onChange={(event) =>
                                            toggleParentForCustomAmount(
                                              index,
                                              parent.id,
                                              event.target.checked
                                            )
                                          }
                                        />
                                      </label>
                                    );
                                  })
                                )}
                              </div>
                              {takenUserIds.size > 0 && (
                                <p className="mt-2 text-[11px] text-slate-500">
                                  Parents already assigned to another amount are disabled here.
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-slate-800">Optional for parents</p>
                      <p className="text-xs text-slate-500">
                        When disabled, this fee becomes mandatory in the portal.
                      </p>
                    </div>
                    <Switch
                      checked={feeForm.is_optional}
                      onCheckedChange={(checked) => handleFeeInputChange("is_optional", checked)}
                    />
                  </div>
                  <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                    <Button type="button" variant="ghost" onClick={closeFeeFormModal}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={savingFee}>
                      {savingFee ? "Saving..." : editingFeeId ? "Update Fee" : "Add Fee"}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
