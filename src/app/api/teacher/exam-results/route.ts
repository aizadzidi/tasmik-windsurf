import { NextRequest, NextResponse } from "next/server";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { ok, fail } from "@/types/http";
import { normalizeId } from "@/lib/ids";

type ExamResultInput = {
  studentId: string;
  mark: number | null;
  finalScore?: number | null;
  isAbsent?: boolean;
};

type ExamResultRow = {
  student_id: string;
  mark: number | null;
  grade: string | null;
  final_score: number | null;
  updated_at: string | null;
};

const toSupabaseErrorDetails = (error: unknown) => {
  if (error && typeof error === 'object') {
    const err = error as { code?: string; message?: string; hint?: string };
    return {
      code: err.code,
      message: err.message,
      hint: err.hint,
    };
  }
  return { code: undefined, message: undefined, hint: undefined };
};

const hasMissingTenantColumn = (error: unknown) => {
  const details = toSupabaseErrorDetails(error);
  return details.code === '42703' || details.message?.toLowerCase().includes('tenant_id') === true;
};

const resolveExamTenantId = async (examId: string): Promise<string | null> => {
  try {
    const tenantId = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from('exams')
        .select('tenant_id')
        .eq('id', examId)
        .maybeSingle();
      if (error) throw error;
      return normalizeId((data as { tenant_id?: string | number | null } | null)?.tenant_id);
    });
    return tenantId;
  } catch (error: unknown) {
    if (hasMissingTenantColumn(error)) return null;
    throw error;
  }
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const examId = normalizeId(body?.examId);
    const subjectId = normalizeId(body?.subjectId);
    const { results } = body;

    if (!examId || !subjectId || !Array.isArray(results)) {
      const errorResult = fail('Missing required fields: examId, subjectId, results[]');
      return NextResponse.json(
        { error: errorResult.error },
        { status: 400 }
      );
    }

    const tenantId = await resolveExamTenantId(examId);

    // Prepare batch upsert data
    const typedResults = (results ?? []) as ExamResultInput[];
    const requestedStudentIds = Array.from(
      new Set(
        typedResults
          .map((result) => normalizeId(result.studentId))
          .filter((id): id is string => Boolean(id))
      )
    );

    let optedOutStudentIds = new Set<string>();
    if (requestedStudentIds.length > 0) {
      try {
        const optOutRows = await adminOperationSimple(async (client) => {
          let query = client
            .from('subject_opt_outs')
            .select('student_id')
            .eq('exam_id', examId)
            .eq('subject_id', subjectId)
            .in('student_id', requestedStudentIds);
          if (tenantId) {
            query = query.eq('tenant_id', tenantId);
          }
          const { data, error } = await query;
          if (error) throw error;
          return (data ?? []) as Array<{ student_id: string | null }>;
        });
        optedOutStudentIds = new Set(
          optOutRows
            .map((row) => normalizeId(row.student_id))
            .filter((id): id is string => Boolean(id))
        );
      } catch (error: unknown) {
        const details = toSupabaseErrorDetails(error);
        if (details.code !== '42P01') {
          throw error;
        }
      }
    }

    const upsertDataBase = typedResults
      .filter((result) => {
        const studentId = normalizeId(result.studentId);
        if (!studentId) return false;
        return !optedOutStudentIds.has(studentId);
      })
      .map((result) => {
        const normalizedStudentId = normalizeId(result.studentId);
        if (!normalizedStudentId) return null;
        const normalizedMark = typeof result.mark === 'number' && Number.isFinite(result.mark) ? result.mark : null;
        const normalizedFinalScore =
          typeof result.finalScore === 'number' && Number.isFinite(result.finalScore)
            ? result.finalScore
            : normalizedMark;
        const isAbsent = result.isAbsent === true;
        return {
          exam_id: examId,
          student_id: normalizedStudentId,
          subject_id: subjectId,
          mark: isAbsent ? null : normalizedMark,
          final_score: isAbsent ? null : normalizedFinalScore,
          grade: isAbsent ? 'TH' : null,
        };
      })
      .filter((row): row is {
        exam_id: string;
        student_id: string;
        subject_id: string;
        mark: number | null;
        final_score: number | null;
        grade: string | null;
      } => row !== null);

    if (upsertDataBase.length === 0) {
      return NextResponse.json({
        success: true,
        results: [],
        skippedStudentIds: Array.from(optedOutStudentIds),
        message: 'No exam results saved because selected students are marked as N/A for this subject.',
      });
    }

    // Single atomic upsert operation that returns all computed data
    let savedResults: ExamResultRow[] = [];

    try {
      savedResults = await adminOperationSimple(async (client) => {
        const rowsWithTenant = tenantId
          ? upsertDataBase.map((row) => ({ ...row, tenant_id: tenantId }))
          : upsertDataBase;

        let { data, error } = await client
          .from('exam_results')
          .upsert(rowsWithTenant, {
            onConflict: 'exam_id,student_id,subject_id',
            ignoreDuplicates: false
          })
          .select('student_id, mark, grade, final_score, updated_at');
        if (error && tenantId && hasMissingTenantColumn(error)) {
          const fallback = await client
            .from('exam_results')
            .upsert(upsertDataBase, {
              onConflict: 'exam_id,student_id,subject_id',
              ignoreDuplicates: false
            })
            .select('student_id, mark, grade, final_score, updated_at');
          data = fallback.data;
          error = fallback.error;
        }
        if (error) throw error;

        const absentStudentIds = upsertDataBase
          .filter((row) => row.grade === 'TH')
          .map((row) => row.student_id);
        if (absentStudentIds.length > 0) {
          let absentUpdate = client
            .from('exam_results')
            .update({ mark: null, final_score: null, grade: 'TH' })
            .eq('exam_id', examId)
            .eq('subject_id', subjectId)
            .in('student_id', absentStudentIds);
          if (tenantId) {
            absentUpdate = absentUpdate.eq('tenant_id', tenantId);
          }
          const { error: absentErr } = await absentUpdate;
          if (absentErr && !(tenantId && hasMissingTenantColumn(absentErr))) {
            throw absentErr;
          }
          if (absentErr && tenantId && hasMissingTenantColumn(absentErr)) {
            const fallbackAbsent = await client
              .from('exam_results')
              .update({ mark: null, final_score: null, grade: 'TH' })
              .eq('exam_id', examId)
              .eq('subject_id', subjectId)
              .in('student_id', absentStudentIds);
            if (fallbackAbsent.error) throw fallbackAbsent.error;
          }
        }

        const clearedStudentIds = upsertDataBase
          .filter((row) => row.grade !== 'TH' && row.mark === null && row.final_score === null)
          .map((row) => row.student_id);
        if (clearedStudentIds.length > 0) {
          let clearUpdate = client
            .from('exam_results')
            .update({ grade: null })
            .eq('exam_id', examId)
            .eq('subject_id', subjectId)
            .in('student_id', clearedStudentIds);
          if (tenantId) {
            clearUpdate = clearUpdate.eq('tenant_id', tenantId);
          }
          const { error: clearErr } = await clearUpdate;
          if (clearErr && !(tenantId && hasMissingTenantColumn(clearErr))) {
            throw clearErr;
          }
          if (clearErr && tenantId && hasMissingTenantColumn(clearErr)) {
            const fallbackClear = await client
              .from('exam_results')
              .update({ grade: null })
              .eq('exam_id', examId)
              .eq('subject_id', subjectId)
              .in('student_id', clearedStudentIds);
            if (fallbackClear.error) throw fallbackClear.error;
          }
        }

        const refreshIds = Array.from(
          new Set([...absentStudentIds, ...clearedStudentIds, ...upsertDataBase.map((row) => row.student_id)])
        );
        let refreshQuery = client
          .from('exam_results')
          .select('student_id, mark, grade, final_score, updated_at')
          .eq('exam_id', examId)
          .eq('subject_id', subjectId)
          .in('student_id', refreshIds);
        if (tenantId) {
          refreshQuery = refreshQuery.eq('tenant_id', tenantId);
        }
        let refresh = await refreshQuery;
        if (refresh.error && tenantId && hasMissingTenantColumn(refresh.error)) {
          refresh = await client
            .from('exam_results')
            .select('student_id, mark, grade, final_score, updated_at')
            .eq('exam_id', examId)
            .eq('subject_id', subjectId)
            .in('student_id', refreshIds);
        }
        if (refresh.error) throw refresh.error;
        return (refresh.data ?? data ?? []) as ExamResultRow[];
      });
    } catch (error: unknown) {
      console.error('Exam results upsert error:', error);
      return NextResponse.json(
        { error: 'Failed to save exam results', details: toSupabaseErrorDetails(error) },
        { status: 500 }
      );
    }

    // Return the fresh data with computed grades
    const payload = ok({
      success: true,
      results: savedResults,
      skippedStudentIds: Array.from(optedOutStudentIds),
      message: `Successfully saved ${savedResults?.length || 0} exam results`
    });

    return NextResponse.json(payload.data);

  } catch (error: unknown) {
    console.error('API error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const stack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json({
      error: 'Internal server error',
      details: {
        message,
        stack: process.env.NODE_ENV === 'development' ? stack : undefined
      }
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const examId = normalizeId(body?.examId);
    const subjectId = normalizeId(body?.subjectId);
    const studentIdsInput = Array.isArray(body?.studentIds) ? body.studentIds : [];
    const studentIds = studentIdsInput
      .map((id: unknown) => normalizeId(id))
      .filter((id: string | null): id is string => typeof id === 'string' && id.length > 0);
    if (!examId || !subjectId || studentIds.length === 0) {
      return NextResponse.json({ error: 'Missing examId, subjectId, or studentIds[]' }, { status: 400 });
    }
    const tenantId = await resolveExamTenantId(examId);

    try {
      await adminOperationSimple(async (client) => {
        let query = client
          .from('exam_results')
          .delete()
          .eq('exam_id', examId)
          .eq('subject_id', subjectId)
          .in('student_id', studentIds);
        if (tenantId) {
          query = query.eq('tenant_id', tenantId);
        }
        let { error } = await query;
        if (error && tenantId && hasMissingTenantColumn(error)) {
          const fallback = await client
            .from('exam_results')
            .delete()
            .eq('exam_id', examId)
            .eq('subject_id', subjectId)
            .in('student_id', studentIds);
          error = fallback.error;
        }
        if (error) throw error;
        return null;
      });
    } catch (error) {
      console.error('Exam results delete error:', error);
      return NextResponse.json(
        { error: 'Failed to delete exam results', details: toSupabaseErrorDetails(error) },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Exam results delete error:', error);
    return NextResponse.json({ error: 'Failed to delete exam results' }, { status: 500 });
  }
}
