import type {
  AdminOutstandingSummary,
  AdminParentUser,
  FeeCatalogItem,
  FeeMetadata,
  ParentBalanceAdjustment,
  ParentOutstandingRow,
  PaymentRecord
} from '@/types/payments';

const ADMIN_PAYMENTS_BASE = '/api/admin/payments';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Permintaan gagal diproses.');
  }
  return response.json() as Promise<T>;
}

export async function fetchAdminPayments() {
  const response = await fetch(ADMIN_PAYMENTS_BASE, { cache: 'no-store' });
  return handleResponse<{ payments: PaymentRecord[] }>(response);
}

export async function fetchFeeCatalog() {
  const response = await fetch(`${ADMIN_PAYMENTS_BASE}/fees`, { cache: 'no-store' });
  return handleResponse<{ fees: FeeCatalogItem[] }>(response);
}

export interface FeePayload {
  name: string;
  description?: string;
  amount_cents: number;
  category: FeeCatalogItem['category'];
  billing_cycle: FeeCatalogItem['billing_cycle'];
  is_optional: boolean;
  metadata?: FeeMetadata;
  slug?: string;
}

export async function createFee(payload: FeePayload) {
  const response = await fetch(`${ADMIN_PAYMENTS_BASE}/fees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handleResponse<{ fee: FeeCatalogItem }>(response);
}

export async function updateFee(id: string, payload: Partial<FeePayload>) {
  const response = await fetch(`${ADMIN_PAYMENTS_BASE}/fees/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handleResponse<{ fee: FeeCatalogItem }>(response);
}

export async function deleteFee(id: string) {
  const response = await fetch(`${ADMIN_PAYMENTS_BASE}/fees/${id}`, {
    method: 'DELETE'
  });
  return handleResponse<{ success: boolean }>(response);
}

export async function fetchOutstandingSummary() {
  const response = await fetch(`${ADMIN_PAYMENTS_BASE}/summary`, { cache: 'no-store' });
  return handleResponse<{ summary: AdminOutstandingSummary }>(response);
}

export async function fetchOutstandingParents(limit = 50) {
  const response = await fetch(
    `${ADMIN_PAYMENTS_BASE}/outstanding?limit=${encodeURIComponent(limit)}`,
    { cache: 'no-store' }
  );
  return handleResponse<{ parents: ParentOutstandingRow[] }>(response);
}

export interface BalanceAdjustmentPayload {
  parentId: string;
  childId?: string | null;
  feeId?: string | null;
  monthKey?: string | null;
  amountCents: number;
  reason: string;
  createdBy?: string | null;
}

export async function listBalanceAdjustments(limit = 50) {
  const response = await fetch(
    `${ADMIN_PAYMENTS_BASE}/adjustments?limit=${encodeURIComponent(limit)}`,
    { cache: 'no-store' }
  );
  return handleResponse<{ adjustments: ParentBalanceAdjustment[] }>(response);
}

export async function createBalanceAdjustment(payload: BalanceAdjustmentPayload) {
  const response = await fetch(`${ADMIN_PAYMENTS_BASE}/adjustments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handleResponse<{ adjustment: ParentBalanceAdjustment }>(response);
}

export async function fetchParentUsers() {
  const response = await fetch(`${ADMIN_PAYMENTS_BASE}/parents`, { cache: 'no-store' });
  return handleResponse<{ parents: AdminParentUser[] }>(response);
}
