import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabaseServiceClient";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";

type AttendanceBody = {
  claim_id?: string;
  session_date?: string;
  status?: "present" | "absent";
  notes?: string | null;
};

type ClaimRow = {
  id: string;
  student_id: string;
  session_date: string;
  status: string | null;
  assigned_teacher_id: string | null;
  students?: { name?: string | null } | null;
  online_courses?: { name?: string | null } | null;
};

const monthDateRange = (monthKey: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
};

const currentMonthKey = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
};

const toNullable = (value?: string | null) => {
  if (value === undefined) return undefined;
  const trimmed = value === null ? "" : value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedTenantUser(request);
  if (!auth.ok) return auth.response;

  try {
    const roleRes = await supabaseService
      .from("users")
      .select("role")
      .eq("id", auth.userId)
      .maybeSingle();
    if (roleRes.error) throw roleRes.error;
    if (roleRes.data?.role !== "teacher") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const monthKey = new URL(request.url).searchParams.get("month") || currentMonthKey();
    const range = monthDateRange(monthKey);
    if (!range) {
      return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
    }

    const { data: claimsData, error: claimsError } = await supabaseService
      .from("online_slot_claims")
      .select("id, student_id, session_date, status, assigned_teacher_id, students(name), online_courses(name)")
      .eq("tenant_id", auth.tenantId)
      .eq("assigned_teacher_id", auth.userId)
      .eq("status", "active")
      .gte("session_date", range.start)
      .lt("session_date", range.end)
      .order("session_date", { ascending: true });
    if (claimsError) throw claimsError;

    const claimRows = (claimsData ?? []) as ClaimRow[];
    const claimIds = claimRows.map((row) => row.id);

    const { data: attendanceRows, error: attendanceError } = claimIds.length
      ? await supabaseService
          .from("online_attendance_sessions")
          .select("claim_id, session_date, status, notes, recorded_at")
          .eq("tenant_id", auth.tenantId)
          .eq("teacher_id", auth.userId)
          .in("claim_id", claimIds)
      : { data: [], error: null };
    if (attendanceError) throw attendanceError;

    const attendanceByClaim = new Map<string, { status: string; notes: string | null; recorded_at: string }>();
    (attendanceRows ?? []).forEach((row) => {
      const key = `${row.claim_id}:${row.session_date}`;
      attendanceByClaim.set(key, {
        status: row.status,
        notes: row.notes ?? null,
        recorded_at: row.recorded_at,
      });
    });

    const sessions = claimRows.map((claim) => {
      const key = `${claim.id}:${claim.session_date}`;
      const mark = attendanceByClaim.get(key);
      return {
        claim_id: claim.id,
        student_id: claim.student_id,
        student_name: claim.students?.name ?? "Student",
        course_name: claim.online_courses?.name ?? "Online Course",
        session_date: claim.session_date,
        attendance_status: mark?.status ?? null,
        attendance_notes: mark?.notes ?? null,
        recorded_at: mark?.recorded_at ?? null,
      };
    });

    const presentCount = sessions.filter((session) => session.attendance_status === "present").length;
    const absentCount = sessions.filter((session) => session.attendance_status === "absent").length;
    const markedCount = presentCount + absentCount;
    const attendanceRate = markedCount > 0 ? Math.round((presentCount / markedCount) * 100) : 0;

    return NextResponse.json({
      month: monthKey,
      summary: {
        total_sessions: sessions.length,
        marked_sessions: markedCount,
        present_count: presentCount,
        absent_count: absentCount,
        attendance_rate_pct: attendanceRate,
      },
      sessions,
    });
  } catch (error: unknown) {
    console.error("Teacher online attendance fetch error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch online attendance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedTenantUser(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as AttendanceBody;
    const claimId = (body.claim_id ?? "").trim();
    const sessionDate = (body.session_date ?? "").trim();
    if (!claimId || !sessionDate || (body.status !== "present" && body.status !== "absent")) {
      return NextResponse.json(
        { error: "claim_id, session_date and status(present|absent) are required" },
        { status: 400 }
      );
    }

    const roleRes = await supabaseService
      .from("users")
      .select("role")
      .eq("id", auth.userId)
      .maybeSingle();
    if (roleRes.error) throw roleRes.error;
    if (roleRes.data?.role !== "teacher") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: claimRow, error: claimError } = await supabaseService
      .from("online_slot_claims")
      .select("id, student_id, session_date, assigned_teacher_id, status")
      .eq("tenant_id", auth.tenantId)
      .eq("id", claimId)
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimRow?.id || claimRow.assigned_teacher_id !== auth.userId) {
      return NextResponse.json({ error: "Claim not found for this teacher." }, { status: 404 });
    }
    if (claimRow.status !== "active") {
      return NextResponse.json({ error: "Only active claims can be marked for attendance." }, { status: 409 });
    }
    if (claimRow.session_date !== sessionDate) {
      return NextResponse.json({ error: "session_date must match claim session date." }, { status: 400 });
    }

    const { data, error } = await supabaseService
      .from("online_attendance_sessions")
      .upsert(
        {
          tenant_id: auth.tenantId,
          claim_id: claimId,
          student_id: claimRow.student_id,
          teacher_id: auth.userId,
          session_date: sessionDate,
          status: body.status,
          notes: toNullable(body.notes),
        },
        { onConflict: "tenant_id,claim_id,session_date" }
      )
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("Teacher online attendance mark error:", error);
    const message = error instanceof Error ? error.message : "Failed to mark attendance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
