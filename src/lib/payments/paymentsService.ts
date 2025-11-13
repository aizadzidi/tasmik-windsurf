import { supabaseService } from '@/lib/supabaseServiceClient';
import type {
  PaymentCartItem,
  PaymentLineItem,
  PaymentRecord,
  PaymentStatus
} from '@/types/payments';

interface CreatePaymentInput {
  parentId: string;
  items: PaymentCartItem[];
  totalCents: number;
  merchantFeeCents: number;
  payableMonths: string[];
  status?: PaymentStatus;
  billplzId?: string | null;
  redirectUrl?: string | null;
}

interface UpdatePaymentInput {
  billplzId?: string | null;
  totalCents?: number;
  merchantFeeCents?: number;
  status?: PaymentStatus;
  paidAt?: string | null;
  expiresAt?: string | null;
  redirectUrl?: string | null;
}

type PaymentRecordWithLines = PaymentRecord & {
  line_items?: PaymentLineItem[] | null;
};

export async function createPaymentRecord(input: CreatePaymentInput): Promise<PaymentRecord> {
  const { data, error } = await supabaseService
    .from('payments')
    .insert([
      {
        parent_id: input.parentId,
        status: input.status ?? 'initiated',
        total_amount_cents: input.totalCents,
        merchant_fee_cents: input.merchantFeeCents,
        payable_months: input.payableMonths,
        billplz_id: input.billplzId ?? null,
        redirect_url: input.redirectUrl ?? null
      }
    ])
    .select('*')
    .single();

  if (error || !data) {
    console.error('Failed to create payment record:', error);
    throw new Error(error?.message ?? 'Unable to create payment');
  }

  if (input.items.length) {
    const linePayload = input.items.map(item => ({
      payment_id: data.id,
      child_id: item.childId,
      fee_id: item.feeId,
      label: `${item.childName} · ${item.feeName}`,
      quantity: item.quantity,
      unit_amount_cents: item.unitAmountCents,
      subtotal_cents: item.subtotalCents,
      metadata: {
        months: item.months,
        childName: item.childName,
        feeName: item.feeName
      }
    }));

    const { error: lineError } = await supabaseService
      .from('payment_line_items')
      .insert(linePayload);

    if (lineError) {
      console.error('Failed to insert payment line items:', lineError);
      throw new Error(lineError.message);
    }
  }

  return data as PaymentRecord;
}

export async function recordPaymentEvent(
  paymentId: string,
  source: string,
  eventType: string,
  payload: Record<string, unknown>
) {
  const { error } = await supabaseService
    .from('payment_events')
    .insert([
      {
        payment_id: paymentId,
        source,
        event_type: eventType,
        payload
      }
    ]);

  if (error) {
    console.error('Failed to record payment event:', error);
  }
}

export async function updatePayment(paymentId: string, updates: UpdatePaymentInput) {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };

  if (typeof updates.billplzId !== 'undefined') patch.billplz_id = updates.billplzId;
  if (typeof updates.totalCents !== 'undefined') patch.total_amount_cents = updates.totalCents;
  if (typeof updates.merchantFeeCents !== 'undefined') patch.merchant_fee_cents = updates.merchantFeeCents;
  if (typeof updates.status !== 'undefined') patch.status = updates.status;
  if (typeof updates.paidAt !== 'undefined') patch.paid_at = updates.paidAt;
  if (typeof updates.expiresAt !== 'undefined') patch.expires_at = updates.expiresAt;
  if (typeof updates.redirectUrl !== 'undefined') patch.redirect_url = updates.redirectUrl;

  const { data, error } = await supabaseService
    .from('payments')
    .update(patch)
    .eq('id', paymentId)
    .select('*')
    .single();

  if (error || !data) {
    console.error('Failed to update payment:', error);
    throw new Error(error?.message ?? 'Unable to update payment');
  }

  return data as PaymentRecord;
}

export async function getPaymentByBillplzId(billId: string) {
  const { data, error } = await supabaseService
    .from('payments')
    .select('*, line_items:payment_line_items(*)')
    .eq('billplz_id', billId)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch payment by Billplz ID:', error);
    throw new Error(error.message);
  }

  return data as PaymentRecordWithLines | null;
}

export async function getPaymentById(paymentId: string) {
  const { data, error } = await supabaseService
    .from('payments')
    .select('*, line_items:payment_line_items(*)')
    .eq('id', paymentId)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch payment:', error);
    throw new Error(error.message);
  }

  return data as PaymentRecordWithLines | null;
}
