import { Fragment, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Tag } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatRinggit } from '@/lib/payments/pricingUtils';
import type { FamilyFeeItem, FeeSelectionState, MonthOption, OutstandingTarget } from './types';

interface FamilyFeeSelectorProps {
  items: FamilyFeeItem[];
  selections: Record<string, FeeSelectionState>;
  monthOptions: MonthOption[];
  onSelectionChange: (assignmentId: string, selection: FeeSelectionState) => void;
  focusChildId?: string | null;
  outstandingSelection?: OutstandingTarget | null;
  outstandingSelectionActive?: boolean;
  registerChildRef?: (childId: string, node: HTMLDivElement | null) => void;
}

const LABELS: Record<string, string> = {
  monthly: 'Yuran bulanan',
  yearly: 'Yuran tahunan',
  one_time: 'Bayaran sekali',
  ad_hoc: 'Program khas'
};

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

export function FamilyFeeSelector({
  items,
  selections,
  monthOptions,
  onSelectionChange,
  focusChildId,
  outstandingSelection,
  outstandingSelectionActive,
  registerChildRef
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

  useEffect(() => {
    if (!families.length) {
      setOpenChild(null);
      return;
    }
    const hasCurrentOpenChild = families.some(([childId]) => childId === openChild);
    if (!hasCurrentOpenChild) {
      setOpenChild(families[0][0]);
    }
  }, [families, openChild]);

  useEffect(() => {
    if (focusChildId) {
      setOpenChild(focusChildId);
    }
  }, [focusChildId]);

  const handleToggle = (assignmentId: string, partial: Partial<FeeSelectionState>) => {
    const current = selections[assignmentId] ?? { include: false, months: [], quantity: 1 };
    onSelectionChange(assignmentId, { ...current, ...partial });
  };

  if (families.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
        Tiada yuran tersedia buat masa ini. Sila hubungi admin untuk semakan yuran anak.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {families.map(([childId, group]) => {
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
        const isOpen = openChild === childId;
        const isOutstandingChild =
          outstandingSelectionActive && outstandingSelection?.childId === childId;

        return (
          <div
            key={childId}
            ref={node => registerChildRef?.(childId, node)}
            className={`space-y-3 rounded-2xl border p-4 shadow-sm transition hover:shadow-md lg:p-5 ${
              isOutstandingChild
                ? 'border-indigo-300 bg-indigo-50/50 shadow-md'
                : 'border-slate-100 bg-white'
            }`}
          >
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 text-left"
              onClick={() => setOpenChild(prev => (prev === childId ? null : childId))}
            >
              <div className="space-y-1">
                {isOutstandingChild && outstandingSelection?.monthKey && (
                  <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] font-medium text-indigo-700">
                    Tunggakan dipilih: {formatMonthLabel(outstandingSelection.monthKey)}
                  </span>
                )}
                <p className="text-sm font-semibold text-slate-900">{group.childName}</p>
                <p className="text-xs text-slate-500">
                  {selectedFees.length > 0
                    ? `${selectedFees.length} yuran dipilih · ${formatRinggit(summaryAmount)}`
                    : `${group.fees.length} yuran tersedia`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-indigo-700">
                  {group.fees.length} yuran
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
                  <svg
                    className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180 text-slate-900' : 'text-slate-400'}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              </div>
            </button>
            <div className={`overflow-hidden transition-all ${isOpen ? 'max-h-[1200px]' : 'max-h-0'}`}>
              <div className="divide-y divide-slate-200">
                {group.fees.map(fee => {
                  const selection =
                    selections[fee.assignmentId] ?? ({ include: false, months: [], quantity: 1 } as FeeSelectionState);
                  const isMonthly = fee.billingCycle === 'monthly';
                  const months = selection.months;
                  const quantity = selection.quantity || 1;
                  const hint = LABELS[fee.billingCycle] ?? 'Yuran';
                  const Icon = isMonthly ? CalendarDays : Tag;

                  return (
                    <Fragment key={fee.assignmentId}>
                      <div className="flex flex-col gap-3 px-1 py-3 lg:px-0">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-500">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-900">{fee.feeName}</p>
                            <p className="text-xs text-slate-500">{fee.description || hint}</p>
                          </div>
                          <div className="text-right">
                            <span className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                              {hint}
                            </span>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{formatRinggit(fee.amountCents)}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-slate-500">
                            {isMonthly ? 'Pilih bulan terlibat' : 'Tetapkan kuantiti jika perlu'}
                          </p>
                          <Button
                            variant={selection.include ? 'default' : 'outline'}
                            size="sm"
                            className={
                              selection.include
                                ? 'rounded-full bg-indigo-600 text-white hover:bg-indigo-700'
                                : 'rounded-full border-slate-200 text-xs text-slate-700 hover:bg-slate-50'
                            }
                            onClick={() => handleToggle(fee.assignmentId, { include: !selection.include })}
                          >
                            {selection.include ? 'Dipilih' : 'Tambah'}
                          </Button>
                        </div>

                        {selection.include && (
                          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                            {isMonthly ? (
                              <div className="space-y-2">
                                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
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
                                        className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                                          active
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'border border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-slate-900'
                                        } ${
                                          isOutstandingChild && outstandingSelection?.monthKey === option.key
                                            ? 'ring-2 ring-indigo-200'
                                            : ''
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
                                <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                  Kuantiti
                                </span>
                                <div className="inline-flex items-center rounded-full border border-slate-200 bg-white">
                                  <button
                                    type="button"
                                    className="px-3 py-1 text-slate-600 hover:text-indigo-700"
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
                                    className="px-3 py-1 text-slate-600 hover:text-indigo-700"
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
