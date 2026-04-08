import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
import { roundMoney } from "@/types/payroll";
import { countBusinessDaysInMonth, getMonthBounds, formatDateISO } from "@/lib/dateUtils";
import type { MonthlyPayroll, PayrollSummary } from "@/types/payroll";
import { filterTeachersByTeachingScope } from "@/lib/adminTeacherScope";

const resolveTenantIdOrThrow = async (
  request: NextRequest,
  client: Parameters<Parameters<typeof adminOperationSimple>[0]>[0]
) => {
  const tenantId = await resolveTenantIdFromRequest(request, client);
  if (tenantId) return tenantId;
  const { data, error } = await client.from("tenants").select("id").limit(2);
  if (error) throw error;
  if (!data || data.length !== 1) throw new Error("Tenant context missing");
  return data[0].id as string;
};

function computeSummary(records: MonthlyPayroll[]): PayrollSummary {
  let total_gross = 0, total_deductions = 0, total_net = 0;
  let total_employer_epf = 0, total_employer_socso = 0, total_employer_eis = 0;
  let finalized_count = 0, draft_count = 0;
  for (const r of records) {
    total_gross += r.gross_salary;
    total_deductions += r.total_deductions;
    total_net += r.net_salary;
    total_employer_epf += r.epf_employer;
    total_employer_socso += r.socso_employer;
    total_employer_eis += r.eis_employer;
    if (r.status === "finalized") finalized_count++;
    else draft_count++;
  }
  return {
    total_staff: records.length,
    total_gross: roundMoney(total_gross),
    total_deductions: roundMoney(total_deductions),
    total_net: roundMoney(total_net),
    total_employer_epf: roundMoney(total_employer_epf),
    total_employer_socso: roundMoney(total_employer_socso),
    total_employer_eis: roundMoney(total_employer_eis),
    finalized_count,
    draft_count,
  };
}

function parseMonth(raw: string | null): string | null {
  if (!raw) return null;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return raw;
  return null;
}

