import { NextRequest, NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabaseServiceClient';
import { requireAdminPermission } from '@/lib/adminPermissions';
import { logPaymentError } from '@/lib/payments/paymentLogging';

const monthKeyPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

const asMonthKey = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 7);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 7);
  return null;
};

const toCents = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
};

const keyForLine = (parentId: string, childId: string, feeId: string, monthKey: string) =>
  `${parentId}:${childId}:${feeId}:${monthKey}`;

const parseLineMonths = (metadata: unknown): string[] => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const candidate = metadata as { months?: unknown };
  if (!Array.isArray(candidate.months)) return [];
  return Array.from(
    new Set(
      candidate.months
        .filter((item): item is string => typeof item === 'string')
        .map((month) => month.trim())
        .filter((month) => monthKeyPattern.test(month))
    )
  ).sort();
};

type DueRow = {
  parent_id: string | null;
  child_id: string | null;
  fee_id: string | null;
  month_key: string | null;
  amount_cents: number | null;
};

type PaymentLineRow = {
  child_id: string | null;
  fee_id: string | null;
  unit_amount_cents: number | null;
  metadata: unknown;
};

type PaymentRow = {
  parent_id: string | null;
  status: string | null;
  line_items: PaymentLineRow[] | null;
};

type AdjustmentRow = {
  parent_id: string | null;
  month_key: string | null;
  amount_cents: number | null;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 200);

  try {
    const guard = await requireAdminPermission(request, ['admin:payments']);
    if (!guard.ok) return guard.response;

    const { data: profileRows, error: profileError } = await supabaseService
      .from('user_profiles')
      .select('user_id')
      .eq('tenant_id', guard.tenantId)
      .eq('role', 'parent')
      .limit(5000);
    if (profileError) throw profileError;

    const parentIds = Array.from(
      new Set((profileRows ?? []).map((row) => row.user_id).filter((id): id is string => Boolean(id)))
    );
    if (!parentIds.length) {
      return NextResponse.json({ parents: [] });
    }

    const [{ data: parentRows, error: parentError }, { data: studentRows, error: studentError }] =
      await Promise.all([
        supabaseService.from('users').select('id, name, email').in('id', parentIds),
        supabaseService
          .from('students')
          .select('id, parent_id')
          .eq('tenant_id', guard.tenantId)
          .neq('record_type', 'prospect')
          .in('parent_id', parentIds),
      ]);
    if (parentError) throw parentError;
    if (studentError) throw studentError;

    const childIds = (studentRows ?? []).map((row) => row.id as string);
    const parentById = Object.fromEntries(
      (parentRows ?? []).map((row) => [row.id as string, { name: row.name ?? null, email: row.email ?? null }])
    );

    const [{ data: dueRows, error: dueError }, { data: paymentRows, error: paymentError }, { data: adjustmentRes, error: adjustmentError }] = await Promise.all([
      childIds.length > 0
        ? supabaseService
            .from('due_fee_months')
            .select('parent_id, child_id, fee_id, month_key, amount_cents')
            .in('parent_id', parentIds)
            .in('child_id', childIds)
        : Promise.resolve({ data: [], error: null }),
      supabaseService
        .from('payments')
        .select('parent_id, status, line_items:payment_line_items(child_id, fee_id, unit_amount_cents, metadata)')
        .eq('tenant_id', guard.tenantId)
        .in('parent_id', parentIds)
        .in('status', ['paid', 'refunded']),
      supabaseService
        .from('parent_balance_adjustments')
        .select('parent_id, month_key, amount_cents')
        .eq('tenant_id', guard.tenantId)
        .in('parent_id', parentIds),
    ]);
    if (dueError) throw dueError;
    if (paymentError) throw paymentError;
    if (adjustmentError) throw adjustmentError;

    const totalsByParent = new Map<
      string,
      {
        outstandingCents: number;
        totalDueCents: number;
        totalPaidCents: number;
        totalAdjustmentCents: number;
        months: string[];
      }
    >();

    const dueByKey = new Map<string, number>();
    ((dueRows ?? []) as DueRow[]).forEach((row) => {
      if (!row.parent_id || !row.child_id || !row.fee_id) return;
      const month = asMonthKey(row.month_key);
      if (!month) return;
      const amount = toCents(row.amount_cents);
      const key = keyForLine(row.parent_id, row.child_id, row.fee_id, month);
      dueByKey.set(key, (dueByKey.get(key) ?? 0) + amount);
    });

    const paidByKey = new Map<string, number>();
    ((paymentRows ?? []) as PaymentRow[]).forEach((payment) => {
      if (!payment.parent_id) return;
      const sign = payment.status === 'refunded' ? -1 : 1;
      (payment.line_items ?? []).forEach((line) => {
        if (!line.child_id || !line.fee_id) return;
        const months = parseLineMonths(line.metadata);
        if (!months.length) return;
        const unitAmount = toCents(line.unit_amount_cents);
        if (unitAmount <= 0) return;
        months.forEach((month) => {
          const key = keyForLine(payment.parent_id as string, line.child_id as string, line.fee_id as string, month);
          paidByKey.set(key, (paidByKey.get(key) ?? 0) + sign * unitAmount);
        });
      });
    });

    const ensureParent = (parentId: string) => {
      const existing = totalsByParent.get(parentId);
      if (existing) return existing;
      const created = {
        outstandingCents: 0,
        totalDueCents: 0,
        totalPaidCents: 0,
        totalAdjustmentCents: 0,
        months: [] as string[],
      };
      totalsByParent.set(parentId, created);
      return created;
    };

    dueByKey.forEach((dueAmount, key) => {
      const [parentId, , , month] = key.split(':');
      const current = ensureParent(parentId);
      const paidForKey = Math.max(paidByKey.get(key) ?? 0, 0);
      const paidAgainstDue = Math.min(paidForKey, dueAmount);
      const outstanding = Math.max(dueAmount - paidAgainstDue, 0);

      current.totalDueCents += dueAmount;
      current.totalPaidCents += paidAgainstDue;
      current.outstandingCents += outstanding;
      if (month && !current.months.includes(month)) current.months.push(month);
    });

    ((adjustmentRes ?? []) as AdjustmentRow[]).forEach((row) => {
      const parentId = row.parent_id as string | null;
      if (!parentId) return;
      const current = ensureParent(parentId);
      const month = asMonthKey(row.month_key);
      if (month && !current.months.includes(month)) current.months.push(month);

      const amount = Number(row.amount_cents ?? 0);
      current.outstandingCents += amount;
      current.totalAdjustmentCents += amount;
    });

    const parents = Array.from(totalsByParent.entries())
      .map(([parentId, totals]) => {
        const months = [...totals.months].sort();
        const parent = parentById[parentId] ?? { name: null, email: null };
        return {
          parentId,
          parentName: parent.name,
          email: parent.email,
          outstandingCents: totals.outstandingCents,
          totalDueCents: totals.totalDueCents,
          totalPaidCents: totals.totalPaidCents,
          totalAdjustmentCents: totals.totalAdjustmentCents,
          earliestDueMonth: months[0] ?? null,
        };
      })
      .filter((row) => row.outstandingCents !== 0)
      .sort((a, b) => b.outstandingCents - a.outstandingCents)
      .slice(0, limit);

    return NextResponse.json({ parents });
  } catch (error: unknown) {
    logPaymentError('admin-payments-outstanding', error);
    return NextResponse.json({ error: 'Failed to fetch outstanding list' }, { status: 500 });
  }
}
