import { Button } from '@/components/ui/Button';
import { formatRinggit } from '@/lib/payments/pricingUtils';
import type { PaymentRecord } from '@/types/payments';

interface PaymentStatusBannerProps {
  payment?: PaymentRecord | null;
  onRefresh?: () => void;
}

const STATUS_COPY: Record<
  PaymentRecord['status'],
  { title: string; description: string; action?: string }
> = {
  draft: {
    title: 'Draf bayaran tersedia',
    description: 'Selesaikan pilihan yuran untuk menjana bil baharu.'
  },
  initiated: {
    title: 'Menunggu bil',
    description: 'Kami sedang menyiapkan pautan bayaran anda.'
  },
  pending: {
    title: 'Bayaran belum selesai',
    description: 'Anda meninggalkan halaman bayaran. Sila sambung bayaran.'
  },
  paid: {
    title: 'Terima kasih! Bayaran diterima',
    description: 'Semak emel anda untuk resit rasmi.'
  },
  failed: {
    title: 'Bayaran gagal',
    description: 'Sila cuba lagi atau guna akaun bank berbeza.',
    action: 'Cuba lagi'
  },
  expired: {
    title: 'Bil tamat tempoh',
    description: 'Jana bil baharu untuk meneruskan bayaran.',
    action: 'Jana semula'
  },
  refunded: {
    title: 'Bayaran dipulangkan',
    description: 'Hubungi pejabat sekolah jika anda perlukan bantuan lanjut.'
  }
};

const BADGE_BASE = 'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium';

const STATUS_STYLE: Record<
  PaymentRecord['status'],
  { container: string; badge: string; button?: string }
> = {
  draft: { container: 'border-slate-200 bg-slate-50', badge: `${BADGE_BASE} bg-slate-50 text-slate-700` },
  initiated: { container: 'border-slate-200 bg-slate-50', badge: `${BADGE_BASE} bg-indigo-50 text-indigo-700` },
  pending: { container: 'border-slate-200 bg-slate-50', badge: `${BADGE_BASE} bg-amber-50 text-amber-700`, button: 'text-amber-800 border-amber-200 hover:bg-amber-100' },
  paid: { container: 'border-slate-200 bg-slate-50', badge: `${BADGE_BASE} bg-emerald-50 text-emerald-700` },
  failed: { container: 'border-slate-200 bg-slate-50', badge: `${BADGE_BASE} bg-rose-50 text-rose-700`, button: 'text-rose-800 border-rose-200 hover:bg-rose-100' },
  expired: { container: 'border-slate-200 bg-slate-50', badge: `${BADGE_BASE} bg-slate-50 text-slate-700`, button: 'text-slate-800 border-slate-200 hover:bg-slate-100' },
  refunded: { container: 'border-slate-200 bg-slate-50', badge: `${BADGE_BASE} bg-indigo-50 text-indigo-700` }
};

export function PaymentStatusBanner({ payment, onRefresh }: PaymentStatusBannerProps) {
  if (!payment) return null;
  const copy = STATUS_COPY[payment.status];
  const showContinue = payment.status === 'pending' && payment.redirect_url;
  const style = STATUS_STYLE[payment.status] ?? STATUS_STYLE.draft;

  return (
    <div className={`mt-4 flex items-center justify-between gap-4 rounded-xl border px-4 py-3 ${style.container}`}>
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status pembayaran</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className={style.badge}>{copy.title}</span>
          {payment.total_amount_cents && (
            <span className="text-xs font-medium text-slate-700">{formatRinggit(payment.total_amount_cents)}</span>
          )}
        </div>
        <p className="text-xs text-slate-500 sm:text-[13px]">{copy.description}</p>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {showContinue && (
          <Button
            variant="outline"
            size="sm"
            className={`rounded-full border px-3 py-2 text-xs font-medium ${style.button ?? 'border-indigo-200 text-indigo-700 hover:bg-indigo-50'}`}
            onClick={() => window.open(payment.redirect_url!, '_blank')}
          >
            Sambung bayaran
          </Button>
        )}
        {onRefresh && (
          <Button variant="outline" size="sm" className="rounded-full border-slate-300 text-xs" onClick={onRefresh}>
            Segarkan status
          </Button>
        )}
      </div>
    </div>
  );
}
