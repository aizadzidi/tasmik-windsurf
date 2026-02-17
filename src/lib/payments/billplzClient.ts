import { createHmac, timingSafeEqual } from 'crypto';
import type {
  BillplzBill,
  BillplzCallbackPayload,
  BillplzCreateResponse
} from '@/types/payments';
import type { BillplzRuntimeConfig } from '@/lib/payments/gatewayConfig';
import { logPaymentError } from '@/lib/payments/paymentLogging';

function requireEnv(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

type JsonRequestInit = Omit<RequestInit, 'body'> & { body?: Record<string, unknown> };

function resolveRuntimeConfig(config?: BillplzRuntimeConfig): BillplzRuntimeConfig {
  if (config) return config;

  const apiKey = requireEnv(process.env.BILLPLZ_API_KEY, 'BILLPLZ_API_KEY');
  const collectionId = requireEnv(process.env.BILLPLZ_COLLECTION_ID, 'BILLPLZ_COLLECTION_ID');
  const webhookSecret = requireEnv(process.env.BILLPLZ_X_SIGNATURE, 'BILLPLZ_X_SIGNATURE');
  const apiBase = process.env.BILLPLZ_API_BASE ?? 'https://www.billplz.com/api/v3';

  return {
    providerId: null,
    keyVersion: null,
    apiBase,
    apiKeys: [apiKey],
    primaryCollectionId: collectionId,
    allowedCollectionIds: [collectionId],
    webhookSecrets: [webhookSecret],
    source: 'env'
  };
}

async function requestBillplz<T>(
  path: string,
  init: JsonRequestInit = {},
  runtimeConfig?: BillplzRuntimeConfig
): Promise<T> {
  const config = resolveRuntimeConfig(runtimeConfig);
  const apiKeys = config.apiKeys.filter((key) => key.trim().length > 0);
  if (!apiKeys.length) {
    throw new Error('No Billplz API key configured');
  }

  const url = `${config.apiBase}${path}`;
  let lastError: Error | null = null;

  for (let index = 0; index < apiKeys.length; index += 1) {
    const key = apiKeys[index]!;
    const headers: HeadersInit = {
      Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers || {})
    };

    const response = await fetch(url, {
      ...init,
      headers,
      body: init.body ? JSON.stringify(init.body) : undefined
    });

    if (response.ok) {
      return response.json() as Promise<T>;
    }

    const errText = await response.text();
    const message = `Billplz error ${response.status}`;
    const isRecoverableAuthFailure = (response.status === 401 || response.status === 403) && index < apiKeys.length - 1;
    if (isRecoverableAuthFailure) {
      lastError = new Error(message);
      continue;
    }

    logPaymentError('billplz-request-failed', new Error(message), {
      status: response.status,
      response: errText
    });
    throw new Error(message);
  }

  throw lastError ?? new Error('Billplz request failed');
}

interface CreateBillInput {
  name: string;
  email: string;
  mobile: string;
  amountCents: number;
  description: string;
  callbackUrl: string;
  redirectUrl: string;
  reference1: string;
  reference2?: string;
}

export async function createBillplzBill(input: CreateBillInput): Promise<BillplzCreateResponse> {
  const config = resolveRuntimeConfig();
  return createBillplzBillWithConfig(input, config);
}

export async function createBillplzBillWithConfig(
  input: CreateBillInput,
  config: BillplzRuntimeConfig
): Promise<BillplzCreateResponse> {
  const payload = {
    collection_id: getBillplzCollectionId(config),
    name: input.name,
    email: input.email,
    mobile: input.mobile,
    amount: Math.max(0, Math.round(input.amountCents)),
    description: input.description,
    callback_url: input.callbackUrl,
    redirect_url: input.redirectUrl,
    reference_1: input.reference1,
    reference_2: input.reference2 ?? undefined,
    deliver: true
  };

  return requestBillplz<BillplzCreateResponse>('/bills', {
    method: 'POST',
    body: payload
  }, config);
}

export async function fetchBillplzBill(billId: string): Promise<BillplzBill> {
  const config = resolveRuntimeConfig();
  return fetchBillplzBillWithConfig(billId, config);
}

export async function fetchBillplzBillWithConfig(
  billId: string,
  config: BillplzRuntimeConfig
): Promise<BillplzBill> {
  return requestBillplz<BillplzBill>(`/bills/${billId}`, { method: 'GET' }, config);
}

export function getBillplzCollectionId(config?: BillplzRuntimeConfig): string {
  const resolved = resolveRuntimeConfig(config);
  return requireEnv(resolved.primaryCollectionId, 'BILLPLZ_COLLECTION_ID');
}

export function normalizeBillplzPayload(raw: Record<string, string>): BillplzCallbackPayload {
  const payload: Record<string, string> = {};

  Object.entries(raw).forEach(([key, value]) => {
    if (key.startsWith('billplz[')) {
      const inner = key.replace(/^billplz\[/, '').replace(/\]$/, '');
      payload[inner] = value;
    } else {
      payload[key] = value;
    }
  });

  return payload as BillplzCallbackPayload;
}

function verifyBillplzSignatureWithSecret(
  payload: BillplzCallbackPayload,
  secret: string
): boolean {
  const signature = payload.x_signature;
  if (!signature) return false;

  const dataString = Object.keys(payload)
    .filter(key => key !== 'x_signature')
    .sort()
    .map(key => `${key}${payload[key as keyof BillplzCallbackPayload] ?? ''}`)
    .join('|');

  const computed = createHmac('sha256', secret).update(dataString).digest('hex');
  if (!/^[0-9a-fA-F]+$/.test(signature)) return false;

  const computedBuffer = Buffer.from(computed, 'hex');
  const providedBuffer = Buffer.from(signature, 'hex');
  if (computedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(computedBuffer, providedBuffer);
}

export function verifyBillplzSignature(
  payload: BillplzCallbackPayload,
  config?: BillplzRuntimeConfig
): boolean {
  const resolved = resolveRuntimeConfig(config);
  return resolved.webhookSecrets.some((secret) => verifyBillplzSignatureWithSecret(payload, secret));
}

export function isAllowedBillplzCollection(
  collectionId: string | null | undefined,
  config?: BillplzRuntimeConfig
): boolean {
  if (!collectionId) return false;
  const resolved = resolveRuntimeConfig(config);
  return resolved.allowedCollectionIds.includes(collectionId);
}
