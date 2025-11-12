import { NextRequest, NextResponse } from 'next/server';
import {
  normalizeBillplzPayload,
  verifyBillplzSignature
} from '@/lib/payments/billplzClient';
import {
  getPaymentByBillplzId,
  recordPaymentEvent,
  updatePayment
} from '@/lib/payments/paymentsService';
import type { PaymentStatus } from '@/types/payments';

function parseFormEncoded(body: string) {
  const params = new URLSearchParams(body);
  const out: Record<string, string> = {};
  params.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function resolveStatus(payload: ReturnType<typeof normalizeBillplzPayload>): PaymentStatus {
  const isPaid = payload.paid === 'true' || payload.paid === '1';
  if (isPaid) return 'paid';
  if (payload.state === 'expired') return 'expired';
  if (payload.state === 'pending') return 'pending';
  return 'failed';
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const parsed = parseFormEncoded(rawBody);
    const payload = normalizeBillplzPayload(parsed);

    if (!verifyBillplzSignature(payload)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const billId = payload.id;
    if (!billId) {
      return NextResponse.json({ error: 'Missing bill ID' }, { status: 400 });
    }

    const payment = await getPaymentByBillplzId(billId);
    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    const status = resolveStatus(payload);
    const paidAt =
      status === 'paid'
        ? payload.paid_at || new Date().toISOString()
        : status === 'failed'
          ? null
          : payment.paid_at ?? null;

    await updatePayment(payment.id, {
      status,
      paidAt
    });

    await recordPaymentEvent(payment.id, 'billplz', 'webhook', payload);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Billplz webhook error:', error);
    return NextResponse.json(
      { error: error?.message ?? 'Failed to process webhook' },
      { status: 500 }
    );
  }
}
