import { supabaseService } from '@/lib/supabaseServiceClient';
import { logPaymentError } from '@/lib/payments/paymentLogging';
import type {
  PaymentCartItem,
  PaymentLineItem,
  PaymentRecord,
  PaymentStatus
} from '@/types/payments';

interface CreatePaymentInput {
  tenantId?: string;
  providerId?: string | null;
  parentId: string;
  items: PaymentCartItem[];
  totalCents: number;
  merchantFeeCents: number;
  payableMonths: string[];
  idempotencyKey?: string | null;
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

export type AtomicWebhookProcessInput = {
  tenantId: string;
  billplzId: string;
  providerEventId: string;
  webhookFingerprint: string;
  receivedAmountCents: number;
  paid: boolean;
  state?: string | null;
  dueAt?: string | null;
  paidAt?: string | null;
  payload: Record<string, unknown>;
};

export type AtomicWebhookProcessResult = {
  outcome: 'processed' | 'replay' | 'ignored' | 'rejected' | 'not_found';
  paymentId: string | null;
  currentStatus: PaymentStatus | null;
  nextStatus: PaymentStatus | null;
};

type PaymentRecordWithLines = PaymentRecord & {
  line_items?: PaymentLineItem[] | null;
};

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { message?: string; details?: string };
  const combined = `${candidate.message ?? ''} ${candidate.details ?? ''}`.toLowerCase();
  return combined.includes(columnName.toLowerCase()) && combined.includes('column');
}

function isUniqueViolationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string; message?: string };
  return candidate.code === '23505' || (candidate.message ?? '').toLowerCase().includes('duplicate key');
}

function isMissingFunctionError(error: unknown, functionName: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { message?: string; details?: string };
  const text = `${candidate.message ?? ''} ${candidate.details ?? ''}`.toLowerCase();
  return text.includes(functionName.toLowerCase()) && text.includes('function');
}

export class PaymentIdempotencyConflictError extends Error {
  constructor() {
    super('Payment request is already in progress.');
    this.name = 'PaymentIdempotencyConflictError';
  }
}

export async function createPaymentRecord(input: CreatePaymentInput): Promise<PaymentRecord> {
  const insertPayload: Record<string, unknown> = {
    tenant_id: input.tenantId,
    provider_id: input.providerId ?? undefined,
    parent_id: input.parentId,
    status: input.status ?? 'initiated',
    total_amount_cents: input.totalCents,
    merchant_fee_cents: input.merchantFeeCents,
    payable_months: input.payableMonths,
    billplz_id: input.billplzId ?? null,
    redirect_url: input.redirectUrl ?? null,
    idempotency_key: input.idempotencyKey ?? null
  };

  let insertedWithIdempotencyColumn = true;
  let { data, error } = await supabaseService
    .from('payments')
    .insert([insertPayload])
    .select('*')
    .single();

  if (error && isMissingColumnError(error, 'idempotency_key')) {
    insertedWithIdempotencyColumn = false;
    const fallbackPayload = { ...insertPayload };
    delete fallbackPayload.idempotency_key;
    const retry = await supabaseService
      .from('payments')
      .insert([fallbackPayload])
      .select('*')
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    if (isUniqueViolationError(error) && input.idempotencyKey) {
      throw new PaymentIdempotencyConflictError();
    }
    logPaymentError('create-payment-record', error, {
      tenantId: input.tenantId,
      parentId: input.parentId
    });
    throw new Error(error?.message ?? 'Unable to create payment');
  }

  if (input.items.length) {
    const linePayload = input.items.map(item => ({
      payment_id: data.id,
      tenant_id: input.tenantId,
      child_id: item.childId,
      fee_id: item.feeId,
      label: `${item.childName} · ${item.feeName}`,
      quantity: item.quantity,
      unit_amount_cents: item.unitAmountCents,
      subtotal_cents: item.subtotalCents,
      metadata: {
        months: item.months,
        childName: item.childName,
        feeName: item.feeName,
        idempotencyKey: input.idempotencyKey ?? null
      }
    }));

    const { error: lineError } = await supabaseService
      .from('payment_line_items')
      .insert(linePayload);

    if (lineError) {
      logPaymentError('create-payment-line-items', lineError, { paymentId: data.id });
      throw new Error(lineError.message);
    }
  }

  if (input.idempotencyKey && !insertedWithIdempotencyColumn) {
    const { error: idempotencyError } = await supabaseService
      .from('payments')
      .update({ idempotency_key: input.idempotencyKey })
      .eq('id', data.id);

    if (idempotencyError && !isMissingColumnError(idempotencyError, 'idempotency_key')) {
      logPaymentError('persist-payment-idempotency-key', idempotencyError, { paymentId: data.id });
      throw new Error(idempotencyError.message);
    }
  }

  return data as PaymentRecord;
}

export async function recordPaymentEvent(
  paymentId: string,
  source: string,
  eventType: string,
  payload: Record<string, unknown>,
  options?: {
    tenantId?: string | null;
    providerId?: string | null;
    providerEventId?: string | null;
    providerEventFingerprint?: string | null;
  }
) {
  const eventPayload: Record<string, unknown> = {
    tenant_id: options?.tenantId ?? undefined,
    provider_id: options?.providerId ?? undefined,
    provider_event_id: options?.providerEventId ?? undefined,
    provider_event_fingerprint: options?.providerEventFingerprint ?? undefined,
    payment_id: paymentId,
    source,
    event_type: eventType,
    payload
  };

  let { error } = await supabaseService
    .from('payment_events')
    .insert([eventPayload]);

  if (error && isMissingColumnError(error, 'provider_event_fingerprint')) {
    const fallbackPayload = { ...eventPayload };
    delete fallbackPayload.provider_event_fingerprint;
    const retry = await supabaseService
      .from('payment_events')
      .insert([fallbackPayload]);
    error = retry.error;
  }

  if (error && isMissingColumnError(error, 'provider_event_id')) {
    const fallbackPayload = { ...eventPayload };
    delete fallbackPayload.provider_event_id;
    delete fallbackPayload.provider_event_fingerprint;
    delete fallbackPayload.provider_id;
    const retry = await supabaseService
      .from('payment_events')
      .insert([fallbackPayload]);
    error = retry.error;
  }

  if (error) {
    logPaymentError('record-payment-event', error, { paymentId, source, eventType });
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
    logPaymentError('update-payment', error, { paymentId });
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
    logPaymentError('get-payment-by-billplz-id', error, { billId });
    throw new Error(error.message);
  }

  return data as PaymentRecordWithLines | null;
}

