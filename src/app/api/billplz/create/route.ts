import { NextRequest, NextResponse } from 'next/server';
import { createBillplzBill } from '@/lib/payments/billplzClient';
import { buildPaymentPreview, calculateSubtotal, MERCHANT_FEE_CENTS } from '@/lib/payments/pricingUtils';
import {
  createPaymentRecord,
  recordPaymentEvent,
  updatePayment
} from '@/lib/payments/paymentsService';
import { isBillplzCreateBody } from '@/types/payments';
import type { PaymentCartItem } from '@/types/payments';

const appBaseUrl =
  process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const callbackUrl =
  process.env.BILLPLZ_CALLBACK_URL ?? `${appBaseUrl.replace(/\/$/, '')}/api/billplz/webhook`;

type PaymentCartItemInput = Omit<
  PaymentCartItem,
  'quantity' | 'unitAmountCents' | 'subtotalCents'
> &
  Partial<Pick<PaymentCartItem, 'quantity' | 'unitAmountCents' | 'subtotalCents'>>;

type CreateBillplzRequestBody = {
  parentId: string;
  payer: {
    name: string;
    email: string;
    mobile: string;
  };
  items: PaymentCartItemInput[];
  redirectUrl?: string;
  description?: string;
  merchantFeeCents?: number;
};

function sanitizePhone(phone: string) {
  return phone.replace(/[^0-9+]/g, '');
}

function isPaymentCartItemInput(item: unknown): item is PaymentCartItemInput {
  if (!item || typeof item !== 'object') return false;
  const candidate = item as Record<string, unknown>;
  const requiredStrings: Array<keyof PaymentCartItem> = ['childId', 'childName', 'feeId', 'feeName'];
  if (!requiredStrings.every(field => typeof candidate[field] === 'string')) {
    return false;
  }
  if (!Array.isArray(candidate.months) || !candidate.months.every(m => typeof m === 'string')) {
    return false;
  }
  const optionalNumericFields: Array<keyof PaymentCartItem> = ['quantity', 'unitAmountCents', 'subtotalCents'];
  if (
    optionalNumericFields.some(field => field in candidate && typeof candidate[field] !== 'number')
  ) {
    return false;
  }
  return true;
}

function isCreateBillplzRequestBody(body: unknown): body is CreateBillplzRequestBody {
  if (!body || typeof body !== 'object') return false;
  const candidate = body as Record<string, unknown>;
  if (typeof candidate.parentId !== 'string') return false;

  const payer = candidate.payer;
  if (
    !payer ||
    typeof payer !== 'object' ||
    typeof (payer as Record<string, unknown>).name !== 'string' ||
    typeof (payer as Record<string, unknown>).email !== 'string' ||
    typeof (payer as Record<string, unknown>).mobile !== 'string'
  ) {
    return false;
  }

  if (!Array.isArray(candidate.items) || !candidate.items.every(isPaymentCartItemInput)) {
    return false;
  }

  if (
    'redirectUrl' in candidate &&
    candidate.redirectUrl !== undefined &&
    typeof candidate.redirectUrl !== 'string'
  ) {
    return false;
  }

  if (
    'description' in candidate &&
    candidate.description !== undefined &&
    typeof candidate.description !== 'string'
  ) {
    return false;
  }

  if (
    'merchantFeeCents' in candidate &&
    candidate.merchantFeeCents !== undefined &&
    typeof candidate.merchantFeeCents !== 'number'
  ) {
    return false;
  }

  return true;
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();

    if (!isCreateBillplzRequestBody(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { parentId, payer, items, redirectUrl } = body;

    if (items.length === 0) {
      return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 });
    }

    const normalizedItems: PaymentCartItem[] = items.map(item => {
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

    const amountCents = preview.totalCents + preview.merchantFeeCents;
    const billPayloadCandidate = {
      name: payer.name,
      email: payer.email,
      amount: amountCents,
      description,
      reference_1: payment.id,
      reference_2: childrenSummary.slice(0, 20)
    };

    if (!isBillplzCreateBody(billPayloadCandidate)) {
      return NextResponse.json({ error: 'Invalid Billplz payload' }, { status: 400 });
    }

    const bill = await createBillplzBill({
      name: payer.name,
      email: payer.email,
      mobile: sanitizePhone(payer.mobile),
      amountCents,
      description,
      callbackUrl,
      redirectUrl: redirect,
      reference1: payment.id,
      reference2: billPayloadCandidate.reference_2
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
  } catch (error: unknown) {
    console.error('Billplz create error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to create Billplz bill'
      },
      { status: 500 }
    );
  }
}
