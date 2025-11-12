import type { FeeCatalogItem, PaymentRecord } from '@/types/payments';

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
