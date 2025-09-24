"use client";

import React from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import {
  type ConductScores,
  type ConductSummary,
  rpcGetConductSummary,
  rpcUpsertConductOverride,
  rpcUpsertConductPerSubject,
  rpcDeleteConductOverride,
} from '@/data/conduct';

const FIELD_DEFS: Array<{ key: keyof ConductScores; label: string }> = [
  { key: 'discipline', label: 'Discipline' },
  { key: 'effort', label: 'Effort' },
  { key: 'participation', label: 'Participation' },
  { key: 'motivational_level', label: 'Motivational Level' },
  { key: 'character_score', label: 'Character' },
  { key: 'leadership', label: 'Leadership' },
];

const emptyScores = (): Record<keyof ConductScores, string> => ({
  discipline: '',
  effort: '',
  participation: '',
  motivational_level: '',
  character_score: '',
  leadership: '',
});

const clamp = (value: number) => {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
};

const toNumOrNull = (s: string) => {
  const t = String(s ?? '').trim();
  if (t === '') return null;
  const n = Math.round(Number(t));
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(100, n));
};

const FIELD_KEYS = [
  'discipline',
  'effort',
  'participation',
  'motivational_level',
  'character_score',
  'leadership',
] as const;

type FieldKey = typeof FIELD_KEYS[number];

const overrideAllBlank = (vals: Record<FieldKey, string>) =>
  FIELD_KEYS.every((k) => (vals[k] ?? '').trim() === '');

const overrideAllFilled = (vals: Record<FieldKey, string>) =>
  FIELD_KEYS.every((k) => toNumOrNull(vals[k]) !== null);

const fmt = (value: number | null | undefined) =>
  value == null || Number.isNaN(value) ? '—' : String(Math.round(Number(value)));

interface ConductEditorProps {
  examId?: string;
  studentId?: string;
  subjectId?: string | null;
  mode: 'override' | 'perSubject';
  onSummaryChange?: (summary: ConductSummary | null) => void;
  showToast?: (message: string, type?: 'success' | 'error') => void;
}

