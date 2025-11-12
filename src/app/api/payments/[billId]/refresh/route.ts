import { NextRequest, NextResponse } from 'next/server';
import { fetchBillplzBill } from '@/lib/payments/billplzClient';
import {
  getPaymentByBillplzId,
  recordPaymentEvent,
  updatePayment
} from '@/lib/payments/paymentsService';
import type { PaymentStatus } from '@/types/payments';

type RefreshRouteContext = {
  params: Promise<{ billId: string }>;
};

function mapBillStatus(paid: boolean, state: string | undefined): PaymentStatus {
  if (paid) return 'paid';
  if (state === 'overdue' || state === 'expired') return 'failed';
  if (state === 'pending') return 'pending';
  return 'initiated';
}

export async function GET(_request: NextRequest, context: RefreshRouteContext) {
  try {
    const { billId } = await context.params;
    const bill = await fetchBillplzBill(billId);
    const payment = await getPaymentByBillplzId(billId);
    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    const status = mapBillStatus(bill.paid, bill.state);

    const updated = await updatePayment(payment.id, {
      status,
      paidAt: bill.paid ? bill.paid_at ?? new Date().toISOString() : null,
      expiresAt: bill.due_at ?? null
    });

    await recordPaymentEvent(payment.id, 'app', 'billplz_refresh', { bill, updated });

    return NextResponse.json({ payment: updated, bill });
  } catch (error: any) {
    console.error('Refresh payment error:', error);
    return NextResponse.json(
      { error: error?.message ?? 'Failed to refresh payment' },
      { status: 500 }
    );
  }
}
