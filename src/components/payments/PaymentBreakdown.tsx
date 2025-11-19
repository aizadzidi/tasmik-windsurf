import { ArrowUpRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatRinggit } from '@/lib/payments/pricingUtils';
import type { PaymentBreakdownProps } from './types';

function formatMonthLabel(monthKey: string) {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey;
  const date = new Date(year, month - 1, 1);
  return Number.isNaN(date.getTime())
    ? monthKey
    : date.toLocaleDateString('ms-MY', { month: 'short', year: 'numeric' });
}

export function PaymentBreakdown({
  cartItems,
  totalCents,
  merchantFeeCents,
  isSubmitting,
  onCheckout,
  outstandingSelection,
  outstandingSelectionActive
}: PaymentBreakdownProps) {
  const hasSelection = cartItems.length > 0;
  const grandTotal = totalCents + merchantFeeCents;
  const buttonLabel = hasSelection
    ? isSubmitting
      ? 'Menjana bil…'
      : 'Teruskan ke bayaran'
    : 'Pilih yuran untuk bayar';

  const matchesOutstanding =
    outstandingSelectionActive &&
    !!outstandingSelection &&
    cartItems.length > 0 &&
    cartItems.every(
      item =>
        item.childId === outstandingSelection.childId &&
        item.months.length > 0 &&
        item.months.every(month => month === outstandingSelection.monthKey)
    );

  return (
    <Card className="rounded-2xl border border-slate-100 bg-white shadow-md lg:sticky lg:top-24">
      <CardContent className="space-y-5 p-5 lg:p-6">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900 tracking-tight">Ringkasan bayaran</p>
          <h3 className="text-3xl font-bold tracking-tight text-slate-900">{formatRinggit(grandTotal)}</h3>
          <p className="text-xs text-slate-500 sm:text-[13px]">
            {hasSelection ? 'Jumlah akhir termasuk caj transaksi.' : 'Pilih yuran untuk melihat pecahan bayaran.'}
          </p>
        </div>

        {hasSelection ? (
          <div className="space-y-3">
            {matchesOutstanding && outstandingSelection && (
              <p className="text-xs font-medium text-slate-600">
                Tunggakan {formatMonthLabel(outstandingSelection.monthKey)} – {outstandingSelection.childName}
              </p>
            )}
            {cartItems.map(item => (
              <div
                key={`${item.childId}-${item.feeId}-${item.months.join('-')}`}
                className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    {item.childName} · {item.feeName}
                  </p>
                  <p className="text-xs text-slate-600">
                    {item.months.length > 0
                      ? item.months.map(month => formatMonthLabel(month)).join(', ')
                      : `${item.quantity} unit`}
                  </p>
                </div>
                <span className="font-semibold">{formatRinggit(item.subtotalCents)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
            Pilih yuran untuk melihat pecahan bayaran di sini.
          </div>
        )}

        {hasSelection ? (
          <dl className="mt-2 space-y-1.5 rounded-xl border border-slate-100 p-4 text-sm">
            <div className="flex items-center justify-between text-xs text-slate-600 sm:text-sm">
              <dt>Jumlah yuran</dt>
              <dd className="font-semibold text-slate-900">{formatRinggit(totalCents)}</dd>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-600 sm:text-sm">
              <dt>Caj transaksi</dt>
              <dd className="font-semibold text-slate-900">{formatRinggit(merchantFeeCents)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm font-semibold text-slate-900">
              <dt>Jumlah perlu dibayar</dt>
              <dd>{formatRinggit(grandTotal)}</dd>
            </div>
          </dl>
        ) : (
          <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm text-slate-600">
            Jumlah perlu dibayar: {formatRinggit(grandTotal)}
          </div>
        )}

        <Button
          disabled={!hasSelection || isSubmitting}
          className="h-11 w-full rounded-xl bg-indigo-600 text-[15px] font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onCheckout}
        >
          <span className="flex w-full items-center justify-center gap-2">
            {buttonLabel}
            {!isSubmitting && hasSelection && <ArrowUpRight className="h-4 w-4" />}
          </span>
        </Button>
        <p className="text-[11px] text-center text-slate-500">
          Pembayaran diproses secara selamat melalui perbankan internet (FPX).
        </p>
      </CardContent>
    </Card>
  );
}
