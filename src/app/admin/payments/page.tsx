"use client";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
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
  createFee,
  deleteFee,
  fetchAdminPayments,
  fetchFeeCatalog,
  updateFee,
} from "@/lib/payments/adminApi";
import { formatRinggit } from "@/lib/payments/pricingUtils";
import type { FeeCatalogItem, PaymentRecord } from "@/types/payments";

const categoryOptions: Array<{ value: FeeCatalogItem["category"]; label: string }> = [
  { value: "tuition", label: "Yuran" },
  { value: "club", label: "Kelab/KoKurikulum" },
  { value: "donation", label: "Infaq/Derma" },
  { value: "program", label: "Program Khas" },
  { value: "other", label: "Lain-lain" },
];

const billingOptions: Array<{ value: FeeCatalogItem["billing_cycle"]; label: string }> = [
  { value: "monthly", label: "Bulanan" },
  { value: "yearly", label: "Tahunan" },
  { value: "one_time", label: "Sekali Sahaja" },
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

const blankFeeForm = {
  name: "",
  description: "",
  amount: "",
  category: "tuition" as FeeCatalogItem["category"],
  billing_cycle: "monthly" as FeeCatalogItem["billing_cycle"],
  is_optional: false,
};

type FeeFormState = typeof blankFeeForm;

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [fees, setFees] = useState<FeeCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feeForm, setFeeForm] = useState<FeeFormState>(blankFeeForm);
  const [editingFeeId, setEditingFeeId] = useState<string | null>(null);
  const [savingFee, setSavingFee] = useState(false);
  const [paymentSearch, setPaymentSearch] = useState("");
  const [isFeeCatalogOpen, setIsFeeCatalogOpen] = useState(false);
  const [isFeeFormOpen, setIsFeeFormOpen] = useState(false);

  const totalCollected = useMemo(
    () =>
      payments
        .filter((p) => p.status === "paid")
        .reduce((sum, payment) => sum + (payment.total_amount_cents ?? 0), 0),
    [payments]
  );

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
      return "Memuatkan transaksi...";
    }

    if (paymentSearch.trim()) {
      return `${filteredPayments.length} rekod padanan daripada ${payments.length} transaksi.`;
    }

    return `${payments.length} rekod terkini dipaparkan.`;
  }, [filteredPayments.length, loading, paymentSearch, payments.length]);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      const [paymentsRes, feesRes] = await Promise.all([
        fetchAdminPayments(),
        fetchFeeCatalog(),
      ]);
      setPayments(paymentsRes.payments ?? []);
      setFees(feesRes.fees ?? []);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Gagal memuatkan data pembayaran.");
    } finally {
      setLoading(false);
    }
  }

  const handleFeeInputChange = (field: keyof FeeFormState, value: string | boolean) => {
    setFeeForm((prev) => ({ ...prev, [field]: value } as FeeFormState));
  };

  function startEditing(fee: FeeCatalogItem) {
    setEditingFeeId(fee.id);
    setFeeForm({
      name: fee.name,
      description: fee.description ?? "",
      amount: (fee.amount_cents / 100).toString(),
      category: fee.category,
      billing_cycle: fee.billing_cycle,
      is_optional: fee.is_optional,
    });
    setIsFeeCatalogOpen(false);
    setIsFeeFormOpen(true);
  }

  function resetForm() {
    setEditingFeeId(null);
    setFeeForm(blankFeeForm);
  }

  function closeFeeFormModal() {
    resetForm();
    setIsFeeFormOpen(false);
  }

  function openCreateFeeModal() {
    resetForm();
    setIsFeeFormOpen(true);
  }

  async function handleFeeSubmit(event: React.FormEvent) {
    event.preventDefault();

    const amountNumber = parseFloat(feeForm.amount);
    if (Number.isNaN(amountNumber) || amountNumber < 0) {
      setError("Jumlah yuran tidak sah.");
      return;
    }

    setSavingFee(true);
    setError(null);

    const payload = {
      name: feeForm.name.trim(),
      description: feeForm.description?.trim() || undefined,
      amount_cents: Math.round(amountNumber * 100),
      category: feeForm.category,
      billing_cycle: feeForm.billing_cycle,
      is_optional: feeForm.is_optional,
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
      setError(err.message ?? "Gagal menyimpan yuran.");
    } finally {
      setSavingFee(false);
    }
  }

  async function handleDeleteFee(id: string) {
    const confirmDelete = window.confirm("Padam yuran ini? Tindakan tidak boleh diundur.");
    if (!confirmDelete) return;

    try {
      await deleteFee(id);
      if (editingFeeId === id) {
        resetForm();
      }
      await loadDashboard();
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Gagal memadam yuran.");
    }
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9]">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-slate-500">
                Admin · Pembayaran
              </p>
              <h1 className="text-3xl font-semibold text-slate-900">
                Kawal Billplz & Yuran
              </h1>
              <p className="text-sm text-slate-600">
                Pantau bayaran ibu bapa, urus jenis yuran dan kemas kini koleksi Billplz.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={openCreateFeeModal}
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Tambah Yuran
              </Button>
              <Button variant="outline" onClick={() => setIsFeeCatalogOpen(true)}>
                <Layers className="h-4 w-4" />
                Urus Jenis Yuran
              </Button>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {error}
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <CardTitle>Transaksi terkini</CardTitle>
                    <p className="text-sm text-slate-500">{paymentSummary}</p>
                  </div>
                  <Input
                    value={paymentSearch}
                    onChange={(event) => setPaymentSearch(event.target.value)}
                    placeholder="Cari nama, status atau item"
                    className="lg:w-72"
                    aria-label="Cari transaksi mengikut nama, status atau item"
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="overflow-x-auto">
                  <div className="max-h-96 overflow-y-auto pr-2">
                    <Table>
                      <TableHeader className="sticky top-0 bg-white">
                        <TableRow>
                          <TableHead>Ibu Bapa</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Jumlah</TableHead>
                          <TableHead>Dibuat</TableHead>
                          <TableHead>Item</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPayments.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-slate-500">
                              {paymentSearch.trim()
                                ? "Tiada transaksi yang sepadan dengan carian."
                                : "Tiada rekod pembayaran ditemui."}
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredPayments.map((payment) => (
                            <TableRow key={payment.id}>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="font-medium">
                                    {(payment as any).parent?.name ?? "Tanpa Nama"}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    {(payment as any).parent?.email ?? "—"}
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
                                  ? new Date(payment.created_at).toLocaleString("ms-MY", {
                                      dateStyle: "medium",
                                      timeStyle: "short",
                                    })
                                  : "-"}
                              </TableCell>
                              <TableCell className="max-w-xs text-xs text-slate-500">
                                {(payment as any).line_items
                                  ?.map((item: any) => item.label)
                                  .join(", ") || "—"}
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

            <Card>
              <CardHeader>
                <CardTitle>Status kutipan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-slate-500">Jumlah diterima (Billplz)</p>
                  <p className="text-3xl font-semibold text-slate-900">
                    {formatRinggit(totalCollected)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white/80 p-3 text-sm text-slate-600">
                  <p className="font-semibold text-slate-900">Nota pantas</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    <li>Hanya 100 transaksi terbaru dipaparkan.</li>
                    <li>
                      Tekan status bil di Billplz untuk melihat transaksi penuh serta rujukan bank.
                    </li>
                    <li>Kemaskini jenis yuran di panel sebelah untuk paparan ibu bapa.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>

          {isFeeCatalogOpen && (
            <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 py-8 backdrop-blur-sm">
              <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl">
                <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-blue-50 p-2">
                      <Layers className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900">Jenis yuran</h2>
                      <p className="text-sm text-slate-500">
                        Senarai semua item dalam katalog Billplz/portal ibu bapa.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsFeeCatalogOpen(false)}
                    className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100"
                    aria-label="Tutup modal jenis yuran"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-3">
                  <p className="text-sm text-slate-500">
                    {fees.length > 0
                      ? `${fees.length} yuran aktif dalam katalog.`
                      : "Belum ada yuran ditetapkan."}
                  </p>
                  <Button size="sm" onClick={openCreateFeeModal}>
                    <Plus className="h-4 w-4" />
                    Tambah yuran baharu
                  </Button>
                </div>
                <div className="px-6 pb-6 pt-4">
                  <div className="max-h-[60vh] overflow-y-auto pr-2">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nama</TableHead>
                          <TableHead>Kategori</TableHead>
                          <TableHead>Harga</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fees.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-slate-500">
                              Belum ada yuran ditetapkan.
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
                                Padam
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
              <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
                <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-blue-50 p-2">
                      <Plus className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900">
                        {editingFeeId ? "Kemaskini yuran" : "Tambah yuran baharu"}
                      </h2>
                      <p className="text-sm text-slate-500">
                        Masukkan butiran yuran agar muncul dalam portal ibu bapa.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={closeFeeFormModal}
                    className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100"
                    aria-label="Tutup modal yuran"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <form className="space-y-4 px-6 py-6" onSubmit={handleFeeSubmit}>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Nama yuran</label>
                    <Input
                      value={feeForm.name}
                      onChange={(event) => handleFeeInputChange("name", event.target.value)}
                      placeholder="Contoh: Yuran Tahunan Anak Pertama"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Deskripsi (optional)</label>
                    <Input
                      value={feeForm.description}
                      onChange={(event) => handleFeeInputChange("description", event.target.value)}
                      placeholder="Contoh: Termasuk modul & aktiviti"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-slate-700">Kategori</label>
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
                      <label className="text-sm font-medium text-slate-700">Kitaran Bil</label>
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
                    <label className="text-sm font-medium text-slate-700">Amaun (RM)</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={feeForm.amount}
                      onChange={(event) => handleFeeInputChange("amount", event.target.value)}
                      required
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-slate-800">Opsyenal untuk ibu bapa</p>
                      <p className="text-xs text-slate-500">
                        Jika dimatikan, yuran ini wajib dipilih dalam portal.
                      </p>
                    </div>
                    <Switch
                      checked={feeForm.is_optional}
                      onCheckedChange={(checked) => handleFeeInputChange("is_optional", checked)}
                    />
                  </div>
                  <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                    <Button type="button" variant="ghost" onClick={closeFeeFormModal}>
                      Batal
                    </Button>
                    <Button type="submit" disabled={savingFee}>
                      {savingFee ? "Menyimpan..." : editingFeeId ? "Kemaskini Yuran" : "Tambah Yuran"}
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
