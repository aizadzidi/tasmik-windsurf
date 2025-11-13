import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatRinggit } from '@/lib/payments/pricingUtils';
import type { PaymentLineItem, PaymentRecord } from '@/types/payments';

type PaymentWithItems = PaymentRecord & { line_items?: PaymentLineItem[] };

interface PaymentHistoryProps {
  payments: PaymentWithItems[];
}

const STATUS_COLORS: Record<PaymentRecord['status'], { dot: string; badge: string; label: string }> = {
  paid: { dot: 'bg-emerald-500', badge: 'bg-emerald-100/80 text-emerald-800', label: 'Dibayar' },
  pending: { dot: 'bg-amber-500', badge: 'bg-amber-100/80 text-amber-900', label: 'Belum selesai' },
  failed: { dot: 'bg-rose-500', badge: 'bg-rose-100/80 text-rose-800', label: 'Gagal' },
  expired: { dot: 'bg-slate-400', badge: 'bg-slate-100/80 text-slate-700', label: 'Tamat tempoh' },
  refunded: { dot: 'bg-secondary', badge: 'bg-secondary/10 text-secondary', label: 'Dipulangkan' },
  draft: { dot: 'bg-primary/60', badge: 'bg-primary/10 text-primary', label: 'Draf' },
  initiated: { dot: 'bg-primary/60', badge: 'bg-primary/10 text-primary', label: 'Inisiasi' }
};

type LineItemMetadata = {
  months?: string[];
  childName?: string;
  feeName?: string;
  item?: string;
};

function formatMonthLabel(monthKey: string) {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey;
  const date = new Date(year, month - 1, 1);
  if (Number.isNaN(date.getTime())) return monthKey;
  return date.toLocaleDateString('ms-MY', { month: 'short', year: 'numeric' });
}

function extractLineItemDetails(lineItem: PaymentLineItem) {
  const metadata = (lineItem.metadata ?? {}) as LineItemMetadata;
  const labelParts = lineItem.label?.split('·').map(part => part.trim()).filter(Boolean) ?? [];
  const childFromLabel = labelParts.length > 1 ? labelParts[0] : undefined;
  const feeFromLabel = labelParts.length > 1 ? labelParts[1] : labelParts[0];

  const childName = metadata.childName ?? childFromLabel;
  const itemName = metadata.item ?? metadata.feeName ?? feeFromLabel ?? 'Yuran';
  const months = Array.isArray(metadata.months)
    ? metadata.months.filter((month): month is string => typeof month === 'string')
    : [];

  return {
    childName,
    itemName,
    months
  };
}

export function PaymentHistory({ payments }: PaymentHistoryProps) {
  const items = payments.slice(0, 5);

  return (
    <Card className="rounded-3xl border border-white/30 bg-white/80 backdrop-blur">
      <CardHeader>
        <CardTitle>Rekod pembayaran</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-primary/30 bg-gradient-to-r from-primary/5 to-secondary/5 px-3 py-4 text-sm text-primary/80">
            Belum ada bayaran direkodkan.
          </p>
        ) : (
          <ol className="relative space-y-5 border-l border-white/30 pl-6">
            {items.map(payment => {
              const style = STATUS_COLORS[payment.status] ?? STATUS_COLORS.draft;
              const lineItems = payment.line_items ?? [];
              return (
                <li key={payment.id} className="space-y-1">
                  <span className={`absolute -left-2 mt-2 h-3 w-3 rounded-full ${style.dot}`} />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {formatRinggit(payment.total_amount_cents)}
                    </p>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${style.badge}`}>
                      {style.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    {payment.created_at
                      ? new Date(payment.created_at).toLocaleString('ms-MY', {
                          dateStyle: 'medium',
                          timeStyle: 'short'
                        })
                      : 'Tarikh tidak tersedia'}
                  </p>
                  {lineItems.length > 0 && (
                    <div className="mt-3 rounded-2xl border border-white/25 bg-white/70 p-3 backdrop-blur">
                      <ul className="space-y-3">
                        {lineItems.map(lineItem => {
                          const { childName, itemName, months } = extractLineItemDetails(lineItem);
                          const monthLabel = months.length
                            ? months.map(formatMonthLabel).join(', ')
                            : null;
                          return (
                            <li key={lineItem.id ?? `${payment.id}-${itemName}`}>
                              <p className="text-sm font-semibold text-slate-900">{itemName}</p>
                              <p className="text-xs text-slate-600">
                                {childName ? `Anak: ${childName}` : 'Anak tidak diketahui'}
                                {monthLabel ? ` · Bulan: ${monthLabel}` : ''}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
