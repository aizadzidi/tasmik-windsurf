import { NextRequest, NextResponse } from "next/server";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { normalizeId } from "@/lib/ids";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const examId = normalizeId(searchParams.get("examId"));
  const studentId = normalizeId(searchParams.get("studentId"));
  const classId = normalizeId(searchParams.get("classId"));

  if (!examId || !studentId) {
    return NextResponse.json(
      { success: false, error: "Missing examId or studentId" },
      { status: 400 }
    );
  }

  try {
    const rows = await adminOperationSimple(async (client) => {
      let query = client
        .from("exam_results")
        .select("id, subject_id, mark, final_score, grade, updated_at, subjects(name)")
        .eq("exam_id", examId)
        .eq("student_id", studentId);

      if (classId) {
        query = query.eq("class_id", classId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    });

    const mapped = rows.map((row) => ({
      result_id: (row as { id?: string | number })?.id ?? null,
      subject_id: row?.subject_id ? String(row.subject_id) : "",
      subject_name:
        (row as { subjects?: { name?: string | null } })?.subjects?.name ??
        (row?.subject_id ? String(row.subject_id) : "Subject"),
      mark: (row as { mark?: number | null })?.mark ?? null,
      final_score: (row as { final_score?: number | null })?.final_score ?? null,
      grade: (row as { grade?: string | null })?.grade ?? null,
      updated_at: (row as { updated_at?: string | null })?.updated_at ?? null,
    }));

    return NextResponse.json({ success: true, rows: mapped });
  } catch (error) {
    console.error("teacher/student-subjects error", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch student subjects" },
      { status: 500 }
    );
  }
}
