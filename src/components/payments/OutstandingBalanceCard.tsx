import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatRinggit, humanizeMonths } from '@/lib/payments/pricingUtils';
import type { OutstandingChildSummary } from './types';

interface OutstandingBalanceCardProps {
  totalCents: number;
  earliestDueMonth: string | null;
  childSummaries: OutstandingChildSummary[];
  isLoading?: boolean;
  onSettleOutstanding?: () => void;
  onViewHistory?: () => void;
  primaryDisabled?: boolean;
}

const BADGE_BASE = 'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium';

const STATUS_STYLES: Record<OutstandingChildSummary['status'], { label: string; badge: string }> = {
  past_due: { label: 'Tertunggak', badge: `${BADGE_BASE} bg-rose-50 text-rose-700` },
  due_now: { label: 'Bulan ini', badge: `${BADGE_BASE} bg-amber-50 text-amber-700` },
  upcoming: { label: 'Akan datang', badge: `${BADGE_BASE} bg-indigo-50 text-indigo-700` }
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
  onSettleOutstanding,
  onViewHistory,
  primaryDisabled = false
}: OutstandingBalanceCardProps) {
  const normalizedTotal = Math.abs(totalCents);
  const hasBalance = normalizedTotal > 0;
  const visibleChildren = childSummaries.slice(0, 3);
  const remainingChildren = childSummaries.length - visibleChildren.length;
  const dueMonthLabel = formatDueMonth(earliestDueMonth);

  const renderItemLabel = (months: string[]) => {
    if (months.length) return humanizeMonths(months);
    if (dueMonthLabel) return `Tunggakan bermula ${dueMonthLabel}`;
    return 'Yuran khas';
  };

  return (
    <Card className="rounded-2xl border border-rose-100 bg-rose-50/70 shadow-sm">
      <CardContent className="space-y-4 p-5 lg:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-600">Baki tertunggak</p>
            <p className="text-2xl font-semibold text-rose-700 lg:text-3xl">{formatRinggit(normalizedTotal)}</p>
            {hasBalance && dueMonthLabel && (
              <span className="mt-1 inline-flex items-center rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-medium text-rose-700">
                Tamat tempoh {dueMonthLabel}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
            <Button
              className="h-9 rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-950 sm:text-sm"
              onClick={onSettleOutstanding}
              disabled={!onSettleOutstanding || primaryDisabled}
            >
              Selesaikan tunggakan ini
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full border-slate-300 text-xs font-medium text-slate-800 sm:text-sm"
              onClick={onViewHistory}
            >
              Lihat rekod
            </Button>
          </div>
        </div>

        <p className="text-xs text-rose-700 leading-relaxed sm:text-[13px]">
          Lengkapkan bayaran untuk mengemas kini rekod yuran dan elakkan tunggakan berpanjangan.
        </p>

        {isLoading ? (
          <div className="animate-pulse space-y-3 rounded-xl border border-rose-100/70 bg-white/70 p-4">
            <div className="h-4 rounded-full bg-rose-100" />
            <div className="h-4 rounded-full bg-rose-100" />
            <div className="h-4 rounded-full bg-rose-100" />
          </div>
        ) : (
          <>
            {childSummaries.length > 0 ? (
              <div className="divide-y divide-rose-100 rounded-xl border border-rose-100 bg-white/70">
                {visibleChildren.map(child => {
                  const style = STATUS_STYLES[child.status];
                  return (
                    <div key={child.childId} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="space-y-1.5">
                        <p className="text-sm font-medium text-slate-900">{child.childName}</p>
                        <p className="text-xs text-slate-500">{renderItemLabel(child.months)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-900">{formatRinggit(child.amountCents)}</p>
                        <span className={style.badge}>{style.label}</span>
                      </div>
                    </div>
                  );
                })}
                {remainingChildren > 0 && (
                  <div className="px-4 py-3 text-xs text-slate-600">
                    +{remainingChildren} anak lagi mempunyai yuran tertunggak. Lihat rekod penuh untuk maklumat lanjut.
                  </div>
                )}
              </div>
            ) : hasBalance ? (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                Tiada yuran tertunggak. Baki kredit anda akan digunakan untuk bil akan datang.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                Tiada yuran tertunggak buat masa ini. Teruskan memantau notifikasi untuk sebarang caj baharu.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
