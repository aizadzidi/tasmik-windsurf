import { Fragment, useMemo, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { formatRinggit } from '@/lib/payments/pricingUtils';
import type { FamilyFeeItem, FeeSelectionState, MonthOption } from './types';

interface FamilyFeeSelectorProps {
  items: FamilyFeeItem[];
  selections: Record<string, FeeSelectionState>;
  monthOptions: MonthOption[];
  onSelectionChange: (assignmentId: string, selection: FeeSelectionState) => void;
}

const LABELS: Record<string, string> = {
  monthly: 'Yuran bulanan',
  yearly: 'Yuran tahunan',
  one_time: 'Bayaran sekali',
  ad_hoc: 'Program khas'
};

export function FamilyFeeSelector({
  items,
  selections,
  monthOptions,
  onSelectionChange
}: FamilyFeeSelectorProps) {
  const grouped = items.reduce<Record<string, { childName: string; fees: FamilyFeeItem[] }>>(
    (acc, fee) => {
      if (!acc[fee.childId]) {
        acc[fee.childId] = { childName: fee.childName, fees: [] };
      }
      acc[fee.childId].fees.push(fee);
      return acc;
    },
    {}
  );
  const families = useMemo(() => Object.entries(grouped), [grouped]);
  const [openChild, setOpenChild] = useState<string | null>(families[0]?.[0] ?? null);

  const handleToggle = (assignmentId: string, partial: Partial<FeeSelectionState>) => {
    const current = selections[assignmentId] ?? { include: false, months: [], quantity: 1 };
    onSelectionChange(assignmentId, { ...current, ...partial });
  };

  return (
    <div className="space-y-4">
      {families.map(([childId, group], index) => {
        const selectedFees = group.fees.filter(fee => selections[fee.assignmentId]?.include);
        const summaryAmount = selectedFees.reduce((sum, fee) => {
          const selection = selections[fee.assignmentId];
          if (!selection) return sum;
          const multiplier =
            fee.billingCycle === 'monthly'
              ? Math.max(1, selection.months?.length || 0)
              : selection.quantity || 1;
          return sum + fee.amountCents * multiplier;
        }, 0);
        const isOpen = openChild ? openChild === childId : index === 0;

        return (
          <div
            key={childId}
            className="rounded-3xl border border-slate-200 bg-white/80 shadow-sm transition hover:border-slate-300"
          >
            <button
              type="button"
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              onClick={() => setOpenChild(prev => (prev === childId ? null : childId))}
            >
              <div>
                <p className="text-lg font-semibold text-slate-900">{group.childName}</p>
                <p className="text-sm text-slate-500">
                  {selectedFees.length > 0
                    ? `${selectedFees.length} yuran dipilih · ${formatRinggit(summaryAmount)}`
                    : `${group.fees.length} yuran tersedia`}
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                  {group.fees.length} yuran
                </span>
                <svg
                  className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180 text-slate-900' : 'text-slate-400'}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </button>
            <div className={`overflow-hidden transition-all ${isOpen ? 'max-h-[1200px]' : 'max-h-0'}`}>
              <div className="border-t border-slate-100 px-5 py-4 space-y-4">
                {group.fees.map(fee => {
                  const selection =
                    selections[fee.assignmentId] ?? ({ include: false, months: [], quantity: 1 } as FeeSelectionState);
                  const isMonthly = fee.billingCycle === 'monthly';
                  const months = selection.months;
                  const quantity = selection.quantity || 1;
                  const hint = LABELS[fee.billingCycle] ?? 'Yuran';

                  return (
                    <Fragment key={fee.assignmentId}>
                      <div className="rounded-2xl border border-slate-100 bg-white/70 px-4 py-3 shadow-sm">
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-base font-semibold text-slate-900">{fee.feeName}</p>
                            <p className="text-sm text-slate-500">{fee.description || hint}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs uppercase tracking-wide text-slate-400">{hint}</p>
                            <p className="text-lg font-semibold text-slate-900">{formatRinggit(fee.amountCents)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleToggle(fee.assignmentId, { include: !selection.include })}
                            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                              selection.include
                                ? 'bg-sky-600 text-white shadow-sm'
                                : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            {selection.include ? 'Dipilih' : 'Tambah'}
                          </button>
                        </div>

                        {selection.include && (
                          <div className="mt-4 space-y-3">
                            {isMonthly ? (
                              <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Bulan terlibat
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {monthOptions.map(option => {
                                    const active = months.includes(option.key);
                                    return (
                                      <button
                                        type="button"
                                        key={option.key}
                                        onClick={() => {
                                          const next = active
                                            ? months.filter(m => m !== option.key)
                                            : [...months, option.key];
                                          handleToggle(fee.assignmentId, { months: next });
                                        }}
                                        className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                                          active
                                            ? 'bg-sky-600 text-white shadow-sm'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                      >
                                        {option.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-2 text-sm text-slate-600">
                                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Kuantiti</span>
                                <div className="inline-flex items-center rounded-full border border-slate-200 bg-white text-base">
                                  <button
                                    type="button"
                                    className="px-3 py-1 text-slate-600 hover:text-slate-900"
                                    onClick={() =>
                                      handleToggle(fee.assignmentId, {
                                        quantity: Math.max(1, quantity - 1)
                                      })
                                    }
                                  >
                                    –
                                  </button>
                                  <span className="px-4 font-semibold text-slate-900">{quantity}</span>
                                  <button
                                    type="button"
                                    className="px-3 py-1 text-slate-600 hover:text-slate-900"
                                    onClick={() =>
                                      handleToggle(fee.assignmentId, {
                                        quantity: quantity + 1
                                      })
                                    }
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
