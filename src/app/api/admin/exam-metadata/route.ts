import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireAdminPermission } from "@/lib/adminPermissions";

interface CreateExamData {
  title: string;
  subjects: string[];
  classIds: string[];
  dateRange: {
    from: string;
    to: string;
  };
  conductWeightages: { [classId: string]: number };
  gradingSystemId?: string;
  excludedStudentIdsByClass?: { [classId: string]: string[] };
  subjectConfigByClass?: { [classId: string]: string[] };
  studentSubjectExceptionsByClass?: { [classId: string]: { [studentId: string]: string[] } };
}

const isValidUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

const hasMissingTenantColumn = (error: unknown) => {
  const message = String((error as { message?: string })?.message || '');
  const code = String((error as { code?: string })?.code || '');
  return code === '42703' || (message.includes('tenant_id') && message.toLowerCase().includes('column'));
};

const upsertExamRosterSnapshot = async ({
  supabaseAdmin,
  examId,
  classIds,
  tenantId,
  clearExisting = false
}: {
  supabaseAdmin: SupabaseClient;
  examId: string;
  classIds: string[];
  tenantId?: string;
  clearExisting?: boolean;
}) => {
  if (!examId || !Array.isArray(classIds) || classIds.length === 0) return;
  if (clearExisting) {
    await supabaseAdmin.from('exam_roster').delete().eq('exam_id', examId);
  }
  const { data: rosterRows, error: rosterErr } = await supabaseAdmin
    .from('students')
    .select('id, class_id')
    .neq('record_type', 'prospect')
    .in('class_id', classIds);
  if (rosterErr) throw rosterErr;

  let excludedSet = new Set<string>();
  try {
    const { data: excludedRows, error: excludedErr } = await supabaseAdmin
      .from('exam_excluded_students')
      .select('student_id')
      .eq('exam_id', examId);
    if (excludedErr) throw excludedErr;
    excludedSet = new Set(
      (excludedRows ?? [])
        .map((row) => (row?.student_id ? String(row.student_id) : null))
        .filter((id): id is string => Boolean(id))
    );
  } catch (err) {
    console.warn('Exam roster snapshot exclusion fetch failed:', err);
  }

  const rowsBase = (rosterRows ?? [])
    .filter((row) => row?.id && row.class_id)
    .filter((row) => !excludedSet.has(String(row.id)))
    .map((row) => ({
      exam_id: examId,
      student_id: String(row.id),
      class_id: String(row.class_id)
    }));

  if (rowsBase.length === 0) return;
  const rows = tenantId
    ? rowsBase.map((row) => ({
        ...row,
        tenant_id: tenantId,
      }))
    : rowsBase;

  let { error: upsertErr } = await supabaseAdmin
    .from('exam_roster')
    .upsert(rows, { onConflict: 'exam_id,student_id' });
  if (upsertErr && tenantId && hasMissingTenantColumn(upsertErr)) {
    const fallback = await supabaseAdmin
      .from('exam_roster')
      .upsert(rowsBase, { onConflict: 'exam_id,student_id' });
    upsertErr = fallback.error;
  }
  if (upsertErr) throw upsertErr;
};

type SubjectExceptionInsertRow = {
  exam_id: string;
  subject_id: string;
  student_id: string;
};