function ConductEditor({
  examId,
  studentId,
  subjectId,
  mode,
  onSummaryChange,
  showToast,
}: ConductEditorProps) {
  const [summary, setSummary] = React.useState<ConductSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = React.useState(false);
  const [formValues, setFormValues] = React.useState<Record<keyof ConductScores, string>>(emptyScores);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [prefillError, setPrefillError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [justSaved, setJustSaved] = React.useState(false);

  const onSummaryChangeRef = React.useRef(onSummaryChange);
  React.useEffect(() => {
    onSummaryChangeRef.current = onSummaryChange;
  }, [onSummaryChange]);

  const canSubmit = Boolean(examId && studentId && (mode === 'override' || subjectId));

  const mapScoresToForm = React.useCallback((scores: Partial<ConductScores> | null | undefined) => {
    const next = emptyScores();
    FIELD_DEFS.forEach(({ key }) => {
      const value = scores?.[key];
      if (value === null || value === undefined || Number.isNaN(value)) {
        next[key] = '';
      } else {
        next[key] = String(Math.round(Number(value)));
      }
    });
    return next;
  }, []);

  const mergeSummary = React.useCallback(
    (data: ConductSummary | null, shouldResetForm: boolean) => {
      setSummary(data);
      if (shouldResetForm && mode === 'override') {
        setFormValues(mapScoresToForm(data));
        setDirty(false);
      }
      onSummaryChangeRef.current?.(data);
    },
    [mapScoresToForm, mode]
  );

  const loadSummary = React.useCallback(
    (opts?: { resetForm?: boolean }) => {
      if (!examId || !studentId) {
        mergeSummary(null, true);
        return;
      }
      let alive = true;
      setLoadingSummary(true);
      rpcGetConductSummary(examId, studentId)
        .then(
          (data) => {
            if (alive) {
              mergeSummary(data, !!opts?.resetForm);
            }
          },
          (error) => {
            if (alive) {
              mergeSummary(null, !!opts?.resetForm);
              console.error('Failed to load conduct summary:', error instanceof Error ? error.message : error);
            }
          }
        )
        .then(() => {
          if (alive) {
            setLoadingSummary(false);
          }
        });
      return () => {
        alive = false;
      };
    },
    [examId, mergeSummary, studentId]
  );

  const loadPerSubjectPrefill = React.useCallback(() => {
    if (mode !== 'perSubject' || !examId || !studentId || !subjectId) {
      setPrefillError(null);
      if (!dirty && mode === 'perSubject') {
        setFormValues(emptyScores());
      }
      return;
    }
    let alive = true;
    supabase
      .from('conduct_scores')
      .select('discipline, effort, participation, motivational_level, character_score, leadership')
      .eq('exam_id', examId)
      .eq('student_id', studentId)
      .eq('subject_id', subjectId)
      .maybeSingle()
      .then(
        ({ data, error }) => {
          if (error) throw error;
          if (alive) {
            setPrefillError(null);
          }
          if (!dirty && alive) {
            setFormValues(data ? mapScoresToForm(data) : emptyScores());
          }
        },
        (error) => {
          const message = error instanceof Error ? error.message : error;
          console.warn('Conduct per-subject prefill failed:', message);
          if (alive) {
            setPrefillError('Unable to load subject-level scores yet. Enter new values to update.');
          }
          if (!dirty && alive) {
            setFormValues(emptyScores());
          }
        }
      );
    return () => {
      alive = false;
    };
  }, [dirty, examId, mapScoresToForm, mode, studentId, subjectId]);

  React.useEffect(() => {
    return loadSummary({ resetForm: true });
  }, [loadSummary]);

  React.useEffect(() => {
    if (mode === 'perSubject') {
      return loadPerSubjectPrefill();
    } else if (!dirty) {
      setFormValues(mapScoresToForm(summary));
    }
    return undefined;
  }, [mode, loadPerSubjectPrefill, mapScoresToForm, summary, dirty]);

  const handleChange = (key: keyof ConductScores, value: string) => {
    setDirty(true);
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleBlur = (key: keyof ConductScores, value: string) => {
    if (value.trim() === '') return;
    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
      setFormValues((prev) => ({ ...prev, [key]: '' }));
      return;
    }
    setFormValues((prev) => ({ ...prev, [key]: String(clamp(numeric)) }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || !examId || !studentId) {
      showToast?.('Select exam and student before saving.', 'error');
      return;
    }

    // Build payload (blank => null)
    const payload = {
      discipline: toNumOrNull(formValues.discipline),
      effort: toNumOrNull(formValues.effort),
      participation: toNumOrNull(formValues.participation),
      motivational_level: toNumOrNull(formValues.motivational_level),
      character_score: toNumOrNull(formValues.character_score),
      leadership: toNumOrNull(formValues.leadership),
    } as const;

    try {
      setSaving(true);

      if (mode === 'override') {
        const allBlank = overrideAllBlank(formValues as Record<FieldKey, string>);
        const allFilled = overrideAllFilled(formValues as Record<FieldKey, string>);

        if (allBlank) {
          // Always attempt delete; safe no-op if no override exists
          await rpcDeleteConductOverride(examId, studentId);
        } else if (allFilled) {
          await rpcUpsertConductOverride(
            examId,
            studentId,
            payload as unknown as Required<ConductScores>
          );
        } else {
          showToast?.('Fill all fields or clear all to remove override.', 'error');
          return;
        }
      } else {
        // per-subject: allow nulls
        if (!subjectId) {
          showToast?.('Subject is required for per-subject conduct.', 'error');
          return;
        }
        await rpcUpsertConductPerSubject(examId, studentId, subjectId, payload as ConductScores);
      }

      // success UX
      showToast?.('Conduct saved.', 'success');
      setDirty(false);
      setSavedAt(new Date());
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2600);
      await loadSummary({ resetForm: true });

      // notify admin panel
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('conduct-summary-updated', {
            detail: { examId, studentId, subjectId: mode === 'perSubject' ? subjectId : null },
          })
        );
      }
    } catch (error) {
      console.error('Failed to save conduct:', error instanceof Error ? error.message : error);
      showToast?.('Failed to save conduct. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const chipLabel = summary?.source === 'override' ? 'Override' : 'Average';
  const chipColor = summary?.source === 'override' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-blue-100 text-blue-800 border-blue-200';
  const chipTooltip = summary?.source === 'override'
    ? 'These values were entered at “All subjects” and override any per-subject entries.'
    : 'These values are the average of per-subject conduct entries.';

  const canDeleteOverride = overrideAllBlank(formValues as Record<FieldKey, string>);
  const canSaveOverride = overrideAllFilled(formValues as Record<FieldKey, string>);

  const relativeTime = React.useCallback((date: Date) => {
    const deltaSec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (deltaSec < 5) return 'just now';
    if (deltaSec < 60) return `${deltaSec}s ago`;
    const min = Math.floor(deltaSec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const d = Math.floor(hr / 24);
    return `${d}d ago`;
  }, []);

  return (
    <div className="space-y-6">
      <div className="border rounded-lg bg-white p-4 shadow-sm min-h-[148px]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-gray-900">Current summary</h4>
            <p className="text-xs text-gray-500">Based on {summary?.subjects_count ?? 0} subject{(summary?.subjects_count ?? 0) === 1 ? '' : 's'} recorded.</p>
          </div>
          <div className="flex items-center gap-3">
            {savedAt && (
              <span className="text-xs text-gray-500">Last saved {relativeTime(savedAt)}</span>
            )}
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${chipColor}`}
              title={chipTooltip}
            >
              {chipLabel}
            </span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {FIELD_DEFS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between border-b pb-2 last:border-none">
              <span className="text-gray-600">{label}</span>
              <span className="font-semibold text-gray-900">{fmt(summary?.[key])}</span>
            </div>
          ))}
        </div>
        {loadingSummary && (
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Refreshing summary…
          </div>
        )}
        {!loadingSummary && !summary && (
          <p className="mt-3 text-sm text-gray-500">No conduct summary available yet.</p>
        )}
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-base font-semibold text-gray-900">
                {mode === 'override' ? 'Class teacher override' : 'Subject-level conduct'}
              </h4>
              <p className="text-xs text-gray-500">
                {mode === 'override'
                  ? 'Class teacher override: This sets the conduct scores for this student in this exam and takes precedence over per-subject entries. Per-subject scores remain saved but are ignored while an override exists.'
                  : 'Subject-level conduct: Saved for this subject. If an override exists, admin views will use the override instead of the averaged per-subject scores.'}
              </p>
              {mode === 'override' && (
                <p className="mt-1 text-xs text-gray-500">Leave all fields empty and click Remove override to switch back to averaged per-subject scores.</p>
              )}
            </div>
            {saving && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          </div>

          {prefillError && (
            <p className="mt-3 text-xs text-amber-600">{prefillError}</p>
          )}

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {FIELD_DEFS.map(({ key, label }) => (
              <label key={key} className="flex flex-col gap-1 text-sm text-gray-700">
                <span className="font-medium">{label}</span>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={formValues[key]}
                    onChange={(event) => handleChange(key, event.target.value)}
                    onBlur={(event) => handleBlur(key, event.target.value)}
                    onInvalid={(e) => e.preventDefault()}
                    className="w-full rounded-md border px-3 py-2 pr-10 text-right focus:outline-none focus:ring-2 focus:ring-primary/60"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-gray-400">/100</span>
                </div>
              </label>
            ))}
          </div>

          <div className="mt-4 flex flex-col items-end">
            <button
              type="submit"
              disabled={
                !canSubmit ||
                saving ||
                (mode === 'perSubject' && !dirty) ||
                (mode === 'override' && !(canSaveOverride || canDeleteOverride))
              }
              className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium shadow-sm transition-colors ${
                !canSubmit || saving || (mode === 'perSubject' && !dirty) || (mode === 'override' && !(canSaveOverride || canDeleteOverride))
                  ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                  : 'bg-primary text-white hover:bg-primary/90'
              }`}
            >
              {saving
                ? 'Saving…'
                : mode === 'override' && canDeleteOverride
                  ? 'Remove override'
                  : dirty
                    ? 'Save conduct'
                    : 'Saved ✓'}
            </button>
            {!dirty && !saving && (
              <p className="mt-2 text-xs text-gray-500">Saved ✓</p>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

export default React.memo(ConductEditor);
