"use client";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { authFetch } from "@/lib/authFetch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { downloadPayslipPdf } from "@/lib/payslipPdf";
import type { StaffSalaryConfig, MonthlyPayroll, PayrollSummary } from "@/types/payroll";
import {
  formatRM,
  roundMoney,
  PAYROLL_STATUS_STYLES,
  PAYROLL_STATUS_LABELS,
  DEFAULT_WORKING_DAYS,
  DEFAULT_EPF_EMPLOYEE_RATE,
  DEFAULT_EPF_EMPLOYER_RATE,
  DEFAULT_SOCSO_EMPLOYEE_RATE,
  DEFAULT_SOCSO_EMPLOYER_RATE,
  DEFAULT_EIS_EMPLOYEE_RATE,
  DEFAULT_EIS_EMPLOYER_RATE,
} from "@/types/payroll";

const currentMonthStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function AdminPayrollManagement() {
  // ─── Shared State ───
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ─── Config State ───
  const [configs, setConfigs] = useState<StaffSalaryConfig[]>([]);
  const [configSearch, setConfigSearch] = useState("");
  const [editingConfig, setEditingConfig] = useState<StaffSalaryConfig | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  // ─── Monthly Payroll State ───
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr());
  const [payrollRecords, setPayrollRecords] = useState<MonthlyPayroll[]>([]);
  const [payrollSummary, setPayrollSummary] = useState<PayrollSummary | null>(null);
  const [skippedStaff, setSkippedStaff] = useState<{ user_id: string; user_name: string; reason: string }[]>([]);
  const [unconfiguredCount, setUnconfiguredCount] = useState(0);
  const [payrollSearch, setPayrollSearch] = useState("");
  const [generating, setGenerating] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  // ─── Custom Deduction Modal ───
  const [editingDeduction, setEditingDeduction] = useState<MonthlyPayroll | null>(null);
  const [deductionAmount, setDeductionAmount] = useState("");
  const [deductionNote, setDeductionNote] = useState("");
  const [savingDeduction, setSavingDeduction] = useState(false);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // ─── Fetch Functions ───
  const fetchConfigs = useCallback(async () => {
    const res = await authFetch("/api/admin/payroll/config");
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.error || "Failed to load configs");
    }
    setConfigs(await res.json());
  }, []);

  const fetchPayroll = useCallback(async () => {
    const res = await authFetch(`/api/admin/payroll/monthly?month=${selectedMonth}`);
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.error || "Failed to load payroll");
    }
    const data = await res.json();
    setPayrollRecords(data.records ?? []);
    setPayrollSummary(data.summary ?? null);
    setUnconfiguredCount(data.unconfigured_count ?? 0);
    setSkippedStaff([]);
  }, [selectedMonth]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        await Promise.all([fetchConfigs(), fetchPayroll()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [fetchConfigs, fetchPayroll]);

  // ─── Generate Payroll ───
  const handleGenerate = async () => {
    setGenerating(true);
    setError("");
    setSuccess("");
    try {
      const res = await authFetch("/api/admin/payroll/monthly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: selectedMonth }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to generate");
      const data = await res.json();
      setPayrollRecords(data.records ?? []);
      setPayrollSummary(data.summary ?? null);
      setSkippedStaff(data.skipped_staff ?? []);
      setSuccess(`Payroll generated: ${data.records?.length ?? 0} staff processed`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setGenerating(false);
    }
  };

  // ─── Unfinalize Single ───
  const handleUnfinalizeSingle = async (id: string) => {
    if (!confirm("Revert this record to draft? You can then regenerate payroll to recalculate.")) return;
    try {
      const res = await authFetch("/api/admin/payroll/monthly", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payroll_id: id, action: "unfinalize" }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to unfinalize");
      await fetchPayroll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to unfinalize");
    }
  };

  // ─── Finalize All ───
  const handleFinalizeAll = async () => {
    const msg = unconfiguredCount > 0
      ? `${unconfiguredCount} staff have no salary config and will be excluded. Finalize all draft records anyway?`
      : "Finalize all draft records for this month?";
    if (!confirm(msg)) return;
    setFinalizing(true);
    setError("");
    try {
      const res = await authFetch("/api/admin/payroll/monthly", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: selectedMonth, action: "finalize_all", acknowledge_skipped: unconfiguredCount > 0 }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to finalize");
      const data = await res.json();
      setSuccess(`Finalized ${data.finalized_count} record(s)`);
      await fetchPayroll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to finalize");
    } finally {
      setFinalizing(false);
    }
  };

  // ─── Finalize Single ───
  const handleFinalizeSingle = async (id: string) => {
    try {
      const res = await authFetch("/api/admin/payroll/monthly", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payroll_id: id, action: "finalize" }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to finalize");
      await fetchPayroll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to finalize");
    }
  };

  // ─── Save Config ───
  const handleSaveConfig = async () => {
    if (!editingConfig) return;
    setSavingConfig(true);
    setError("");
    try {
      const res = await authFetch("/api/admin/payroll/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: editingConfig.user_id,
          basic_salary: editingConfig.basic_salary,
          working_days_per_month: editingConfig.working_days_per_month,
          housing_allowance: editingConfig.housing_allowance,
          transport_allowance: editingConfig.transport_allowance,
          meal_allowance: editingConfig.meal_allowance,
          other_allowance: editingConfig.other_allowance,
          other_allowance_label: editingConfig.other_allowance_label,
          epf_employee_rate: editingConfig.epf_employee_rate,
          epf_employer_rate: editingConfig.epf_employer_rate,
          socso_employee_rate: editingConfig.socso_employee_rate,
          socso_employer_rate: editingConfig.socso_employer_rate,
          eis_employee_rate: editingConfig.eis_employee_rate,
          eis_employer_rate: editingConfig.eis_employer_rate,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to save");
      setEditingConfig(null);
      setSuccess("Salary config saved");
      await fetchConfigs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save config");
    } finally {
      setSavingConfig(false);
    }
  };

  // ─── Save Custom Deduction ───
  const handleSaveDeduction = async () => {
    if (!editingDeduction) return;
    setSavingDeduction(true);
    setError("");
    try {
      const res = await authFetch("/api/admin/payroll/monthly", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payroll_id: editingDeduction.id,
          custom_deduction_amount: Number(deductionAmount) || 0,
          custom_deduction_note: deductionNote,
          expected_updated_at: editingDeduction.updated_at,
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to update");
      }
      setEditingDeduction(null);
      await fetchPayroll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save deduction");
    } finally {
      setSavingDeduction(false);
    }
  };

  const handleDownloadPayslip = async (record: MonthlyPayroll) => {
    setDownloadingId(record.id);
    try {
      await downloadPayslipPdf(record);
    } finally {
      setDownloadingId(null);
    }
  };

  // ─── Filtered lists ───
  const filteredConfigs = useMemo(() => {
    if (!configSearch) return configs;
    const q = configSearch.toLowerCase();
    return configs.filter(
      (c) => (c.user_name ?? "").toLowerCase().includes(q) || (c.user_role ?? "").toLowerCase().includes(q)
    );
  }, [configs, configSearch]);

  const filteredPayroll = useMemo(() => {
    if (!payrollSearch) return payrollRecords;
    const q = payrollSearch.toLowerCase();
    return payrollRecords.filter((r) => r.staff_name.toLowerCase().includes(q) || r.staff_position.toLowerCase().includes(q));
  }, [payrollRecords, payrollSearch]);

  const hasDrafts = payrollRecords.some((r) => r.status === "draft");

  // ─── Render ───
  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse bg-white/60 rounded-xl h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* Alerts */}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-rose-400 hover:text-rose-600 ml-2">&times;</button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex justify-between items-center">
          <span>{success}</span>
          <button onClick={() => setSuccess("")} className="text-emerald-400 hover:text-emerald-600 ml-2">&times;</button>
        </div>
      )}

      <Tabs defaultValue="monthly">
        <TabsList className="mb-6">
          <TabsTrigger value="monthly">Monthly Payroll</TabsTrigger>
          <TabsTrigger value="config">Salary Config</TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════ */}
        {/* TAB 1: MONTHLY PAYROLL */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="monthly">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
            <input
              type="text"
              placeholder="Search staff..."
              value={payrollSearch}
              onChange={(e) => setPayrollSearch(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 w-48"
            />
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold shadow-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {generating ? "Generating..." : "Generate Payroll"}
            </button>
            {hasDrafts && (
              <button
                onClick={handleFinalizeAll}
                disabled={finalizing}
                className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow-md hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {finalizing ? "Finalizing..." : "Finalize All"}
              </button>
            )}
          </div>

          {/* Unconfigured staff warning - persistent from GET, not just POST */}
          {unconfiguredCount > 0 && (
            <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <strong>{unconfiguredCount} staff</strong> have no salary config.
              <span className="text-amber-600 ml-1">Go to Salary Config tab to set up their salary.</span>
            </div>
          )}
          {skippedStaff.length > 0 && (
            <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-sm">
              <strong>{skippedStaff.length} staff</strong> were skipped during generation.
              <span className="ml-1">
                {skippedStaff.slice(0, 3).map((staff) => staff.user_name).join(", ")}
                {skippedStaff.length > 3 ? ", ..." : ""}
              </span>
            </div>
          )}

          {/* Summary Cards */}
          {payrollSummary && payrollSummary.total_staff > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {[
                { label: "Total Gross", value: formatRM(payrollSummary.total_gross), color: "text-blue-700" },
                { label: "Total Deductions", value: formatRM(payrollSummary.total_deductions), color: "text-rose-700" },
                { label: "Total Net Pay", value: formatRM(payrollSummary.total_net), color: "text-emerald-700" },
                { label: "Staff", value: `${payrollSummary.total_staff} (${payrollSummary.finalized_count} finalized)`, color: "text-slate-700" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white/80 backdrop-blur-md rounded-2xl shadow-lg p-4 border border-white/60">
                  <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
                  <p className={`text-lg font-bold mt-1 ${color}`}>{value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Payroll Table */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-lg border border-white/60 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200/60">
                  <th className="text-left p-3 font-semibold text-slate-600">Staff</th>
                  <th className="text-right p-3 font-semibold text-slate-600">Basic</th>
                  <th className="text-right p-3 font-semibold text-slate-600">Allowances</th>
                  <th className="text-right p-3 font-semibold text-slate-600">Gross</th>
                  <th className="text-center p-3 font-semibold text-slate-600">UPL</th>
                  <th className="text-right p-3 font-semibold text-slate-600">EPF</th>
                  <th className="text-right p-3 font-semibold text-slate-600">SOCSO</th>
                  <th className="text-right p-3 font-semibold text-slate-600">EIS</th>
                  <th className="text-right p-3 font-semibold text-slate-600">Custom</th>
                  <th className="text-right p-3 font-semibold text-slate-600">Net Pay</th>
                  <th className="text-center p-3 font-semibold text-slate-600">Status</th>
                  <th className="text-center p-3 font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayroll.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="p-8 text-center text-slate-400">
                      {payrollRecords.length === 0 ? "No payroll generated for this month. Click \"Generate Payroll\" to start." : "No results"}
                    </td>
                  </tr>
                ) : (
                  filteredPayroll.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/40 transition-colors">
                      <td className="p-3">
                        <div className="font-medium text-slate-800">{r.staff_name}</div>
                        <div className="text-xs text-slate-400">{r.staff_position}</div>
                      </td>
                      <td className="p-3 text-right text-slate-700">{formatRM(r.basic_salary)}</td>
                      <td className="p-3 text-right text-slate-700">{formatRM(r.total_allowances)}</td>
                      <td className="p-3 text-right font-medium text-slate-800">{formatRM(r.gross_salary)}</td>
                      <td className="p-3 text-center">
                        {r.upl_days > 0 ? (
                          <span className="text-rose-600" title={`${formatRM(r.upl_deduction)} deducted`}>
                            {r.upl_days}d
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="p-3 text-right text-slate-600" title={`Employee: ${r.epf_employee_rate}% | Employer: ${formatRM(r.epf_employer)} (${r.epf_employer_rate}%)`}>
                        {formatRM(r.epf_employee)}
                      </td>
                      <td className="p-3 text-right text-slate-600" title={`Employee: ${r.socso_employee_rate}% | Employer: ${formatRM(r.socso_employer)} (${r.socso_employer_rate}%)`}>
                        {formatRM(r.socso_employee)}
                      </td>
                      <td className="p-3 text-right text-slate-600" title={`Employee: ${r.eis_employee_rate}% | Employer: ${formatRM(r.eis_employer)} (${r.eis_employer_rate}%)`}>
                        {formatRM(r.eis_employee)}
                      </td>
                      <td className="p-3 text-right">
                        {r.status === "draft" ? (
                          <button
                            onClick={() => {
                              setEditingDeduction(r);
                              setDeductionAmount(String(r.custom_deduction_amount || ""));
                              setDeductionNote(r.custom_deduction_note || "");
                            }}
                            className="text-blue-600 hover:text-blue-800 underline"
                            title={r.custom_deduction_note || "Click to edit"}
                          >
                            {r.custom_deduction_amount > 0 ? formatRM(r.custom_deduction_amount) : "Edit"}
                          </button>
                        ) : (
                          <span className="text-slate-600" title={r.custom_deduction_note || ""}>
                            {r.custom_deduction_amount > 0 ? formatRM(r.custom_deduction_amount) : "-"}
                          </span>
                        )}
                      </td>
                      <td className={`p-3 text-right font-bold ${r.net_salary < 0 ? "text-rose-600" : "text-emerald-700"}`}>
                        {formatRM(r.net_salary)}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${PAYROLL_STATUS_STYLES[r.status]}`}>
                          {PAYROLL_STATUS_LABELS[r.status]}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {r.status === "draft" && (
                            <button
                              onClick={() => handleFinalizeSingle(r.id)}
                              className="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-semibold hover:bg-emerald-200 transition-colors"
                            >
                              Finalize
                            </button>
                          )}
                          {r.status === "finalized" && (
                            <>
                              <button
                                onClick={() => handleDownloadPayslip(r)}
                                disabled={downloadingId === r.id}
                                className="px-2 py-1 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-semibold hover:bg-indigo-200 disabled:opacity-50 transition-colors"
                              >
                                {downloadingId === r.id ? "..." : "PDF"}
                              </button>
                              <button
                                onClick={() => handleUnfinalizeSingle(r.id)}
                                className="px-2 py-1 rounded-lg bg-amber-100 text-amber-700 text-xs font-semibold hover:bg-amber-200 transition-colors"
                                title="Revert to draft for recalculation"
                              >
                                Undo
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* TAB 2: SALARY CONFIG */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="config">
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search staff..."
              value={configSearch}
              onChange={(e) => setConfigSearch(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 w-64"
            />
          </div>

          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-lg border border-white/60 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200/60">
                  <th className="text-left p-3 font-semibold text-slate-600">Staff</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Position</th>
                  <th className="text-right p-3 font-semibold text-slate-600">Basic</th>
                  <th className="text-right p-3 font-semibold text-slate-600">Housing</th>
                  <th className="text-right p-3 font-semibold text-slate-600">Transport</th>
                  <th className="text-right p-3 font-semibold text-slate-600">Meal</th>
                  <th className="text-right p-3 font-semibold text-slate-600">Other</th>
                  <th className="text-center p-3 font-semibold text-slate-600">EPF %</th>
                  <th className="text-center p-3 font-semibold text-slate-600">SOCSO %</th>
                  <th className="text-center p-3 font-semibold text-slate-600">EIS %</th>
                  <th className="text-center p-3 font-semibold text-slate-600">Status</th>
                  <th className="text-center p-3 font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredConfigs.map((c) => (
                  <tr key={c.user_id} className="border-b border-slate-100 hover:bg-slate-50/40 transition-colors">
                    <td className="p-3 font-medium text-slate-800">{c.user_name ?? "Unknown"}</td>
                    <td className="p-3 text-slate-500 capitalize">{c.user_role ?? "-"}</td>
                    <td className="p-3 text-right text-slate-700">{formatRM(c.basic_salary)}</td>
                    <td className="p-3 text-right text-slate-600">{formatRM(c.housing_allowance)}</td>
                    <td className="p-3 text-right text-slate-600">{formatRM(c.transport_allowance)}</td>
                    <td className="p-3 text-right text-slate-600">{formatRM(c.meal_allowance)}</td>
                    <td className="p-3 text-right text-slate-600">{formatRM(c.other_allowance)}</td>
                    <td className="p-3 text-center text-slate-600">{c.epf_employee_rate}/{c.epf_employer_rate}</td>
                    <td className="p-3 text-center text-slate-600">{c.socso_employee_rate}/{c.socso_employer_rate}</td>
                    <td className="p-3 text-center text-slate-600">{c.eis_employee_rate}/{c.eis_employer_rate}</td>
                    <td className="p-3 text-center">
                      {c.has_config ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Configured</span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">Not configured</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => setEditingConfig({ ...c })}
                        className="px-3 py-1 rounded-lg bg-blue-100 text-blue-700 text-xs font-semibold hover:bg-blue-200 transition-colors"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* ═══════════════════════════════════════════════ */}
      {/* MODAL: Edit Salary Config */}
      {/* ═══════════════════════════════════════════════ */}
      {editingConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setEditingConfig(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-800 mb-1">Edit Salary Config</h3>
            <p className="text-sm text-slate-500 mb-4">{editingConfig.user_name} ({editingConfig.user_role})</p>

            <div className="space-y-3">
              {/* Basic Salary */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Basic Salary (RM)</label>
                <input type="number" min="0" step="0.01" value={editingConfig.basic_salary}
                  onChange={(e) => setEditingConfig({ ...editingConfig, basic_salary: Number(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Working Days / Month</label>
                <input type="number" min="1" max="31" value={editingConfig.working_days_per_month}
                  onChange={(e) => setEditingConfig({ ...editingConfig, working_days_per_month: Number(e.target.value) || DEFAULT_WORKING_DAYS })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </div>

              {/* Allowances */}
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-2">Allowances</p>
              <div className="grid grid-cols-2 gap-3">
                {(["housing_allowance", "transport_allowance", "meal_allowance", "other_allowance"] as const).map((key) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-slate-600 mb-1 capitalize">
                      {key.replace("_allowance", "").replace("_", " ")} (RM)
                    </label>
                    <input type="number" min="0" step="0.01" value={editingConfig[key]}
                      onChange={(e) => setEditingConfig({ ...editingConfig, [key]: Number(e.target.value) || 0 })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Other Allowance Label</label>
                <input type="text" value={editingConfig.other_allowance_label}
                  onChange={(e) => setEditingConfig({ ...editingConfig, other_allowance_label: e.target.value })}
                  placeholder="e.g., Phone allowance"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </div>

              {/* Statutory Rates */}
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-2">Statutory Rates (%)</p>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ["epf_employee_rate", "EPF Employee", DEFAULT_EPF_EMPLOYEE_RATE],
                  ["epf_employer_rate", "EPF Employer", DEFAULT_EPF_EMPLOYER_RATE],
                  ["socso_employee_rate", "SOCSO Employee", DEFAULT_SOCSO_EMPLOYEE_RATE],
                  ["socso_employer_rate", "SOCSO Employer", DEFAULT_SOCSO_EMPLOYER_RATE],
                  ["eis_employee_rate", "EIS Employee", DEFAULT_EIS_EMPLOYEE_RATE],
                  ["eis_employer_rate", "EIS Employer", DEFAULT_EIS_EMPLOYER_RATE],
                ] as [keyof StaffSalaryConfig, string, number][]).map(([key, label, defaultVal]) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                    <input type="number" min="0" max="100" step="0.01"
                      value={editingConfig[key] as number}
                      onChange={(e) => setEditingConfig({ ...editingConfig, [key]: Number(e.target.value) ?? defaultVal })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                ))}
              </div>

              {/* Preview */}
              {editingConfig.basic_salary > 0 && (
                <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 mb-2">Preview</p>
                  <div className="grid grid-cols-2 gap-1 text-xs text-slate-600">
                    <span>Daily Rate:</span>
                    <span className="text-right font-medium">{formatRM(roundMoney(editingConfig.basic_salary / (editingConfig.working_days_per_month || 22)))}</span>
                    <span>Total Allowances:</span>
                    <span className="text-right font-medium">{formatRM(roundMoney(editingConfig.housing_allowance + editingConfig.transport_allowance + editingConfig.meal_allowance + editingConfig.other_allowance))}</span>
                    <span>Gross Salary:</span>
                    <span className="text-right font-medium">{formatRM(roundMoney(editingConfig.basic_salary + editingConfig.housing_allowance + editingConfig.transport_allowance + editingConfig.meal_allowance + editingConfig.other_allowance))}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditingConfig(null)} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100 transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveConfig} disabled={savingConfig}
                className="px-6 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold shadow-md hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {savingConfig ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════ */}
      {/* MODAL: Custom Deduction */}
      {/* ═══════════════════════════════════════════════ */}
      {editingDeduction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setEditingDeduction(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-1">Custom Deduction</h3>
            <p className="text-sm text-slate-500 mb-4">{editingDeduction.staff_name}</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Amount (RM)</label>
                <input type="number" min="0" step="0.01" value={deductionAmount}
                  onChange={(e) => setDeductionAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Note (e.g., Loan, Advance)</label>
                <input type="text" value={deductionNote}
                  onChange={(e) => setDeductionNote(e.target.value)}
                  placeholder="Description..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditingDeduction(null)} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100 transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveDeduction} disabled={savingDeduction}
                className="px-6 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold shadow-md hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {savingDeduction ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
