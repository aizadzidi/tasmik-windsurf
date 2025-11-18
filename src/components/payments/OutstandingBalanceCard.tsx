import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { formatRinggit, humanizeMonths } from '@/lib/payments/pricingUtils';
import type { OutstandingChildSummary } from './types';

interface OutstandingBalanceCardProps {
  totalCents: number;
  earliestDueMonth: string | null;
  childSummaries: OutstandingChildSummary[];
  isLoading?: boolean;
  onPayNow?: () => void;
  onViewHistory?: () => void;
}

const STATUS_STYLES: Record<
  OutstandingChildSummary['status'],
  { label: string; badge: string; accent: string }
> = {
  past_due: {
    label: 'Tertunggak',
    badge: 'bg-rose-100/80 text-rose-900',
    accent: 'border-rose-100/70 bg-rose-50/70'
  },
  due_now: {
    label: 'Bulan ini',
    badge: 'bg-amber-100/80 text-amber-900',
    accent: 'border-amber-100/70 bg-amber-50/70'
  },
  upcoming: {
    label: 'Akan datang',
    badge: 'bg-emerald-100/80 text-emerald-900',
    accent: 'border-emerald-100/70 bg-emerald-50/70'
  }
};

function formatDueMonth(monthKey: string | null) {
  if (!monthKey) return null;
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  const date = new Date(year, month - 1, 1);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('ms-MY', { month: 'long', year: 'numeric' });
}

export function OutstandingBalanceCard({
  totalCents,
  earliestDueMonth,
  childSummaries,
  isLoading = false,
  onPayNow,
  onViewHistory
}: OutstandingBalanceCardProps) {
  const normalizedTotal = Math.abs(totalCents);
  const hasBalance = normalizedTotal > 0;
  const isOutstanding = normalizedTotal > 0;
  const visibleChildren = childSummaries.slice(0, 3);
  const remainingChildren = childSummaries.length - visibleChildren.length;
  const dueMonthLabel = formatDueMonth(earliestDueMonth);

  const renderItemLabel = (months: string[]) => {
    if (months.length) return humanizeMonths(months);
    if (dueMonthLabel) return `Tunggakan bermula ${dueMonthLabel}`;
    return 'Yuran khas';
  };

  return (
    <Card
      className={cn(
        'rounded-3xl border shadow-xl backdrop-blur',
        isOutstanding ? 'border-rose-200/70 bg-rose-50/80' : 'border-emerald-200/60 bg-emerald-50/70'
      )}
    >
      <CardContent className="space-y-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary/70">Baki tertunggak</p>
            <div className="flex flex-wrap items-baseline gap-3">
              <span
                className={cn(
                  'text-3xl font-semibold',
                  isOutstanding ? 'text-rose-700' : 'text-emerald-700'
                )}
              >
                {formatRinggit(normalizedTotal)}
              </span>
              {dueMonthLabel && isOutstanding && (
                <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-rose-800 shadow-sm">
                  Tamat tempoh {dueMonthLabel}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-600">
              {isOutstanding
                ? 'Yuran tertunggak masih ada. Selesaikan bayaran untuk mengelak gangguan pembelajaran anak.'
                : hasBalance
                  ? 'Anda mempunyai baki kredit. Baki ini akan ditolak daripada caj seterusnya.'
                  : 'Hebat! Semua yuran anak anda telah dikemas kini.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="rounded-2xl px-5 text-sm font-semibold shadow-lg"
              onClick={onPayNow}
              disabled={!onPayNow}
            >
              Bayar sekarang
            </Button>
            <Button
              variant="outline"
              className="rounded-2xl border-white/60 bg-white/40 text-sm font-semibold text-slate-700"
              onClick={onViewHistory}
            >
              Lihat rekod
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="animate-pulse space-y-3 rounded-2xl border border-white/50 bg-white/40 p-4">
            <div className="h-4 rounded-full bg-slate-200/70" />
            <div className="h-4 rounded-full bg-slate-200/70" />
            <div className="h-4 rounded-full bg-slate-200/70" />
          </div>
        ) : isOutstanding ? (
          <>
            {childSummaries.length > 0 ? (
              <div className="space-y-3">
                {visibleChildren.map(child => {
                  const style = STATUS_STYLES[child.status];
                  return (
                    <div
                      key={child.childId}
                      className={cn(
                        'flex flex-col gap-2 rounded-2xl border bg-white/70 p-4 shadow-sm'
                      )}
                    >
                      <p className="text-sm font-semibold text-slate-900">{child.childName}</p>
                      <p className="text-xs text-slate-600">{renderItemLabel(child.months)}</p>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-lg font-semibold text-slate-900">{formatRinggit(child.amountCents)}</p>
                        <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', style.badge)}>
                          {style.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-rose-100 bg-white/70 px-4 py-3 text-sm text-rose-700">
                Caj tertunggak telah dikonfigurasi oleh pentadbir
                {dueMonthLabel ? ` (bermula ${dueMonthLabel})` : ''}. Sila rujuk butiran bil atau tekan “Bayar
                sekarang” untuk melihat jumlah yang perlu dilangsaikan.
              </div>
            )}
          </>
        ) : hasBalance ? (
          <div className="rounded-2xl border border-emerald-200 bg-white/70 px-4 py-3 text-sm text-emerald-700">
            Tiada yuran tertunggak buat masa ini. Baki kredit anda akan digunakan untuk bil akan datang.
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-200 bg-white/70 px-4 py-3 text-sm text-emerald-700">
            Tiada yuran tertunggak buat masa ini. Teruskan memantau notifikasi untuk sebarang caj baharu.
          </div>
        )}

        {remainingChildren > 0 && isOutstanding && (
          <p className="text-xs text-slate-600">
            +{remainingChildren} anak lagi mempunyai yuran tertunggak. Pergi ke Rekod Bayaran untuk senarai penuh.
          </p>
        )}

        {isOutstanding && (
          <p className="text-xs text-slate-500">
            Jika bayaran telah dibuat di luar sistem, hubungi pentadbir supaya bulan berkenaan ditanda sebagai selesai.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
