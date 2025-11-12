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
    title: 'Menunggu Billplz',
    description: 'Kami sedang menyiapkan bil anda.'
  },
  pending: {
    title: 'Bayaran belum selesai',
    description: 'Anda meninggalkan halaman Billplz. Sila sambung bayaran.'
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

const STATUS_STYLE: Record<
  PaymentRecord['status'],
  { container: string; accent: string; button?: string }
> = {
  draft: { container: 'border-slate-200 bg-slate-50 text-slate-800', accent: 'bg-slate-200' },
  initiated: { container: 'border-slate-200 bg-slate-50 text-slate-800', accent: 'bg-slate-200' },
  pending: { container: 'border-amber-200 bg-amber-50 text-amber-900', accent: 'bg-amber-400', button: 'text-amber-900 border-amber-200 hover:bg-amber-100' },
  paid: { container: 'border-emerald-200 bg-emerald-50 text-emerald-900', accent: 'bg-emerald-400' },
  failed: { container: 'border-rose-200 bg-rose-50 text-rose-900', accent: 'bg-rose-400', button: 'text-rose-900 border-rose-200 hover:bg-rose-100' },
  expired: { container: 'border-slate-200 bg-slate-50 text-slate-800', accent: 'bg-slate-300', button: 'text-slate-700 border-slate-200 hover:bg-slate-100' },
  refunded: { container: 'border-indigo-200 bg-indigo-50 text-indigo-900', accent: 'bg-indigo-400' }
};

export function PaymentStatusBanner({ payment, onRefresh }: PaymentStatusBannerProps) {
  if (!payment) return null;
  const copy = STATUS_COPY[payment.status];
  const showContinue = payment.status === 'pending' && payment.redirect_url;
  const style = STATUS_STYLE[payment.status] ?? STATUS_STYLE.draft;

  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-sm ${style.container}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <span className={`mt-1 h-2 w-2 rounded-full ${style.accent}`} aria-hidden="true" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Status pembayaran</p>
            <h3 className="text-base font-semibold">{copy.title}</h3>
            <p className="text-sm opacity-80">{copy.description}</p>
            {payment.total_amount_cents && (
              <p className="mt-1 text-sm font-medium">
                Jumlah bil: <span>{formatRinggit(payment.total_amount_cents)}</span>
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          {showContinue && (
            <Button
              variant="outline"
              className={`rounded-full px-4 py-1 text-sm font-semibold ${style.button ?? 'text-slate-800 border-slate-200 hover:bg-slate-100'}`}
              onClick={() => window.open(payment.redirect_url!, '_blank')}
            >
              Sambung di Billplz
            </Button>
          )}
          {onRefresh && (
            <Button variant="ghost" className="text-sm font-medium text-current hover:bg-white/40" onClick={onRefresh}>
              Segarkan status
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