export async function findRecentPendingPaymentByIdempotencyKey(
  tenantId: string,
  parentId: string,
  idempotencyKey: string,
  windowMinutes = 30
) {
  const cutoffIso = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const byColumnQuery = await supabaseService
    .from('payments')
    .select('*, line_items:payment_line_items(*)')
    .eq('tenant_id', tenantId)
    .eq('parent_id', parentId)
    .eq('idempotency_key', idempotencyKey)
    .in('status', ['initiated', 'pending'])
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!byColumnQuery.error && byColumnQuery.data && byColumnQuery.data.length > 0) {
    return byColumnQuery.data[0] as PaymentRecordWithLines;
  }

  const useMetadataFallback = Boolean(
    byColumnQuery.error && isMissingColumnError(byColumnQuery.error, 'idempotency_key')
  );
  if (byColumnQuery.error && !useMetadataFallback) {
    logPaymentError('find-recent-idempotent-payment', byColumnQuery.error, {
      tenantId,
      parentId
    });
    throw new Error(byColumnQuery.error.message);
  }

  const { data, error } = await supabaseService
    .from('payments')
    .select('*, line_items:payment_line_items(*)')
    .eq('tenant_id', tenantId)
    .eq('parent_id', parentId)
    .in('status', ['initiated', 'pending'])
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) {
    logPaymentError('find-recent-idempotent-payment-fallback', error, {
      tenantId,
      parentId
    });
    throw new Error(error.message);
  }

  const match = (data ?? []).find((payment) =>
    (payment.line_items ?? []).some((line: PaymentLineItem) => {
      const metadata = line?.metadata;
      const metaRecord =
        metadata && typeof metadata === 'object' && !Array.isArray(metadata)
          ? (metadata as Record<string, unknown>)
          : null;
      return (
        metaRecord &&
        typeof metaRecord.idempotencyKey === 'string' &&
        metaRecord.idempotencyKey === idempotencyKey
      );
    })
  );

  return (match as PaymentRecordWithLines | undefined) ?? null;
}

export async function hasProcessedWebhookEvent(
  paymentId: string,
  webhookFingerprint: string
): Promise<boolean> {
  const { data, error } = await supabaseService
    .from('payment_events')
    .select('id')
    .eq('payment_id', paymentId)
    .eq('source', 'billplz')
    .eq('event_type', 'webhook_processed')
    .contains('payload', { fingerprint: webhookFingerprint })
    .limit(1);

  if (error) {
    logPaymentError('has-processed-webhook-event', error, { paymentId });
    return false;
  }

  return Boolean(data && data.length > 0);
}

export async function getPaymentById(paymentId: string) {
  const { data, error } = await supabaseService
    .from('payments')
    .select('*, line_items:payment_line_items(*)')
    .eq('id', paymentId)
    .maybeSingle();

  if (error) {
    logPaymentError('get-payment-by-id', error, { paymentId });
    throw new Error(error.message);
  }

  return data as PaymentRecordWithLines | null;
}

type AtomicWebhookRpcRow = {
  outcome?: string | null;
  payment_id?: string | null;
  current_status?: PaymentStatus | null;
  next_status?: PaymentStatus | null;
};

export async function processBillplzWebhookAtomically(
  input: AtomicWebhookProcessInput
): Promise<AtomicWebhookProcessResult | null> {
  const { data, error } = await supabaseService.rpc('process_billplz_webhook_event', {
    p_tenant_id: input.tenantId,
    p_billplz_id: input.billplzId,
    p_provider_event_id: input.providerEventId,
    p_webhook_fingerprint: input.webhookFingerprint,
    p_received_amount_cents: input.receivedAmountCents,
    p_paid: input.paid,
    p_state: input.state ?? null,
    p_due_at: input.dueAt ?? null,
    p_paid_at: input.paidAt ?? null,
    p_payload: input.payload
  });

  if (error) {
    if (isMissingFunctionError(error, 'process_billplz_webhook_event')) {
      return null;
    }
    logPaymentError('process-billplz-webhook-atomically', error, {
      tenantId: input.tenantId,
      billplzId: input.billplzId
    });
    throw new Error(error.message);
  }

  const row =
    Array.isArray(data) && data.length > 0
      ? (data[0] as AtomicWebhookRpcRow)
      : (data as AtomicWebhookRpcRow | null);

  if (!row) {
    return {
      outcome: 'rejected',
      paymentId: null,
      currentStatus: null,
      nextStatus: null
    };
  }

  return {
    outcome:
      row.outcome === 'processed' ||
      row.outcome === 'replay' ||
      row.outcome === 'ignored' ||
      row.outcome === 'rejected' ||
      row.outcome === 'not_found'
        ? row.outcome
        : 'rejected',
    paymentId: row.payment_id ?? null,
    currentStatus: row.current_status ?? null,
    nextStatus: row.next_status ?? null
  };
}
