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

async function getUserFromRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

function formatError(error: unknown) {
  if (error instanceof Error) return { message: error.message };
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      message: typeof record.message === "string" ? record.message : "Unexpected error",
      code: record.code,
      details: record.details,
      hint: record.hint,
    };
  }
  return { message: "Unexpected error" };
}

async function getTopicForTeacher(topicId: string, userId: string) {
  const { data: topic, error: topicError } = await supabaseAdmin
    .from("lesson_topics")
    .select("id, class_id, tenant_id")
    .eq("id", topicId)
    .single();
  if (topicError || !topic) {
    return { topic: null, reason: "not_found" as const };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.tenant_id || profile.tenant_id !== topic.tenant_id) {
    return { topic: null, reason: "forbidden" as const };
  }
  if (profile.role !== "teacher" && profile.role !== "school_admin") {
    return { topic: null, reason: "forbidden" as const };
  }

  return { topic, reason: null };
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await request.json();
    const topicId = String(payload?.topic_id || "");
    const subtopicIndex = Number(payload?.subtopic_index);
    const academicYear = Number(payload?.academic_year);

    if (!topicId) {
      return NextResponse.json({ error: "topic_id is required" }, { status: 400 });
    }
    if (!Number.isFinite(subtopicIndex)) {
      return NextResponse.json({ error: "subtopic_index is required" }, { status: 400 });
    }
    if (!Number.isFinite(academicYear)) {
      return NextResponse.json({ error: "academic_year is required" }, { status: 400 });
    }

    const access = await getTopicForTeacher(topicId, user.id);
    if (!access.topic) {
      return NextResponse.json(
        { error: access.reason === "not_found" ? "Topic not found" : "Not allowed" },
        { status: access.reason === "not_found" ? 404 : 403 }
      );
    }

    const row = {
      topic_id: topicId,
      subtopic_index: subtopicIndex,
      teacher_id: user.id,
      academic_year: academicYear,
      taught_on: payload?.taught_on ?? null,
      remark: payload?.remark ?? null,
      tenant_id: access.topic.tenant_id ?? null,
    };

    const { data, error } = await supabaseAdmin
      .from("lesson_subtopic_progress")
      .upsert(row, { onConflict: "topic_id,subtopic_index,teacher_id,academic_year" })
      .select("id, subtopic_index, taught_on, remark")
      .single();
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: unknown) {
    const formatted = formatError(error);
    console.error("Lesson subtopic progress save failed", formatted);
    return NextResponse.json(
      {
        error: formatted.message || "Failed to save subtopic progress",
        details: formatted.details ?? null,
        hint: formatted.hint ?? null,
        code: formatted.code ?? null,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await request.json();
    const topicId = String(payload?.topic_id || "");
    const subtopicIndex = Number(payload?.subtopic_index);
    const academicYear = Number(payload?.academic_year);

    if (!topicId) {
      return NextResponse.json({ error: "topic_id is required" }, { status: 400 });
    }
    if (!Number.isFinite(subtopicIndex)) {
      return NextResponse.json({ error: "subtopic_index is required" }, { status: 400 });
    }
    if (!Number.isFinite(academicYear)) {
      return NextResponse.json({ error: "academic_year is required" }, { status: 400 });
    }

    const access = await getTopicForTeacher(topicId, user.id);
    if (!access.topic) {
      return NextResponse.json(
        { error: access.reason === "not_found" ? "Topic not found" : "Not allowed" },
        { status: access.reason === "not_found" ? 404 : 403 }
      );
    }

    const { error } = await supabaseAdmin
      .from("lesson_subtopic_progress")
      .delete()
      .eq("topic_id", topicId)
      .eq("subtopic_index", subtopicIndex)
      .eq("teacher_id", user.id)
      .eq("academic_year", academicYear);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const formatted = formatError(error);
    console.error("Lesson subtopic progress delete failed", formatted);
    return NextResponse.json(
      {
        error: formatted.message || "Failed to delete subtopic progress",
        details: formatted.details ?? null,
        hint: formatted.hint ?? null,
        code: formatted.code ?? null,
      },
      { status: 500 }
    );
  }
}