const buildSubjectExceptionRows = async ({
  supabaseAdmin,
  examId,
  studentSubjectExceptionsByClass,
  subjectData,
}: {
  supabaseAdmin: SupabaseClient;
  examId: string;
  studentSubjectExceptionsByClass?: { [classId: string]: { [studentId: string]: string[] } };
  subjectData: Array<{ id: string; name: string | null }>;
}): Promise<SubjectExceptionInsertRow[]> => {
  if (!studentSubjectExceptionsByClass || Object.keys(studentSubjectExceptionsByClass).length === 0) {
    return [];
  }

  const subjectIdByName = new Map<string, string>(
    (subjectData || [])
      .filter((row) => row?.id && typeof row?.name === 'string')
      .map((row) => [String(row.name), String(row.id)])
  );

  const allSubjectNames = Array.from(
    new Set(
      Object.values(studentSubjectExceptionsByClass)
        .flatMap((studentMap) => Object.values(studentMap || {}))
        .flat()
        .map((name) => String(name))
        .filter(Boolean)
    )
  );

  const missingSubjectNames = allSubjectNames.filter((name) => !subjectIdByName.has(name));
  if (missingSubjectNames.length > 0) {
    const { data: extraSubjects, error: extraSubjectError } = await supabaseAdmin
      .from('subjects')
      .select('id, name')
      .in('name', missingSubjectNames);
    if (extraSubjectError) throw extraSubjectError;
    (extraSubjects ?? []).forEach((row) => {
      const sid = row?.id ? String(row.id) : null;
      const name = row?.name ? String(row.name) : null;
      if (sid && name) subjectIdByName.set(name, sid);
    });
  }

  const allStudentIds = Array.from(
    new Set(
      Object.values(studentSubjectExceptionsByClass)
        .flatMap((studentMap) => Object.keys(studentMap || {}))
        .map((id) => String(id))
        .filter(Boolean)
    )
  );
  if (allStudentIds.length === 0) return [];

  const { data: studentRows, error: studentError } = await supabaseAdmin
    .from('students')
    .select('id, class_id')
    .neq('record_type', 'prospect')
    .in('id', allStudentIds);
  if (studentError) throw studentError;

  const classIdByStudentId = new Map<string, string>();
  (studentRows ?? []).forEach((row) => {
    const sid = row?.id ? String(row.id) : null;
    const cid = row?.class_id ? String(row.class_id) : null;
    if (sid && cid) classIdByStudentId.set(sid, cid);
  });

  const rows: SubjectExceptionInsertRow[] = [];
  const dedupe = new Set<string>();
  Object.entries(studentSubjectExceptionsByClass).forEach(([classId, studentMap]) => {
    Object.entries(studentMap || {}).forEach(([studentId, subjectNames]) => {
      const actualClassId = classIdByStudentId.get(String(studentId));
      if (!actualClassId || actualClassId !== String(classId)) return;
      (subjectNames || []).forEach((subjectName) => {
        const subjectId = subjectIdByName.get(String(subjectName));
        if (!subjectId) return;
        const key = `${examId}:${subjectId}:${studentId}`;
        if (dedupe.has(key)) return;
        dedupe.add(key);
        rows.push({
          exam_id: examId,
          subject_id: subjectId,
          student_id: String(studentId),
        });
      });
    });
  });

  return rows;
};

const replaceExamSubjectExceptions = async ({
  supabaseAdmin,
  examId,
  rows,
  tenantId,
}: {
  supabaseAdmin: SupabaseClient;
  examId: string;
  rows: SubjectExceptionInsertRow[];
  tenantId?: string;
}) => {
  if (tenantId) {
    const { error: tenantDeleteError } = await supabaseAdmin
      .from('subject_opt_outs')
      .delete()
      .eq('exam_id', examId)
      .eq('tenant_id', tenantId);
    if (tenantDeleteError && !hasMissingTenantColumn(tenantDeleteError)) {
      throw tenantDeleteError;
    }
    if (!tenantDeleteError) {
      // deleted with tenant scoped query successfully
    } else {
      const { error: fallbackDeleteError } = await supabaseAdmin
        .from('subject_opt_outs')
        .delete()
        .eq('exam_id', examId);
      if (fallbackDeleteError) throw fallbackDeleteError;
    }
  } else {
    const { error: deleteError } = await supabaseAdmin
      .from('subject_opt_outs')
      .delete()
      .eq('exam_id', examId);
    if (deleteError) throw deleteError;
  }
  if (!rows.length) return;

  const rowsWithTenant = tenantId
    ? rows.map((row) => ({
        ...row,
        tenant_id: tenantId,
      }))
    : rows;

  const { error: upsertErrorWithTenant } = await supabaseAdmin
    .from('subject_opt_outs')
    .upsert(rowsWithTenant, { onConflict: 'exam_id,subject_id,student_id' });
  if (upsertErrorWithTenant) {
    if (!(tenantId && hasMissingTenantColumn(upsertErrorWithTenant))) {
      throw upsertErrorWithTenant;
    }
    const { error: fallbackUpsertError } = await supabaseAdmin
      .from('subject_opt_outs')
      .upsert(rows, { onConflict: 'exam_id,subject_id,student_id' });
    if (fallbackUpsertError) throw fallbackUpsertError;
  }

  const studentIdsBySubjectId = new Map<string, string[]>();
  rows.forEach((row) => {
    const current = studentIdsBySubjectId.get(row.subject_id) || [];
    current.push(row.student_id);
    studentIdsBySubjectId.set(row.subject_id, current);
  });

  for (const [subjectId, studentIds] of studentIdsBySubjectId.entries()) {
    const dedupedStudentIds = Array.from(new Set(studentIds));
    const { error: deleteResultError } = await supabaseAdmin
      .from('exam_results')
      .delete()
      .eq('exam_id', examId)
      .eq('subject_id', subjectId)
      .in('student_id', dedupedStudentIds);
    if (deleteResultError) throw deleteResultError;
  }
};

