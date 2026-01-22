import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type StudentRow = {
  id: string;
  name: string;
  class_id: string | null;
};

type ExamRosterRow = {
  student_id: string | null;
  class_id: string | null;
};

type ExamResultRow = {
  student_id: string | null;
  subject_id: string | null;
  mark: number | null;
  final_score: number | null;
  grade: string | null;
  subjects?: { name?: string | null } | null;
};

type ConductEntryRow = {
  student_id: string | null;
  discipline: number | null;
  effort: number | null;
  participation: number | null;
  motivational_level: number | null;
  character: number | null;
  leadership: number | null;
};

type ConductScoreRow = {
  student_id: string | null;
  subject_id: string | null;
  discipline: number | null;
  effort: number | null;
  participation: number | null;
  motivational_level: number | null;
  character_score: number | null;
  leadership: number | null;
  updated_at?: string | null;
};

type SubjectRow = { id: string | null; name: string | null };

type SubjectOptOutRow = {
  exam_id: string | null;
  subject_id: string | null;
  student_id: string | null;
};

type ExamClassWeightRow = {
  class_id: string | null;
  conduct_weightage: number | null;
};

type StudentData = {
  id: string;
  name: string;
  class: string;
  classId?: string;
  subjects: Record<
    string,
    {
      score: number;
      trend: number[];
      grade: string;
      exams?: { name: string; score: number }[];
      optedOut?: boolean;
    }
  >;
  conduct: {
    discipline: number;
    effort: number;
    participation: number;
    motivationalLevel: number;
    character: number;
    leadership: number;
  };
  conductPercentages?: {
    discipline: number;
    effort: number;
    participation: number;
    motivationalLevel: number;
    character: number;
    leadership: number;
  };
  overall: {
    average: number;
    rank: number;
    needsAttention: boolean;
    attentionReason?: string;
  };
};

