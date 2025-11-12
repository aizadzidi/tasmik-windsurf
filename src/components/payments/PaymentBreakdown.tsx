import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatRinggit } from '@/lib/payments/pricingUtils';
import type { PaymentBreakdownProps } from './types';

export function PaymentBreakdown({
  cartItems,
  totalCents,
  merchantFeeCents,
  isSubmitting,
  onCheckout
}: PaymentBreakdownProps) {
  const hasItems = cartItems.length > 0;
  const grandTotal = totalCents + merchantFeeCents;

  return (
    <Card className="sticky top-4 rounded-3xl border border-slate-200 bg-white/95 shadow-lg/10">
      <CardContent className="space-y-5 p-6">
        <div>
          <p className="text-sm font-semibold text-slate-500">Ringkasan bayaran</p>
          <h3 className="text-2xl font-semibold text-slate-900">{formatRinggit(grandTotal)}</h3>
          <p className="text-sm text-slate-500">Jumlah akhir termasuk caj Billplz.</p>
        </div>

        {hasItems ? (
          <div className="space-y-3">
            {cartItems.map(item => (
              <div
                key={`${item.childId}-${item.feeId}-${item.months.join('-')}`}
                className="flex items-start justify-between gap-3 rounded-2xl bg-slate-50/80 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    {item.childName} · {item.feeName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {item.months.length > 0 ? item.months.join(', ') : `${item.quantity} unit`}
                  </p>
                </div>
                <span className="font-semibold">{formatRinggit(item.subtotalCents)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
            Pilih yuran untuk melihat pecahan dan meneruskan pembayaran.
          </p>
        )}

        <div className="space-y-1 rounded-2xl border border-slate-100 p-4 text-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span>Jumlah yuran</span>
            <span className="font-semibold text-slate-900">{formatRinggit(totalCents)}</span>
          </div>
          <div className="flex items-center justify-between text-slate-500">
            <span>Caj Billplz</span>
            <span className="font-semibold text-slate-900">{formatRinggit(merchantFeeCents)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-base font-semibold text-slate-900">
            <span>Jumlah perlu dibayar</span>
            <span>{formatRinggit(grandTotal)}</span>
          </div>
        </div>

        <Button
          disabled={!hasItems || isSubmitting}
          className="h-12 w-full rounded-2xl bg-slate-900 text-base font-semibold text-white hover:bg-slate-800"
          onClick={onCheckout}
        >
          {isSubmitting ? 'Menjana bil…' : 'Teruskan ke Billplz'}
        </Button>
        <div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
          <svg
            className="h-4 w-4 text-slate-400"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 11V7m0 10h.01M5.25 7h13.5A2.25 2.25 0 0 1 21 9.25v5.5A2.25 2.25 0 0 1 18.75 17h-13.5A2.25 2.25 0 0 1 3 14.75v-5.5A2.25 2.25 0 0 1 5.25 7Z" />
          </svg>
          <span>Transaksi selamat melalui Billplz FPX.</span>
        </div>
      </CardContent>
    </Card>
  );
}