// ─── GET: Read-only, returns existing payroll records + summary ───
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:payroll"]);
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const monthStr = parseMonth(searchParams.get("month"));
    if (!monthStr) {
      return NextResponse.json({ error: "month param required (YYYY-MM)" }, { status: 400 });
    }

    const data = await adminOperationSimple(async (client) => {
      const tenantId = await resolveTenantIdOrThrow(request, client);
      const payrollMonth = `${monthStr}-01`;

      const { data: records, error } = await client
        .from("monthly_payroll")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("payroll_month", payrollMonth)
        .order("staff_name");

      if (error) throw error;
      const typedRecords = (records ?? []) as MonthlyPayroll[];

      // Count unconfigured staff for warning (even on GET)
      const { data: tenantProfiles } = await client
        .from("user_profiles").select("user_id").eq("tenant_id", tenantId);
      const allIds = (tenantProfiles ?? []).map((p) => p.user_id).filter(Boolean);
      let unconfiguredCount = 0;
      if (allIds.length > 0) {
        const { data: staffUsers } = await client
          .from("users").select("id, role").in("id", allIds).neq("role", "parent");
        const staffIds = (staffUsers ?? []).map((u) => u.id);
        // Only filter teachers for campus scope
        const teacherIds = (staffUsers ?? []).filter((u) => u.role === "teacher").map((u) => u.id);
        const nonTeacherIds = (staffUsers ?? []).filter((u) => u.role !== "teacher").map((u) => u.id);
        let campusTeacherIds = teacherIds;
        if (teacherIds.length > 0) {
          const campusTeachers = await filterTeachersByTeachingScope(
            client, teacherIds.map(id => ({ id })), "campus", tenantId
          );
          campusTeacherIds = campusTeachers.map(t => t.id);
        }
        const campusStaffIds = [...nonTeacherIds, ...campusTeacherIds];
        const { data: configuredIds } = await client
          .from("staff_salary_config").select("user_id")
          .eq("tenant_id", tenantId).eq("is_active", true)
          .in("user_id", campusStaffIds);
        const configuredSet = new Set((configuredIds ?? []).map((c) => c.user_id));
        unconfiguredCount = campusStaffIds.filter((id) => !configuredSet.has(id)).length;
      }

      return {
        records: typedRecords,
        summary: computeSummary(typedRecords),
        unconfigured_count: unconfiguredCount,
      };
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch payroll";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── POST: Generate/regenerate payroll via SQL RPC ───
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:payroll"]);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const monthStr = parseMonth(body.month);
    if (!monthStr) {
      return NextResponse.json({ error: "month required (YYYY-MM)" }, { status: 400 });
    }

    const result = await adminOperationSimple(async (client) => {
      const tenantId = await resolveTenantIdOrThrow(request, client);
      const payrollMonth = `${monthStr}-01`;
      const { start: monthStart, end: monthEnd } = getMonthBounds(monthStr);

      // Step 1: Fetch all non-parent staff
      const { data: tenantProfiles } = await client
        .from("user_profiles")
        .select("user_id, role")
        .eq("tenant_id", tenantId);

      const allTenantUserIds = (tenantProfiles ?? []).map((p) => p.user_id).filter(Boolean);
      if (allTenantUserIds.length === 0) return { records: [], summary: computeSummary([]), skipped_staff: [] };

      const { data: allUsers } = await client
        .from("users")
        .select("id, name, email, role")
        .in("id", allTenantUserIds)
        .neq("role", "parent");

      if (!allUsers || allUsers.length === 0) return { records: [], summary: computeSummary([]), skipped_staff: [] };

      // Exclude online-only teachers (campus payroll only)
      // Only filter teacher role - admin and general_worker pass through directly
      const teacherUsers = allUsers.filter((u) => u.role === "teacher");
      const nonTeacherStaff = allUsers.filter((u) => u.role !== "teacher");
      const campusTeachers = await filterTeachersByTeachingScope(
        client, teacherUsers, "campus", tenantId
      );
      const campusStaff = [...nonTeacherStaff, ...campusTeachers];

      const roleToPosition: Record<string, string> = {
        school_admin: "admin", admin: "admin", teacher: "teacher", general_worker: "general_worker",
      };
      const profileRoleMap = new Map((tenantProfiles ?? []).map((p) => [p.user_id, p.role]));
      const staffUserIds = campusStaff.map((u) => u.id);

      // Step 2: Fetch salary configs
      const { data: configs } = await client
        .from("staff_salary_config")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .in("user_id", staffUserIds);

      const configMap = new Map((configs ?? []).map((c) => [c.user_id, c]));

      // Step 3: Fetch existing draft records to preserve custom deductions
      const { data: existingDrafts } = await client
        .from("monthly_payroll")
        .select("user_id, custom_deduction_amount, custom_deduction_note")
        .eq("tenant_id", tenantId)
        .eq("payroll_month", payrollMonth)
        .eq("status", "draft");

      const draftCustomMap = new Map(
        (existingDrafts ?? []).map((d) => [d.user_id, {
          amount: Number(d.custom_deduction_amount) || 0,
          note: d.custom_deduction_note || "",
        }])
      );

      // Step 4: Fetch approved UPL overlapping target month
      const { data: uplLeaves } = await client
        .from("leave_applications")
        .select("user_id, start_date, end_date")
        .eq("tenant_id", tenantId)
        .eq("leave_type", "unpaid_leave")
        .eq("status", "approved")
        .lte("start_date", formatDateISO(monthEnd))
        .gte("end_date", formatDateISO(monthStart));

      const uplDaysMap = new Map<string, number>();
      for (const leave of uplLeaves ?? []) {
        const days = countBusinessDaysInMonth(leave.start_date, leave.end_date, monthStart, monthEnd);
        uplDaysMap.set(leave.user_id, (uplDaysMap.get(leave.user_id) ?? 0) + days);
      }

      // Step 5: Calculate payroll for each configured staff
      const skippedStaff: { user_id: string; user_name: string; reason: string }[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const records: Record<string, any>[] = [];

      for (const user of campusStaff) {
        const config = configMap.get(user.id);
        if (!config) {
          skippedStaff.push({ user_id: user.id, user_name: user.name ?? "Unknown", reason: "No salary config" });
          continue;
        }

        const position =
          roleToPosition[user.role ?? ""] ??
          roleToPosition[profileRoleMap.get(user.id) ?? ""] ??
          "teacher";

        const basicSalary = Number(config.basic_salary) || 0;
        const workingDays = Number(config.working_days_per_month) || 22;
        const dailyRate = roundMoney(basicSalary / workingDays);

        const housingAllowance = Number(config.housing_allowance) || 0;
        const transportAllowance = Number(config.transport_allowance) || 0;
        const mealAllowance = Number(config.meal_allowance) || 0;
        const otherAllowance = Number(config.other_allowance) || 0;
        const totalAllowances = roundMoney(housingAllowance + transportAllowance + mealAllowance + otherAllowance);

        const grossSalary = roundMoney(basicSalary + totalAllowances);

        const uplDays = uplDaysMap.get(user.id) ?? 0;
        const uplDeduction = roundMoney(dailyRate * uplDays);

        const epfEmployeeRate = Number(config.epf_employee_rate) || 0;
        const epfEmployerRate = Number(config.epf_employer_rate) || 0;
        const socsoEmployeeRate = Number(config.socso_employee_rate) || 0;
        const socsoEmployerRate = Number(config.socso_employer_rate) || 0;
        const eisEmployeeRate = Number(config.eis_employee_rate) || 0;
        const eisEmployerRate = Number(config.eis_employer_rate) || 0;

        const epfEmployee = roundMoney(basicSalary * epfEmployeeRate / 100);
        const epfEmployer = roundMoney(basicSalary * epfEmployerRate / 100);
        const socsoEmployee = roundMoney(basicSalary * socsoEmployeeRate / 100);
        const socsoEmployer = roundMoney(basicSalary * socsoEmployerRate / 100);
        const eisEmployee = roundMoney(basicSalary * eisEmployeeRate / 100);
        const eisEmployer = roundMoney(basicSalary * eisEmployerRate / 100);

        // Preserved custom deductions from existing draft
        const existingCustom = draftCustomMap.get(user.id);
        const customDeductionAmount = existingCustom?.amount ?? 0;
        const customDeductionNote = existingCustom?.note ?? "";

        const totalDeductions = roundMoney(
          epfEmployee + socsoEmployee + eisEmployee + uplDeduction + customDeductionAmount
        );
        const netSalary = roundMoney(grossSalary - totalDeductions);

        records.push({
          user_id: user.id,
          staff_name: user.name ?? "Unknown",
          staff_position: position,
          basic_salary: basicSalary,
          working_days: workingDays,
          daily_rate: dailyRate,
          housing_allowance: housingAllowance,
          transport_allowance: transportAllowance,
          meal_allowance: mealAllowance,
          other_allowance: otherAllowance,
          other_allowance_label: config.other_allowance_label || "",
          total_allowances: totalAllowances,
          upl_days: uplDays,
          upl_deduction: uplDeduction,
          epf_employee: epfEmployee,
          epf_employer: epfEmployer,
          socso_employee: socsoEmployee,
          socso_employer: socsoEmployer,
          eis_employee: eisEmployee,
          eis_employer: eisEmployer,
          epf_employee_rate: epfEmployeeRate,
          epf_employer_rate: epfEmployerRate,
          socso_employee_rate: socsoEmployeeRate,
          socso_employer_rate: socsoEmployerRate,
          eis_employee_rate: eisEmployeeRate,
          eis_employer_rate: eisEmployerRate,
          custom_deduction_amount: customDeductionAmount,
          custom_deduction_note: customDeductionNote,
          gross_salary: grossSalary,
          total_deductions: totalDeductions,
          net_salary: netSalary,
        });
      }

      // Step 6: Atomic batch upsert via SQL RPC
      if (records.length > 0) {
        const { error: rpcError } = await client.rpc("upsert_monthly_payroll_batch", {
          p_tenant_id: tenantId,
          p_payroll_month: payrollMonth,
          p_records: records,
        });
        if (rpcError) throw rpcError;
      }

      // Step 7: Re-fetch records for response
      const { data: finalRecords, error: fetchErr } = await client
        .from("monthly_payroll")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("payroll_month", payrollMonth)
        .order("staff_name");

      if (fetchErr) throw fetchErr;
      const typedRecords = (finalRecords ?? []) as MonthlyPayroll[];

      return { records: typedRecords, summary: computeSummary(typedRecords), skipped_staff: skippedStaff };
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to generate payroll";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── PUT: Update custom deductions (draft only, optimistic lock) ───
export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:payroll"]);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { payroll_id, custom_deduction_amount, custom_deduction_note, expected_updated_at } = body;

    if (!payroll_id) {
      return NextResponse.json({ error: "payroll_id is required" }, { status: 400 });
    }
    if (!expected_updated_at) {
      return NextResponse.json({ error: "expected_updated_at is required for optimistic locking" }, { status: 400 });
    }

    const data = await adminOperationSimple(async (client) => {
      const tenantId = await resolveTenantIdOrThrow(request, client);

      // Fetch current record - scoped by tenant_id to prevent cross-tenant IDOR
      const { data: record, error: fetchErr } = await client
        .from("monthly_payroll")
        .select("*")
        .eq("id", payroll_id)
        .eq("tenant_id", tenantId)
        .single();

      if (fetchErr || !record) throw new Error("Record not found");
      if (record.status === "finalized") throw new Error("Cannot modify finalized record");

      const newCustomAmount = custom_deduction_amount !== undefined
        ? Number(custom_deduction_amount) || 0
        : Number(record.custom_deduction_amount) || 0;
      const newCustomNote = custom_deduction_note !== undefined
        ? custom_deduction_note
        : record.custom_deduction_note;

      // Recalculate totals with new custom deduction
      const epfEmployee = Number(record.epf_employee) || 0;
      const socsoEmployee = Number(record.socso_employee) || 0;
      const eisEmployee = Number(record.eis_employee) || 0;
      const uplDeduction = Number(record.upl_deduction) || 0;
      const grossSalary = Number(record.gross_salary) || 0;

      const totalDeductions = roundMoney(
        epfEmployee + socsoEmployee + eisEmployee + uplDeduction + newCustomAmount
      );
      const netSalary = roundMoney(grossSalary - totalDeductions);

      // Optimistic lock: updated_at check in WHERE clause.
      // The DB trigger handles setting updated_at to now() - we don't write it from JS.
      const { data: updated, error: updateErr } = await client
        .from("monthly_payroll")
        .update({
          custom_deduction_amount: newCustomAmount,
          custom_deduction_note: newCustomNote,
          total_deductions: totalDeductions,
          net_salary: netSalary,
        })
        .eq("id", payroll_id)
        .eq("tenant_id", tenantId)
        .eq("status", "draft")
        .eq("updated_at", expected_updated_at)
        .select()
        .maybeSingle();

      if (updateErr) throw updateErr;
      if (!updated) {
        throw new Error("CONFLICT: Record was modified by another user. Please refresh and try again.");
      }
      return updated;
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update";
    if (message.includes("CONFLICT")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── PATCH: Finalize / Unfinalize (single or bulk) ───
export async function PATCH(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:payroll"]);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { payroll_id, month, action, acknowledge_skipped } = body;

    const validActions = ["finalize", "finalize_all", "unfinalize", "unfinalize_all"];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: `action must be one of: ${validActions.join(", ")}` }, { status: 400 });
    }

    const data = await adminOperationSimple(async (client) => {
      const tenantId = await resolveTenantIdOrThrow(request, client);

      if (action === "finalize_all") {
        const monthStr = parseMonth(month);
        if (!monthStr) {
          throw new Error("month required for finalize_all (YYYY-MM)");
        }
        const payrollMonth = `${monthStr}-01`;

        // Check for unconfigured staff
        if (!acknowledge_skipped) {
          const { data: tenantProfiles } = await client
            .from("user_profiles")
            .select("user_id")
            .eq("tenant_id", tenantId);
          const allIds = (tenantProfiles ?? []).map((p) => p.user_id).filter(Boolean);

          if (allIds.length > 0) {
            const { data: staffUsers } = await client
              .from("users")
              .select("id")
              .in("id", allIds)
              .neq("role", "parent");

            const staffIds = (staffUsers ?? []).map((u) => u.id);

            const { data: configuredIds } = await client
              .from("staff_salary_config")
              .select("user_id")
              .eq("tenant_id", tenantId)
              .eq("is_active", true)
              .in("user_id", staffIds);

            const configuredSet = new Set((configuredIds ?? []).map((c) => c.user_id));
            const unconfigured = staffIds.filter((id) => !configuredSet.has(id));

            if (unconfigured.length > 0) {
              throw new Error(
                `UNCONFIGURED_STAFF: ${unconfigured.length} staff without salary config. Pass acknowledge_skipped: true to proceed.`
              );
            }
          }
        }

        const { data: count, error: rpcErr } = await client.rpc("finalize_monthly_payroll", {
          p_tenant_id: tenantId,
          p_payroll_month: payrollMonth,
          p_finalized_by: guard.userId,
          p_single_id: null,
        });
        if (rpcErr) throw rpcErr;
        return { finalized_count: count };
      }

      // ── Unfinalize (revert to draft for recalculation) ──
      if (action === "unfinalize_all") {
        const monthStr = parseMonth(month);
        if (!monthStr) throw new Error("month required for unfinalize_all (YYYY-MM)");
        const payrollMonth = `${monthStr}-01`;

        const { data: count, error: rpcErr } = await client.rpc("unfinalize_monthly_payroll", {
          p_tenant_id: tenantId,
          p_payroll_month: payrollMonth,
          p_single_id: null,
        });
        if (rpcErr) throw rpcErr;
        return { unfinalized_count: count };
      }

      if (action === "unfinalize") {
        if (!payroll_id) throw new Error("payroll_id required for single unfinalize");
        const { data: record, error: fetchErr } = await client
          .from("monthly_payroll")
          .select("payroll_month")
          .eq("id", payroll_id)
          .eq("tenant_id", tenantId)
          .single();
        if (fetchErr || !record) throw new Error("Record not found");

        const { data: count, error: rpcErr } = await client.rpc("unfinalize_monthly_payroll", {
          p_tenant_id: tenantId,
          p_payroll_month: record.payroll_month,
          p_single_id: payroll_id,
        });
        if (rpcErr) throw rpcErr;
        return { unfinalized_count: count };
      }

      // ── Single finalize ──
      if (!payroll_id) throw new Error("payroll_id required for single finalize");

      const { data: record, error: fetchErr } = await client
        .from("monthly_payroll")
        .select("payroll_month")
        .eq("id", payroll_id)
        .eq("tenant_id", tenantId)
        .single();

      if (fetchErr || !record) throw new Error("Record not found");

      const { data: count, error: rpcErr } = await client.rpc("finalize_monthly_payroll", {
        p_tenant_id: tenantId,
        p_payroll_month: record.payroll_month,
        p_finalized_by: guard.userId,
        p_single_id: payroll_id,
      });
      if (rpcErr) throw rpcErr;
      return { finalized_count: count };
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update payroll status";
    if (message.includes("UNCONFIGURED_STAFF")) {
      return NextResponse.json({ error: message }, { status: 422 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
