import type { PaymentCartItem, PaymentPreview } from '@/types/payments';

export const MERCHANT_FEE_CENTS = 150; // RM 1.50 flat per successful transaction

export function calculateSubtotal(unitAmountCents: number, quantity: number): number {
  return Math.max(0, unitAmountCents) * Math.max(1, quantity);
}

export function toRinggit(amountCents: number): number {
  return Math.round(amountCents) / 100;
}

export function formatRinggit(amountCents: number, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat('ms-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options
  }).format(toRinggit(amountCents));
}

export function buildPaymentPreview(
  items: PaymentCartItem[],
  merchantFeeCents = MERCHANT_FEE_CENTS
): PaymentPreview {
  const uniqueMonths = new Set<string>();
  let total = 0;

  items.forEach(item => {
    total += item.subtotalCents;
    item.months.forEach(month => uniqueMonths.add(month));
  });

  return {
    items,
    totalCents: total,
    merchantFeeCents,
    payableMonths: Array.from(uniqueMonths).sort()
  };
}

export function groupCartByChild(items: PaymentCartItem[]) {
  return items.reduce<Record<string, PaymentCartItem[]>>((acc, item) => {
    if (!acc[item.childId]) acc[item.childId] = [];
    acc[item.childId].push(item);
    return acc;
  }, {});
}

export function humanizeMonths(months: string[]): string {
  if (!months.length) return '-';
  return months
    .map(m => {
      const [year, month] = m.split('-').map(Number);
      if (!year || !month) return m;
      return new Date(year, month - 1).toLocaleDateString('ms-MY', {
        month: 'short',
        year: 'numeric'
      });
    })
    .join(', ');
}
