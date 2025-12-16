// src/hooks/useWeightedAverages.ts
import * as React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllAverages, toWeightFraction } from '@/lib/averages';

export function useWeightedAverages(opts: {
  supabase: SupabaseClient;
  examId: string | null;
  classId: string | null;
  studentId: string | null;
  wConduct: number;                 // accepts 0..1 or 0..100; we normalize inside
  allowedSubjectIds?: string[] | null;
  includeStudentFinal?: boolean;
}) {
  const { supabase, examId, classId, studentId, allowedSubjectIds, includeStudentFinal } = opts;
  const w = toWeightFraction(opts.wConduct);
  const allowedKey = React.useMemo(() => JSON.stringify(allowedSubjectIds ?? null), [allowedSubjectIds]);

  const [subjectAvg, setSubjectAvg] = React.useState<Record<string, number>>({});
  const [classAvg, setClassAvg] = React.useState<number | null>(null);
  const [finalWeighted, setFinalWeighted] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    if (!examId || !classId || !studentId) {
      setSubjectAvg({});
      setClassAvg(null);
      setFinalWeighted(null);
      setLoading(false);
      return;
    }

    fetchAllAverages(
      supabase,
      { examId, classId, studentId, wConduct: w, allowedSubjectIds },
      { includeStudentFinal }
    )
      .then((res) => {
        if (cancelled) return;
        setSubjectAvg(res.subjectAvg);
        setClassAvg(res.classAvgWeighted);
        setFinalWeighted(res.finalWeighted);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error('fetchAllAverages failed', e);
        setError(e?.message ?? 'Failed to fetch averages');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [supabase, examId, classId, studentId, w, allowedKey, allowedSubjectIds, includeStudentFinal]);

  const fmt = React.useCallback((n?: number | null) => (n == null ? '—' : `${Math.round(n * 10) / 10}%`), []);

  return { subjectAvg, classAvg, finalWeighted, loading, error, fmt };
}
