import { createHmac } from 'crypto';
import type {
  BillplzBill,
  BillplzCallbackPayload,
  BillplzCreateResponse
} from '@/types/payments';

const apiKey = process.env.BILLPLZ_API_KEY;
const collectionId = process.env.BILLPLZ_COLLECTION_ID;
const apiBase = process.env.BILLPLZ_API_BASE ?? 'https://www.billplz.com/api/v3';
const signatureSecret = process.env.BILLPLZ_X_SIGNATURE;

function requireEnv(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

async function requestBillplz<T>(
  path: string,
  init: RequestInit & { body?: Record<string, unknown> } = {}
): Promise<T> {
  const key = requireEnv(apiKey, 'BILLPLZ_API_KEY');
  const url = `${apiBase}${path}`;
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

  if (!response.ok) {
    const err = await response.text();
    console.error('Billplz request failed', response.status, err);
    throw new Error(`Billplz error ${response.status}`);
  }

  return response.json() as Promise<T>;
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
  const payload = {
    collection_id: requireEnv(collectionId, 'BILLPLZ_COLLECTION_ID'),
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
  });
}

export async function fetchBillplzBill(billId: string): Promise<BillplzBill> {
  return requestBillplz<BillplzBill>(`/bills/${billId}`, { method: 'GET' });
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

export function verifyBillplzSignature(payload: BillplzCallbackPayload): boolean {
  const secret = requireEnv(signatureSecret, 'BILLPLZ_X_SIGNATURE');
  const signature = payload.x_signature;
  if (!signature) return false;

  const dataString = Object.keys(payload)
    .filter(key => key !== 'x_signature')
    .sort()
    .map(key => `${key}${payload[key as keyof BillplzCallbackPayload] ?? ''}`)
    .join('|');

  const computed = createHmac('sha256', secret).update(dataString).digest('hex');
  return computed === signature;
}
