import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatRinggit } from '@/lib/payments/pricingUtils';
import type { PaymentRecord } from '@/types/payments';

interface PaymentHistoryProps {
  payments: PaymentRecord[];
}

const STATUS_COLORS: Record<PaymentRecord['status'], { dot: string; badge: string; label: string }> = {
  paid: { dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700', label: 'Dibayar' },
  pending: { dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800', label: 'Belum selesai' },
  failed: { dot: 'bg-rose-500', badge: 'bg-rose-100 text-rose-700', label: 'Gagal' },
  expired: { dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-700', label: 'Tamat tempoh' },
  refunded: { dot: 'bg-indigo-500', badge: 'bg-indigo-100 text-indigo-700', label: 'Dipulangkan' },
  draft: { dot: 'bg-slate-300', badge: 'bg-slate-100 text-slate-600', label: 'Draf' },
  initiated: { dot: 'bg-slate-300', badge: 'bg-slate-100 text-slate-600', label: 'Inisiasi' }
};

export function PaymentHistory({ payments }: PaymentHistoryProps) {
  const items = payments.slice(0, 5);

  return (
    <Card className="rounded-3xl border border-slate-200 bg-white/80">
      <CardHeader>
        <CardTitle>Rekod pembayaran</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
            Belum ada bayaran direkodkan.
          </p>
        ) : (
          <ol className="relative space-y-5 border-l border-slate-200 pl-6">
            {items.map(payment => {
              const style = STATUS_COLORS[payment.status] ?? STATUS_COLORS.draft;
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
                  <p className="text-xs text-slate-500">
                    {payment.created_at
                      ? new Date(payment.created_at).toLocaleString('ms-MY', {
                          dateStyle: 'medium',
                          timeStyle: 'short'
                        })
                      : 'Tarikh tidak tersedia'}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
