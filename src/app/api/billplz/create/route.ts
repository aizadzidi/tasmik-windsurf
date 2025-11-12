import { NextRequest, NextResponse } from 'next/server';
import { createBillplzBill } from '@/lib/payments/billplzClient';
import { buildPaymentPreview, calculateSubtotal, MERCHANT_FEE_CENTS } from '@/lib/payments/pricingUtils';
import {
  createPaymentRecord,
  recordPaymentEvent,
  updatePayment
} from '@/lib/payments/paymentsService';
import type { PaymentCartItem } from '@/types/payments';

const appBaseUrl =
  process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const callbackUrl =
  process.env.BILLPLZ_CALLBACK_URL ?? `${appBaseUrl.replace(/\/$/, '')}/api/billplz/webhook`;

function sanitizePhone(phone: string) {
  return phone.replace(/[^0-9+]/g, '');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { parentId, payer, items, redirectUrl } = body;

    if (!parentId) {
      return NextResponse.json({ error: 'Missing parentId' }, { status: 400 });
    }
    if (!payer?.name || !payer?.email || !payer?.mobile) {
      return NextResponse.json({ error: 'Missing payer details' }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 });
    }

    const normalizedItems: PaymentCartItem[] = items.map((item: PaymentCartItem) => {
      const quantity = item.quantity ?? 1;
      const unitAmount = item.unitAmountCents ?? 0;
      return {
        ...item,
        quantity,
        unitAmountCents: unitAmount,
        subtotalCents: item.subtotalCents ?? calculateSubtotal(unitAmount, quantity)
      };
    });

    const merchantFee =
      typeof body.merchantFeeCents === 'number' ? body.merchantFeeCents : MERCHANT_FEE_CENTS;
    const preview = buildPaymentPreview(normalizedItems, merchantFee);
    const payableMonths = preview.payableMonths;

    const payment = await createPaymentRecord({
      parentId,
      items: normalizedItems,
      totalCents: preview.totalCents,
      merchantFeeCents: preview.merchantFeeCents,
      payableMonths,
      status: 'initiated'
    });

    const childrenSummary = Array.from(new Set(normalizedItems.map(i => i.childName))).join(', ');
    const description =
      body.description ||
      `Yuran ${payableMonths.length ? payableMonths.join(', ') : 'semasa'} (${childrenSummary})`;

    const redirect =
      redirectUrl ??
      `${appBaseUrl.replace(/\/$/, '')}/parent/payments?paymentId=${encodeURIComponent(
        payment.id
      )}`;

    const bill = await createBillplzBill({
      name: payer.name,
      email: payer.email,
      mobile: sanitizePhone(payer.mobile),
      amountCents: preview.totalCents + preview.merchantFeeCents,
      description,
      callbackUrl,
      redirectUrl: redirect,
      reference1: payment.id,
      reference2: childrenSummary.slice(0, 20)
    });

    const updated = await updatePayment(payment.id, {
      billplzId: bill.id,
      status: 'pending',
      redirectUrl: bill.url,
      expiresAt: bill.due_at
    });

    await recordPaymentEvent(payment.id, 'app', 'billplz_bill_created', {
      bill,
      payment: updated
    });

    return NextResponse.json({
      paymentId: payment.id,
      billId: bill.id,
      billUrl: bill.url,
      due_at: bill.due_at
    });
  } catch (error: any) {
    console.error('Billplz create error:', error);
    return NextResponse.json(
      { error: error?.message ?? 'Failed to create Billplz bill' },
      { status: 500 }
    );
  }
}
