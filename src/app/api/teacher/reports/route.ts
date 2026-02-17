import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getJuzFromPageRange } from "@/lib/quranMapping";
import {
  MAX_NEW_MURAJAAH_SPAN,
  parseNullableInt,
  QURAN_PAGE_MAX,
  QURAN_PAGE_MIN
} from "@/lib/murajaahRange";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getUserFromRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

async function getStudentForTeacher(studentId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("students")
    .select("id, assigned_teacher_id, tenant_id")
    .neq("record_type", "prospect")
    .eq("id", studentId)
    .single();
  if (error || !data) return null;
  if (data.assigned_teacher_id !== userId) return null;
  return data;
}

const isNewMurajaahType = (value: unknown) => value === "New Murajaah";

const validateNewMurajaahRange = ({
  type,
  pageFrom,
  pageTo,
  juz
}: {
  type: unknown;
  pageFrom: unknown;
  pageTo: unknown;
  juz: unknown;
}): string | null => {
  if (!isNewMurajaahType(type)) return null;

  const fromValue = parseNullableInt(pageFrom);
  const toValue = parseNullableInt(pageTo);
  if (fromValue === null || toValue === null) {
    return "New Murajaah requires both page_from and page_to.";
  }
  if (
    fromValue < QURAN_PAGE_MIN || fromValue > QURAN_PAGE_MAX ||
    toValue < QURAN_PAGE_MIN || toValue > QURAN_PAGE_MAX
  ) {
    return "New Murajaah pages must be between 1 and 604.";
  }
  if (fromValue > toValue) {
    return "New Murajaah page_from must be less than or equal to page_to.";
  }

  const count = toValue - fromValue + 1;
  if (count > MAX_NEW_MURAJAAH_SPAN) {
    return `New Murajaah range cannot exceed ${MAX_NEW_MURAJAAH_SPAN} pages.`;
  }

  const derivedJuz = getJuzFromPageRange(fromValue, toValue);
  if (!derivedJuz) {
    return "Unable to derive juz from New Murajaah page range.";
  }

  const juzValue = parseNullableInt(juz);
  if (juzValue !== null && juzValue !== derivedJuz) {
    return `New Murajaah juz mismatch. Expected Juz ${derivedJuz}.`;
  }

  return null;
};

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await request.json();
    const studentId = String(payload?.student_id || "");
    if (!studentId) {
      return NextResponse.json({ error: "student_id is required" }, { status: 400 });
    }

    const student = await getStudentForTeacher(studentId, user.id);
    if (!student) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }

    const newMurajaahValidationError = validateNewMurajaahRange({
      type: payload?.type,
      pageFrom: payload?.page_from,
      pageTo: payload?.page_to,
      juz: payload?.juzuk
    });
    if (newMurajaahValidationError) {
      return NextResponse.json({ error: newMurajaahValidationError }, { status: 400 });
    }

    const row = {
      student_id: studentId,
      teacher_id: user.id,
      tenant_id: student.tenant_id,
      type: payload?.type ?? null,
      surah: payload?.surah ?? null,
      juzuk: payload?.juzuk ?? null,
      ayat_from: payload?.ayat_from ?? null,
      ayat_to: payload?.ayat_to ?? null,
      page_from: payload?.page_from ?? null,
      page_to: payload?.page_to ?? null,
      grade: payload?.grade ?? null,
      reading_progress: payload?.reading_progress ?? null,
      date: payload?.date ?? null,
    };

    const { data, error } = await supabaseAdmin
      .from("reports")
      .insert(row)
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await request.json();
    const reportId = String(payload?.id || "");
    if (!reportId) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { data: reportRow, error: reportError } = await supabaseAdmin
      .from("reports")
      .select("id, student_id, type, page_from, page_to, juzuk")
      .eq("id", reportId)
      .single();
    if (reportError || !reportRow) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const student = await getStudentForTeacher(String(reportRow.student_id), user.id);
    if (!student) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }

    const effectiveType = payload?.type ?? reportRow.type;
    const effectivePageFrom = payload?.page_from ?? reportRow.page_from;
    const effectivePageTo = payload?.page_to ?? reportRow.page_to;
    const effectiveJuz = payload?.juzuk ?? reportRow.juzuk;

    const newMurajaahValidationError = validateNewMurajaahRange({
      type: effectiveType,
      pageFrom: effectivePageFrom,
      pageTo: effectivePageTo,
      juz: effectiveJuz
    });
    if (newMurajaahValidationError) {
      return NextResponse.json({ error: newMurajaahValidationError }, { status: 400 });
    }

    const updates = {
      type: payload?.type,
      surah: payload?.surah,
      juzuk: payload?.juzuk,
      ayat_from: payload?.ayat_from,
      ayat_to: payload?.ayat_to,
      page_from: payload?.page_from,
      page_to: payload?.page_to,
      grade: payload?.grade,
      reading_progress: payload?.reading_progress,
      date: payload?.date,
    };

    const { data, error } = await supabaseAdmin
      .from("reports")
      .update(updates)
      .eq("id", reportId)
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await request.json();
    const reportId = String(payload?.id || "");
    if (!reportId) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { data: reportRow, error: reportError } = await supabaseAdmin
      .from("reports")
      .select("id, student_id")
      .eq("id", reportId)
      .single();
    if (reportError || !reportRow) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const student = await getStudentForTeacher(String(reportRow.student_id), user.id);
    if (!student) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }

    const { error } = await supabaseAdmin.from("reports").delete().eq("id", reportId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