// GET - Fetch exam metadata (exams, classes, subjects for dropdowns)
export async function GET() {
  try {
    // Use service role in GET to avoid RLS issues for exam metadata
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { autoRefreshToken: false, persistSession: false }
      }
    );

    // Get all exams with their associated classes and subjects
    const { data: exams, error: examsError } = await supabaseAdmin
      .from('exams')
      .select(`
        id,
        name,
        type,
        exam_start_date,
        exam_end_date,
        created_at,
        released,
        released_at,
        grading_system_id,
        exam_classes!exam_classes_exam_id_fkey(
          conduct_weightage,
          classes!exam_classes_class_id_fkey(id, name)
        ),
        exam_subjects!exam_subjects_exam_id_fkey(
          subjects!exam_subjects_subject_id_fkey(id, name)
        ),
        exam_class_subjects!exam_class_subjects_exam_id_fkey(
          classes!exam_class_subjects_class_id_fkey(id, name),
          subjects!exam_class_subjects_subject_id_fkey(id, name)
        )
      `)
      .order('created_at', { ascending: false });

    if (examsError) {
      console.error('Error fetching exams:', examsError);
      return NextResponse.json({ error: 'Failed to fetch exams' }, { status: 500 });
    }

    // Get all classes
    const { data: classes, error: classesError } = await supabaseAdmin
      .from('classes')
      .select('id, name')
      .order('name');

    if (classesError) {
      console.error('Error fetching classes:', classesError);
      return NextResponse.json({ error: 'Failed to fetch classes' }, { status: 500 });
    }

    // Get all subjects
    const { data: subjects, error: subjectsError } = await supabaseAdmin
      .from('subjects')
      .select('id, name')
      .order('name');

    if (subjectsError) {
      console.error('Error fetching subjects:', subjectsError);
      return NextResponse.json({ error: 'Failed to fetch subjects' }, { status: 500 });
    }

    return NextResponse.json({
      exams: exams || [],
      classes: classes || [],
      subjects: subjects || [],
      success: true
    });

  } catch (error: unknown) {
    console.error('Error in exam-metadata API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create new exam
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:exam"]);
    if (!guard.ok) return guard.response;
    const tenantId = guard.tenantId;

    // Parse raw text first to ensure we can gracefully handle invalid JSON
    const raw = await request.text();
    let body: CreateExamData;
    try {
      body = JSON.parse(raw);
    } catch (err) {
      console.error('Invalid JSON in exam creation request:', raw?.slice(0, 500), err);
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const {
      title,
      subjects,
      classIds,
      dateRange,
      conductWeightages,
      gradingSystemId,
      excludedStudentIdsByClass,
      subjectConfigByClass,
      studentSubjectExceptionsByClass,
    } = body;

    console.log('Received exam creation request:', { title, subjects, classIds, dateRange, conductWeightages, gradingSystemId });

    if (!title || !subjects.length || !classIds.length || !dateRange.from) {
      console.log('Missing required fields validation failed');
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Early validation for UUID formats
    if (!Array.isArray(classIds) || classIds.some((id) => !isValidUuid(id))) {
      return NextResponse.json({ error: 'Invalid class ID format' }, { status: 400 });
    }
    if (gradingSystemId && !isValidUuid(gradingSystemId)) {
      return NextResponse.json({ error: 'Invalid grading system ID format' }, { status: 400 });
    }

    // Create a service role client to bypass RLS issues
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Start a transaction to create exam and related records
    console.log('Creating exam with data:', {
      name: title,
      type: 'formal',
      exam_start_date: dateRange.from,
      exam_end_date: dateRange.to || dateRange.from,
      grading_system_id: gradingSystemId || null,
      created_at: new Date().toISOString()
    });
    
    const examInsertBase = {
      name: title,
      type: 'formal',
      exam_start_date: dateRange.from,
      exam_end_date: dateRange.to || dateRange.from,
      grading_system_id: gradingSystemId || null,
      created_at: new Date().toISOString()
    };
    const examInsertWithTenant = tenantId
      ? { ...examInsertBase, tenant_id: tenantId }
      : examInsertBase;

    let { data: exam, error: examError } = await supabaseAdmin
      .from('exams')
      .insert(examInsertWithTenant)
      .select()
      .single();
    if (examError && tenantId && hasMissingTenantColumn(examError)) {
      const fallback = await supabaseAdmin
        .from('exams')
        .insert(examInsertBase)
        .select()
        .single();
      exam = fallback.data;
      examError = fallback.error;
    }

    if (examError) {
      console.error('Error creating exam:', examError);
      console.error('Exam error details:', JSON.stringify(examError, null, 2));
      return NextResponse.json({ 
        error: 'Failed to create exam', 
        details: examError.message || 'Unknown error',
        code: examError.code || 'NO_CODE'
      }, { status: 500 });
    }

    // Get subject IDs from subject names
    let subjectQuery = supabaseAdmin
      .from('subjects')
      .select('id, name')
      .in('name', subjects);
    if (tenantId) {
      subjectQuery = subjectQuery.eq('tenant_id', tenantId);
    }
    let { data: subjectData, error: subjectError } = await subjectQuery;
    if (subjectError && tenantId && hasMissingTenantColumn(subjectError)) {
      const fallback = await supabaseAdmin
        .from('subjects')
        .select('id, name')
        .in('name', subjects);
      subjectData = fallback.data;
      subjectError = fallback.error;
    }

    if (subjectError) {
      console.error('Error fetching subjects:', subjectError);
      return NextResponse.json({ error: 'Failed to fetch subjects' }, { status: 500 });
    }

    // Create exam_subjects entries
    const resolvedSubjectData = (subjectData ?? []) as Array<{ id: string; name: string | null }>;
    if (resolvedSubjectData.length === 0) {
      return NextResponse.json({ error: 'No valid subjects found for this exam' }, { status: 400 });
    }

    const examSubjectsBase = resolvedSubjectData.map(subject => ({
      exam_id: exam.id,
      subject_id: subject.id
    }));
    const examSubjects = tenantId
      ? examSubjectsBase.map((row) => ({ ...row, tenant_id: tenantId }))
      : examSubjectsBase;

    let { error: examSubjectsError } = await supabaseAdmin
      .from('exam_subjects')
      .insert(examSubjects);
    if (examSubjectsError && tenantId && hasMissingTenantColumn(examSubjectsError)) {
      const fallback = await supabaseAdmin
        .from('exam_subjects')
        .insert(examSubjectsBase);
      examSubjectsError = fallback.error;
    }

    if (examSubjectsError) {
      console.error('Error creating exam subjects:', examSubjectsError);
      return NextResponse.json({ error: 'Failed to create exam subjects' }, { status: 500 });
    }

    // Create exam_classes entries with conduct weightages
    const examClassesBase = classIds.map(classId => ({
      exam_id: exam.id,
      class_id: classId,
      conduct_weightage: conductWeightages[classId] || 0
    }));
    const examClasses = tenantId
      ? examClassesBase.map((row) => ({ ...row, tenant_id: tenantId }))
      : examClassesBase;

    let { error: examClassesError } = await supabaseAdmin
      .from('exam_classes')
      .insert(examClasses);
    if (examClassesError && tenantId && hasMissingTenantColumn(examClassesError)) {
      const fallback = await supabaseAdmin
        .from('exam_classes')
        .insert(examClassesBase);
      examClassesError = fallback.error;
    }

    if (examClassesError) {
      console.error('Error creating exam classes:', examClassesError);
      return NextResponse.json({ error: 'Failed to create exam classes' }, { status: 500 });
    }

    // Optional: Create per-class subject mapping
    try {
      const map = subjectConfigByClass || {};
      if (map && Object.keys(map).length > 0) {
        // Resolve subject IDs by name used in request
        const subjectRows = resolvedSubjectData;
        const subjectsByName = new Map(
          subjectRows
            .filter((s) => typeof s.name === 'string')
            .map((s) => [String(s.name), String(s.id)])
        );
        const ecsRowsBase: Array<{ exam_id: string; class_id: string; subject_id: string }> = [];
        for (const [classId, subjectNames] of Object.entries(map)) {
          if (!isValidUuid(classId)) continue;
          (subjectNames || []).forEach((name) => {
            const sid = subjectsByName.get(String(name));
            if (sid) ecsRowsBase.push({ exam_id: exam.id, class_id: classId, subject_id: sid });
          });
        }
        if (ecsRowsBase.length > 0) {
          const ecsRows = tenantId
            ? ecsRowsBase.map((row) => ({ ...row, tenant_id: tenantId }))
            : ecsRowsBase;
          let { error: ecsErr } = await supabaseAdmin
            .from('exam_class_subjects')
            .insert(ecsRows);
          if (ecsErr && tenantId && hasMissingTenantColumn(ecsErr)) {
            const fallback = await supabaseAdmin
              .from('exam_class_subjects')
              .insert(ecsRowsBase);
            ecsErr = fallback.error;
          }
          if (ecsErr) throw ecsErr;
        }
      }
    } catch (e) {
      console.error('Error saving exam_class_subjects:', e);
    }

    // Optional: Insert excluded students for this exam
    try {
      const map = excludedStudentIdsByClass || {};
      const entriesBase: Array<{ exam_id: string; student_id: string; class_id: string | null }> = [];
      const allIds = Array.from(new Set(Object.values(map).flat().filter(Boolean)));
      if (allIds.length > 0) {
        // Validate students and capture their class_id
        const { data: roster, error: rosterErr } = await supabaseAdmin
          .from('students')
          .select('id, class_id')
          .neq('record_type', 'prospect')
          .in('id', allIds);
        if (rosterErr) throw rosterErr;
        const rosterRows = (roster ?? []) as Array<{ id: string; class_id: string | null }>;
        const classByStudent = new Map<string, string | null>(
          rosterRows.map((r) => [String(r.id), r.class_id ? String(r.class_id) : null])
        );

        // Build insert list; only include if student_id belongs to a selected class (if provided)
        for (const [klassId, studentIds] of Object.entries(map)) {
          for (const sid of (studentIds || [])) {
            const actualClassId = classByStudent.get(String(sid)) ?? null;
            // If class was provided, ensure it matches actual class; otherwise allow insert with actual class
            if (!actualClassId) continue; // skip unknown students
            if (klassId && isValidUuid(klassId) && actualClassId !== klassId) continue; // skip if mismatch
            entriesBase.push({ exam_id: exam.id, student_id: String(sid), class_id: actualClassId });
          }
        }

        if (entriesBase.length > 0) {
          const entries = tenantId
            ? entriesBase.map((row) => ({ ...row, tenant_id: tenantId }))
            : entriesBase;
          // Use upsert to avoid unique constraint errors if duplicates
          let { error: exclErr } = await supabaseAdmin
            .from('exam_excluded_students')
            .upsert(entries, { onConflict: 'exam_id,student_id' });
          if (exclErr && tenantId && hasMissingTenantColumn(exclErr)) {
            const fallback = await supabaseAdmin
              .from('exam_excluded_students')
              .upsert(entriesBase, { onConflict: 'exam_id,student_id' });
            exclErr = fallback.error;
          }
          if (exclErr) throw exclErr;
        }
      }
    } catch (exclError) {
      console.error('Error inserting exam excluded students:', exclError);
      // Non-fatal: proceed without blocking exam creation
    }

    try {
      const exceptionRows = await buildSubjectExceptionRows({
        supabaseAdmin,
        examId: exam.id,
        studentSubjectExceptionsByClass,
        subjectData: resolvedSubjectData,
      });
      await replaceExamSubjectExceptions({
        supabaseAdmin,
        examId: exam.id,
        rows: exceptionRows,
        tenantId,
      });
    } catch (subjectExceptionError) {
      console.error('Error inserting subject exceptions:', subjectExceptionError);
      // Non-fatal
    }

    try {
      await upsertExamRosterSnapshot({
        supabaseAdmin,
        examId: exam.id,
        tenantId,
        classIds
      });
    } catch (rosterError) {
      console.error('Error creating exam roster snapshot:', rosterError);
    }

    return NextResponse.json({ 
      success: true, 
      examId: exam.id,
      message: 'Exam created successfully' 
    });

  } catch (error: unknown) {
    console.error('Error in POST exam-metadata API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update existing exam
export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:exam"]);
    if (!guard.ok) return guard.response;
    const tenantId = guard.tenantId;

    const { searchParams } = new URL(request.url);
    const examId = searchParams.get('id');
    
    if (!examId) {
      return NextResponse.json({ error: 'Exam ID is required' }, { status: 400 });
    }
    if (!isValidUuid(examId)) {
      return NextResponse.json({ error: 'Invalid exam ID format' }, { status: 400 });
    }

    // Parse raw text first to ensure we can gracefully handle invalid JSON
    const raw = await request.text();
    let body: CreateExamData;
    try {
      body = JSON.parse(raw);
    } catch (err) {
      console.error('Invalid JSON in exam update request:', raw?.slice(0, 500), err);
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const {
      title,
      subjects,
      classIds,
      dateRange,
      conductWeightages,
      gradingSystemId,
      excludedStudentIdsByClass,
      subjectConfigByClass,
      studentSubjectExceptionsByClass,
    } = body;

    if (!title || !subjects.length || !classIds.length || !dateRange.from) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Early validation for UUID formats
    if (!Array.isArray(classIds) || classIds.some((id) => !isValidUuid(id))) {
      return NextResponse.json({ error: 'Invalid class ID format' }, { status: 400 });
    }
    if (gradingSystemId && !isValidUuid(gradingSystemId)) {
      return NextResponse.json({ error: 'Invalid grading system ID format' }, { status: 400 });
    }

    // Create a service role client to bypass RLS issues
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Update the exam
    const examUpdatePayload = {
      name: title,
      exam_start_date: dateRange.from,
      exam_end_date: dateRange.to || dateRange.from,
      grading_system_id: gradingSystemId || null,
      updated_at: new Date().toISOString()
    };
    let updateQuery = supabaseAdmin
      .from('exams')
      .update(examUpdatePayload)
      .eq('id', examId);
    if (tenantId) {
      updateQuery = updateQuery.eq('tenant_id', tenantId);
    }
    let { data: exam, error: examError } = await updateQuery
      .select()
      .single();
    if (examError && tenantId && hasMissingTenantColumn(examError)) {
      const fallback = await supabaseAdmin
        .from('exams')
        .update(examUpdatePayload)
        .eq('id', examId)
        .select()
        .single();
      exam = fallback.data;
      examError = fallback.error;
    }

    if (examError) {
      console.error('Error updating exam:', examError);
      return NextResponse.json({ error: 'Failed to update exam' }, { status: 500 });
    }

    // Delete existing exam_subjects and exam_classes
    await Promise.all([
      supabaseAdmin.from('exam_subjects').delete().eq('exam_id', examId),
      supabaseAdmin.from('exam_classes').delete().eq('exam_id', examId),
      supabaseAdmin.from('exam_class_subjects').delete().eq('exam_id', examId)
    ]);

    // Get subject IDs from subject names
    let subjectQuery = supabaseAdmin
      .from('subjects')
      .select('id, name')
      .in('name', subjects);
    if (tenantId) {
      subjectQuery = subjectQuery.eq('tenant_id', tenantId);
    }
    let { data: subjectData, error: subjectError } = await subjectQuery;
    if (subjectError && tenantId && hasMissingTenantColumn(subjectError)) {
      const fallback = await supabaseAdmin
        .from('subjects')
        .select('id, name')
        .in('name', subjects);
      subjectData = fallback.data;
      subjectError = fallback.error;
    }

    if (subjectError) {
      console.error('Error fetching subjects:', subjectError);
      return NextResponse.json({ error: 'Failed to fetch subjects' }, { status: 500 });
    }

    // Create new exam_subjects entries
    const resolvedSubjectData = (subjectData ?? []) as Array<{ id: string; name: string | null }>;
    if (resolvedSubjectData.length === 0) {
      return NextResponse.json({ error: 'No valid subjects found for this exam' }, { status: 400 });
    }

    const examSubjectsBase = resolvedSubjectData.map(subject => ({
      exam_id: examId,
      subject_id: subject.id
    }));
    const examSubjects = tenantId
      ? examSubjectsBase.map((row) => ({ ...row, tenant_id: tenantId }))
      : examSubjectsBase;

    let { error: examSubjectsError } = await supabaseAdmin
      .from('exam_subjects')
      .insert(examSubjects);
    if (examSubjectsError && tenantId && hasMissingTenantColumn(examSubjectsError)) {
      const fallback = await supabaseAdmin
        .from('exam_subjects')
        .insert(examSubjectsBase);
      examSubjectsError = fallback.error;
    }

    if (examSubjectsError) {
      console.error('Error creating exam subjects:', examSubjectsError);
      return NextResponse.json({ error: 'Failed to update exam subjects' }, { status: 500 });
    }

    // Create new exam_classes entries with conduct weightages
    const examClassesBase = classIds.map(classId => ({
      exam_id: examId,
      class_id: classId,
      conduct_weightage: conductWeightages[classId] || 0
    }));
    const examClasses = tenantId
      ? examClassesBase.map((row) => ({ ...row, tenant_id: tenantId }))
      : examClassesBase;

    let { error: examClassesError } = await supabaseAdmin
      .from('exam_classes')
      .insert(examClasses);
    if (examClassesError && tenantId && hasMissingTenantColumn(examClassesError)) {
      const fallback = await supabaseAdmin
        .from('exam_classes')
        .insert(examClassesBase);
      examClassesError = fallback.error;
    }

    if (examClassesError) {
      console.error('Error creating exam classes:', examClassesError);
      return NextResponse.json({ error: 'Failed to update exam classes' }, { status: 500 });
    }

    // Optional: Re-create per-class subject mapping
    try {
      const map = subjectConfigByClass || {};
      if (map && Object.keys(map).length > 0) {
        // Lookup all subjects by name
        const subjectRows = resolvedSubjectData;
        const byName = new Map(
          subjectRows
            .filter((s) => typeof s.name === 'string')
            .map((s) => [String(s.name), String(s.id)])
        );
        const ecsRowsBase: Array<{ exam_id: string; class_id: string; subject_id: string }> = [];
        for (const [classId, subjectNames] of Object.entries(map)) {
          if (!isValidUuid(classId)) continue;
          (subjectNames || []).forEach((name) => {
            const sid = byName.get(String(name));
            if (sid) ecsRowsBase.push({ exam_id: examId, class_id: classId, subject_id: sid });
          });
        }
        if (ecsRowsBase.length > 0) {
          const ecsRows = tenantId
            ? ecsRowsBase.map((row) => ({ ...row, tenant_id: tenantId }))
            : ecsRowsBase;
          let { error: ecsErr } = await supabaseAdmin
            .from('exam_class_subjects')
            .insert(ecsRows);
          if (ecsErr && tenantId && hasMissingTenantColumn(ecsErr)) {
            const fallback = await supabaseAdmin
              .from('exam_class_subjects')
              .insert(ecsRowsBase);
            ecsErr = fallback.error;
          }
          if (ecsErr) throw ecsErr;
        }
      }
    } catch (e) {
      console.error('Error updating exam_class_subjects:', e);
    }

    // Optional: Replace excluded students if provided
    try {
      if (excludedStudentIdsByClass) {
        // Clear existing exclusions for this exam and re-insert
        await supabaseAdmin.from('exam_excluded_students').delete().eq('exam_id', examId);

        const map = excludedStudentIdsByClass || {};
        const entriesBase: Array<{ exam_id: string; student_id: string; class_id: string | null }> = [];
        const allIds = Array.from(new Set(Object.values(map).flat().filter(Boolean)));
        if (allIds.length > 0) {
          const { data: roster, error: rosterErr } = await supabaseAdmin
            .from('students')
            .select('id, class_id')
            .neq('record_type', 'prospect')
            .in('id', allIds);
          if (rosterErr) throw rosterErr;
          const rosterRows = (roster ?? []) as Array<{ id: string; class_id: string | null }>;
          const classByStudent = new Map<string, string | null>(
            rosterRows.map((r) => [String(r.id), r.class_id ? String(r.class_id) : null])
          );
          for (const [klassId, studentIds] of Object.entries(map)) {
            for (const sid of (studentIds || [])) {
              const actualClassId = classByStudent.get(String(sid)) ?? null;
              if (!actualClassId) continue;
              if (klassId && isValidUuid(klassId) && actualClassId !== klassId) continue;
              entriesBase.push({ exam_id: examId, student_id: String(sid), class_id: actualClassId });
            }
          }
          if (entriesBase.length > 0) {
            const entries = tenantId
              ? entriesBase.map((row) => ({ ...row, tenant_id: tenantId }))
              : entriesBase;
            let { error: exclErr } = await supabaseAdmin
              .from('exam_excluded_students')
              .upsert(entries, { onConflict: 'exam_id,student_id' });
            if (exclErr && tenantId && hasMissingTenantColumn(exclErr)) {
              const fallback = await supabaseAdmin
                .from('exam_excluded_students')
                .upsert(entriesBase, { onConflict: 'exam_id,student_id' });
              exclErr = fallback.error;
            }
            if (exclErr) throw exclErr;
          }
        }
      }
    } catch (exclError) {
      console.error('Error updating exam excluded students:', exclError);
      // Non-fatal
    }

    try {
      const exceptionRows = await buildSubjectExceptionRows({
        supabaseAdmin,
        examId,
        studentSubjectExceptionsByClass,
        subjectData: resolvedSubjectData,
      });
      await replaceExamSubjectExceptions({
        supabaseAdmin,
        examId,
        rows: exceptionRows,
        tenantId,
      });
    } catch (subjectExceptionError) {
      console.error('Error updating subject exceptions:', subjectExceptionError);
      // Non-fatal
    }

    try {
      if (!exam.released) {
        await upsertExamRosterSnapshot({
          supabaseAdmin,
          examId,
          tenantId,
          classIds,
          clearExisting: true
        });
      }
    } catch (rosterError) {
      console.error('Error refreshing exam roster snapshot:', rosterError);
    }

    return NextResponse.json({ 
      success: true, 
      examId: exam.id,
      message: 'Exam updated successfully' 
    });

  } catch (error: unknown) {
    console.error('Error in PUT exam-metadata API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete existing exam
export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:exam"]);
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const examId = searchParams.get('id');
    
    if (!examId) {
      return NextResponse.json({ error: 'Exam ID is required' }, { status: 400 });
    }

    // Create a service role client to bypass RLS issues
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Check if exam has any results
    const { data: examResults, error: resultsError } = await supabaseAdmin
      .from('exam_results')
      .select('id')
      .eq('exam_id', examId)
      .limit(1);

    if (resultsError) {
      console.error('Error checking exam results:', resultsError);
      return NextResponse.json({ error: 'Failed to check exam results' }, { status: 500 });
    }

    // Check for cascade parameter
    const cascade = searchParams.get('cascade') === 'true';
    
    if (examResults && examResults.length > 0) {
      if (!cascade) {
        return NextResponse.json({ 
          error: 'Cannot delete exam with existing results. Please remove all student results first.',
          hasResults: true,
          resultsCount: examResults.length
        }, { status: 400 });
      } else {
        // Cascade delete: Delete all related exam results first
        const { error: deleteResultsError } = await supabaseAdmin
          .from('exam_results')
          .delete()
          .eq('exam_id', examId);
        
        if (deleteResultsError) {
          console.error('Error deleting exam results:', deleteResultsError);
          return NextResponse.json({ error: 'Failed to delete exam results' }, { status: 500 });
        }
      }
    }

    // Delete exam and all related records in correct order
    // First delete junction table records
    await Promise.all([
      supabaseAdmin.from('exam_roster').delete().eq('exam_id', examId),
      supabaseAdmin.from('exam_subjects').delete().eq('exam_id', examId),
      supabaseAdmin.from('exam_classes').delete().eq('exam_id', examId),
      supabaseAdmin.from('exam_class_subjects').delete().eq('exam_id', examId),
      supabaseAdmin.from('exam_excluded_students').delete().eq('exam_id', examId)
    ]);

    try {
      await supabaseAdmin.from('subject_opt_outs').delete().eq('exam_id', examId);
    } catch (subjectOptOutDeleteError) {
      console.warn('Failed to delete subject opt-outs during exam deletion:', subjectOptOutDeleteError);
    }

    // Finally delete the exam
    const { error: examError } = await supabaseAdmin
      .from('exams')
      .delete()
      .eq('id', examId);

    if (examError) {
      console.error('Error deleting exam:', examError);
      return NextResponse.json({ error: 'Failed to delete exam' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Exam deleted successfully' 
    });

  } catch (error: unknown) {
    console.error('Error in DELETE exam-metadata API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
