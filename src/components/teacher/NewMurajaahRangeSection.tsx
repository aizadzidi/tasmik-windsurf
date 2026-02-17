import React from "react";
import type {
  NewMurajaahRangeMode,
  NewMurajaahRangeResult
} from "@/lib/murajaahRange";

interface NewMurajaahRangeSectionProps {
  latestTasmiPage: number | null;
  rangeMode: NewMurajaahRangeMode;
  lastNInput: string;
  manualFromInput: string;
  manualToInput: string;
  result: NewMurajaahRangeResult;
  onRangeModeChange: (mode: NewMurajaahRangeMode) => void;
  onLastNChange: (value: string) => void;
  onManualFromChange: (value: string) => void;
  onManualToChange: (value: string) => void;
}

export default function NewMurajaahRangeSection({
  latestTasmiPage,
  rangeMode,
  lastNInput,
  manualFromInput,
  manualToInput,
  result,
  onRangeModeChange,
  onLastNChange,
  onManualFromChange,
  onManualToChange
}: NewMurajaahRangeSectionProps) {
  const hasInput = rangeMode === "last_n"
    ? lastNInput.trim().length > 0
    : manualFromInput.trim().length > 0 || manualToInput.trim().length > 0;
  const shouldShowError = hasInput && !result.isValid && Boolean(result.error);
  const selectedLastN = Number.parseInt(lastNInput, 10);
  const hasSelectedLastN = Number.isInteger(selectedLastN) && selectedLastN > 0;
  const fallbackPageFrom = latestTasmiPage && hasSelectedLastN
    ? Math.max(1, latestTasmiPage - selectedLastN + 1)
    : null;
  const fallbackPageTo = latestTasmiPage ?? null;
  const pageFrom = result.pageFrom ?? fallbackPageFrom;
  const pageTo = result.pageTo ?? fallbackPageTo;

  return (
    <div className="sm:col-span-2 rounded-xl border border-emerald-100 bg-white p-4">
      <div className="mb-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">New Murajaah Range</div>
          <div className="text-xs text-gray-600">Choose one method and continue.</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="block text-xs text-gray-700 mb-2">Method</label>
          <div className="inline-flex rounded-full bg-gray-50 p-1 border border-gray-200">
            <button
              type="button"
              onClick={() => onRangeModeChange("last_n")}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                rangeMode === "last_n"
                  ? "bg-emerald-600 text-white"
                  : "text-gray-700 hover:text-gray-900"
              }`}
              aria-pressed={rangeMode === "last_n"}
            >
              Recent pages
            </button>
            <button
              type="button"
              onClick={() => onRangeModeChange("manual_range")}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                rangeMode === "manual_range"
                  ? "bg-emerald-600 text-white"
                  : "text-gray-700 hover:text-gray-900"
              }`}
              aria-pressed={rangeMode === "manual_range"}
            >
              Specific range
            </button>
          </div>
        </div>

        {rangeMode === "last_n" ? (
          <div className="grid grid-cols-1 gap-2">
            <div>
              <label className="block text-xs text-gray-700 mb-1">Pages to review *</label>
              <select
                value={lastNInput}
                onChange={(e) => onLastNChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-400 text-sm bg-white"
              >
                {Array.from({ length: 20 }, (_, index) => index + 1).map((count) => (
                  <option key={count} value={count}>
                    Last {count} pages
                  </option>
                ))}
              </select>
            </div>
            <div className="text-[11px] text-gray-600">
              {pageFrom && pageTo
                ? `Page range: ${pageFrom} - ${pageTo}`
                : "Page range is not available yet."}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-700 mb-1">Page from *</label>
              <input
                type="number"
                min="1"
                max="604"
                placeholder="From"
                value={manualFromInput}
                onChange={(e) => onManualFromChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-700 mb-1">Page to *</label>
              <input
                type="number"
                min="1"
                max="604"
                placeholder="To"
                value={manualToInput}
                onChange={(e) => onManualToChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-400"
              />
            </div>
          </div>
        )}
      </div>
      {shouldShowError && (
        <div className="mt-3 text-xs text-red-600">{result.error}</div>
      )}
    </div>
  );
}