async function getUserFromRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const examId = searchParams.get("examId");
    const classId = searchParams.get("classId");

    if (!examId) {
      return NextResponse.json({ error: "examId is required" }, { status: 400 });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("tenant_id, role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError || !profile?.tenant_id) {
      return NextResponse.json({ error: "Missing profile" }, { status: 403 });
    }

    const tenantId = String(profile.tenant_id);
    const role = String(profile.role || "");
    const isTeacher = role === "teacher";
    const isAdmin = role === "school_admin";
    if (!isTeacher && !isAdmin) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }

    const rosterRes = await supabaseAdmin
      .from("exam_roster")
      .select("student_id, class_id")
      .eq("exam_id", examId)
      .eq("tenant_id", tenantId);
    if (rosterRes.error) throw rosterRes.error;
    let rosterRows = (rosterRes.data ?? []) as ExamRosterRow[];
    if (classId) {
      rosterRows = rosterRows.filter((row) => String(row?.class_id || "") === String(classId));
    }

    const rosterIds = rosterRows
      .map((row) => row?.student_id)
      .filter((id): id is string => typeof id === "string");
    if (rosterIds.length === 0) {
      return NextResponse.json({ students: [], subjects: [], success: true });
    }

    const studentsQuery = supabaseAdmin
      .from("students")
      .select("id, name, class_id")
      .eq("tenant_id", tenantId)
      .neq("record_type", "prospect")
      .in("id", rosterIds);
    const { data: studentRows, error: studentError } = await studentsQuery;
    if (studentError) throw studentError;
    let students = (studentRows ?? []) as StudentRow[];
    if (students.length === 0) {
      return NextResponse.json({ students: [], subjects: [], success: true });
    }

    const excludedRes = await supabaseAdmin
      .from("exam_excluded_students")
      .select("student_id")
      .eq("exam_id", examId)
      .eq("tenant_id", tenantId);
    if (excludedRes.error) throw excludedRes.error;
    const excludedIds = new Set(
      (excludedRes.data ?? []).map((row) => String((row as { student_id?: string | null })?.student_id))
    );
    if (excludedIds.size > 0) {
      students = students.filter((s) => !excludedIds.has(String(s.id)));
    }
    if (students.length === 0) {
      return NextResponse.json({ students: [], subjects: [], success: true });
    }

    const allowedStudentIds = students.map((s) => String(s.id));
    const rosterClassByStudent = new Map<string, string | null>();
    rosterRows.forEach((row) => {
      if (!row?.student_id) return;
      rosterClassByStudent.set(String(row.student_id), row.class_id ? String(row.class_id) : null);
    });

    const classIds = Array.from(
      new Set(
        rosterRows
          .map((row) => row?.class_id)
          .filter((id): id is string => typeof id === "string")
      )
    );
    const classesRes = await supabaseAdmin
      .from("classes")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .in("id", classIds);
    if (classesRes.error) throw classesRes.error;
    const classNameById = new Map<string, string>();
    (classesRes.data ?? []).forEach((row: { id: string; name: string | null }) => {
      if (row?.id) classNameById.set(String(row.id), row.name ?? "Unknown");
    });

    const examClassesRes = await supabaseAdmin
      .from("exam_classes")
      .select("class_id, conduct_weightage")
      .eq("exam_id", examId)
      .eq("tenant_id", tenantId);
    if (examClassesRes.error) throw examClassesRes.error;
    const conductWeightByClassId = new Map<string, number>();
    (examClassesRes.data ?? []).forEach((row: ExamClassWeightRow) => {
      if (!row?.class_id) return;
      conductWeightByClassId.set(String(row.class_id), Number(row.conduct_weightage) || 0);
    });

    const subjectMetaById = new Map<string, string>();
    let subjectRows: SubjectRow[] = [];
    if (classId) {
      const ecsRes = await supabaseAdmin
        .from("exam_class_subjects")
        .select("subjects!exam_class_subjects_subject_id_fkey(id, name)")
        .eq("exam_id", examId)
        .eq("class_id", classId)
        .eq("tenant_id", tenantId);
      if (ecsRes.error) throw ecsRes.error;
      subjectRows = (ecsRes.data ?? [])
        .flatMap((row: { subjects?: SubjectRow | SubjectRow[] | null }) => {
          const subjects = row.subjects;
          if (!subjects) return [];
          return Array.isArray(subjects) ? subjects : [subjects];
        })
        .filter((row): row is SubjectRow => Boolean(row?.id) && Boolean(row?.name));
    }
    if (!subjectRows.length) {
      const esRes = await supabaseAdmin
        .from("exam_subjects")
        .select("subjects!exam_subjects_subject_id_fkey(id, name)")
        .eq("exam_id", examId)
        .eq("tenant_id", tenantId);
      if (esRes.error) throw esRes.error;
      subjectRows = (esRes.data ?? [])
        .flatMap((row: { subjects?: SubjectRow | SubjectRow[] | null }) => {
          const subjects = row.subjects;
          if (!subjects) return [];
          return Array.isArray(subjects) ? subjects : [subjects];
        })
        .filter((row): row is SubjectRow => Boolean(row?.id) && Boolean(row?.name));
    }
    subjectRows.forEach((row) => {
      const id = row?.id ? String(row.id) : null;
      const name = row?.name ? String(row.name) : null;
      if (id && name) subjectMetaById.set(id, name);
    });

    const resultsRes = await supabaseAdmin
      .from("exam_results")
      .select("student_id, subject_id, mark, final_score, grade, subjects!exam_results_subject_id_fkey(name)")
      .eq("exam_id", examId)
      .eq("tenant_id", tenantId)
      .in("student_id", allowedStudentIds);
    if (resultsRes.error) throw resultsRes.error;
    const examResults = (resultsRes.data ?? []) as ExamResultRow[];

    examResults.forEach((row) => {
      const subjId = row?.subject_id ? String(row.subject_id) : null;
      if (!subjId) return;
      const name = row.subjects?.name ? String(row.subjects.name) : subjectMetaById.get(subjId);
      if (name) subjectMetaById.set(subjId, name);
    });

    const optOutRes = await supabaseAdmin
      .from("subject_opt_outs")
      .select("exam_id, subject_id, student_id")
      .eq("exam_id", examId)
      .eq("tenant_id", tenantId)
      .in("student_id", allowedStudentIds);
    const optOutMap = new Map<string, Set<string>>();
    if (!optOutRes.error) {
      (optOutRes.data ?? []).forEach((row: SubjectOptOutRow) => {
        const sid = row?.student_id ? String(row.student_id) : null;
        const subjId = row?.subject_id ? String(row.subject_id) : null;
        if (!sid || !subjId) return;
        if (!optOutMap.has(sid)) optOutMap.set(sid, new Set());
        optOutMap.get(sid)!.add(subjId);
      });
    }

    const conductEntriesRes = await supabaseAdmin
      .from("conduct_entries")
      .select("student_id, discipline, effort, participation, motivational_level, character, leadership")
      .eq("exam_id", examId)
      .eq("tenant_id", tenantId)
      .in("student_id", allowedStudentIds);
    if (conductEntriesRes.error) throw conductEntriesRes.error;
    const conductEntries = (conductEntriesRes.data ?? []) as ConductEntryRow[];

    const conductScoresRes = await supabaseAdmin
      .from("conduct_scores")
      .select("student_id, subject_id, discipline, effort, participation, motivational_level, character_score, leadership, updated_at")
      .eq("exam_id", examId)
      .eq("tenant_id", tenantId)
      .in("student_id", allowedStudentIds);
    if (conductScoresRes.error) throw conductScoresRes.error;
    const conductScores = (conductScoresRes.data ?? []) as ConductScoreRow[];

    const conductByStudent = new Map<
      string,
      { percentages: StudentData["conductPercentages"]; normalized: StudentData["conduct"] }
    >();
    const entryGroups = new Map<string, ConductEntryRow[]>();
    conductEntries.forEach((entry) => {
      const sid = entry?.student_id ? String(entry.student_id) : null;
      if (!sid) return;
      if (!entryGroups.has(sid)) entryGroups.set(sid, []);
      entryGroups.get(sid)!.push(entry);
    });
    const scoresByStudent = new Map<string, ConductScoreRow[]>();
    conductScores.forEach((row) => {
      const sid = row?.student_id ? String(row.student_id) : null;
      if (!sid) return;
      if (!scoresByStudent.has(sid)) scoresByStudent.set(sid, []);
      scoresByStudent.get(sid)!.push(row);
    });

    allowedStudentIds.forEach((sid) => {
      const entries = entryGroups.get(sid) || [];
      let percentages: StudentData["conductPercentages"] | undefined;
      let normalized: StudentData["conduct"] | undefined;

      if (entries.length > 0) {
        const sums = entries.reduce(
          (acc, e) => ({
            discipline: acc.discipline + (Number(e.discipline) || 0),
            effort: acc.effort + (Number(e.effort) || 0),
            participation: acc.participation + (Number(e.participation) || 0),
            motivationalLevel: acc.motivationalLevel + (Number(e.motivational_level) || 0),
            character: acc.character + (Number(e.character) || 0),
            leadership: acc.leadership + (Number(e.leadership) || 0),
          }),
          { discipline: 0, effort: 0, participation: 0, motivationalLevel: 0, character: 0, leadership: 0 }
        );
        const n = entries.length || 1;
        percentages = {
          discipline: sums.discipline / n,
          effort: sums.effort / n,
          participation: sums.participation / n,
          motivationalLevel: sums.motivationalLevel / n,
          character: sums.character / n,
          leadership: sums.leadership / n,
        };
        normalized = {
          discipline: percentages.discipline / 20,
          effort: percentages.effort / 20,
          participation: percentages.participation / 20,
          motivationalLevel: percentages.motivationalLevel / 20,
          character: percentages.character / 20,
          leadership: percentages.leadership / 20,
        };
      } else {
        const scoreRows = scoresByStudent.get(sid) || [];
        const override = scoreRows
          .filter((r) => r.subject_id == null)
          .sort((a, b) => new Date(String(b.updated_at || 0)).getTime() - new Date(String(a.updated_at || 0)).getTime())[0];
        const rows = override ? [override] : scoreRows.filter((r) => r.subject_id != null);
        if (rows.length > 0) {
          const sums = rows.reduce(
            (acc, r) => ({
              discipline: acc.discipline + (Number(r.discipline) || 0),
              effort: acc.effort + (Number(r.effort) || 0),
              participation: acc.participation + (Number(r.participation) || 0),
              motivationalLevel: acc.motivationalLevel + (Number(r.motivational_level) || 0),
              character: acc.character + (Number(r.character_score) || 0),
              leadership: acc.leadership + (Number(r.leadership) || 0),
            }),
            { discipline: 0, effort: 0, participation: 0, motivationalLevel: 0, character: 0, leadership: 0 }
          );
          const n = rows.length || 1;
          percentages = {
            discipline: sums.discipline / n,
            effort: sums.effort / n,
            participation: sums.participation / n,
            motivationalLevel: sums.motivationalLevel / n,
            character: sums.character / n,
            leadership: sums.leadership / n,
          };
          normalized = {
            discipline: percentages.discipline / 20,
            effort: percentages.effort / 20,
            participation: percentages.participation / 20,
            motivationalLevel: percentages.motivationalLevel / 20,
            character: percentages.character / 20,
            leadership: percentages.leadership / 20,
          };
        }
      }

      conductByStudent.set(sid, {
        percentages: percentages || {
          discipline: 0,
          effort: 0,
          participation: 0,
          motivationalLevel: 0,
          character: 0,
          leadership: 0,
        },
        normalized: normalized || {
          discipline: 0,
          effort: 0,
          participation: 0,
          motivationalLevel: 0,
          character: 0,
          leadership: 0,
        },
      });
    });

    const subjectsSeen = new Set<string>();
    const studentsData: StudentData[] = students.map((student) => {
      const studentResults = examResults.filter((r) => String(r.student_id) === String(student.id));
      const subjectsData: StudentData["subjects"] = {};
      studentResults.forEach((result) => {
        const subjId = result?.subject_id ? String(result.subject_id) : null;
        if (!subjId) return;
        const subjectName = result?.subjects?.name
          ? String(result.subjects.name)
          : subjectMetaById.get(subjId) || `Subject ${subjId}`;
        const grade = typeof result.grade === "string" ? result.grade : "";
        const isTH = grade.toUpperCase() === "TH";
        const markCandidate = result.final_score ?? result.mark;
        const numericMark = typeof markCandidate === "number" ? markCandidate : Number(markCandidate);
        const hasNumericMark = Number.isFinite(numericMark);
        if (!hasNumericMark && !isTH && !grade) return;
        subjectsData[subjectName] = {
          score: hasNumericMark ? Number(numericMark) : 0,
          trend: hasNumericMark ? [Number(numericMark)] : [],
          grade,
          optedOut: optOutMap.get(String(student.id))?.has(subjId) || undefined,
        };
        subjectsSeen.add(subjectName);
      });

      const conduct = conductByStudent.get(String(student.id));
      const scores = Object.values(subjectsData).map((s) => s.score).filter((n) => Number.isFinite(n));
      const academicAvg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      const rosterClassId = rosterClassByStudent.get(String(student.id)) ?? null;
      const effectiveClassId = rosterClassId || (student.class_id ? String(student.class_id) : null);
      const cw = effectiveClassId ? conductWeightByClassId.get(effectiveClassId) || 0 : 0;
      const aw = Math.max(0, 100 - cw);
      const conductPercent =
        conduct?.percentages &&
        Object.values(conduct.percentages).reduce((a, b) => a + (Number(b) || 0), 0) / 6;
      const average = Math.round((academicAvg * aw + (conductPercent || 0) * cw) / 100);
      const needsAttention = average < 60;

      const className = effectiveClassId ? classNameById.get(effectiveClassId) : undefined;
      return {
        id: String(student.id),
        name: student.name,
        class: className || "Unknown",
        classId: effectiveClassId || undefined,
        subjects: subjectsData,
        conduct: conduct?.normalized || {
          discipline: 0,
          effort: 0,
          participation: 0,
          motivationalLevel: 0,
          character: 0,
          leadership: 0,
        },
        conductPercentages: conduct?.percentages,
        overall: {
          average,
          rank: 0,
          needsAttention,
        },
      };
    });

    studentsData.sort((a, b) => b.overall.average - a.overall.average);
    studentsData.forEach((s, idx) => {
      s.overall.rank = idx + 1;
    });

    return NextResponse.json({
      students: studentsData,
      subjects: Array.from(subjectsSeen),
      success: true,
    });
  } catch (error: unknown) {
    console.error("Teacher exams API error:", error);
    const message = error instanceof Error ? error.message : "Failed to load exam data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
