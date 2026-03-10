import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";
import { supabaseService } from "@/lib/supabaseServiceClient";
import { isAttendanceV2EnabledForTenant } from "@/lib/attendanceV2";
import { reopenTeacherSession } from "@/lib/campusAttendanceService";

const getUserRole = async (userId: string) => {
  const { data, error } = await supabaseService
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data?.role ?? null;
};

type Params = {
  params: Promise<{ sessionId: string }>;
};

type ReopenBody = {
  reason?: string;
};

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAuthenticatedTenantUser(request);
  if (!auth.ok) return auth.response;

  try {
    const enabled = await isAttendanceV2EnabledForTenant(supabaseService, auth.tenantId);
    if (!enabled) {
      return NextResponse.json({ error: "Attendance V2 is not enabled for this tenant." }, { status: 404 });
    }

    const role = await getUserRole(auth.userId);
    if (role !== "teacher") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const resolved = await params;
    const sessionId = resolved.sessionId;
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const body = (await request.json()) as ReopenBody;
    const reason = body.reason?.trim() || "";
    if (!reason) {
      return NextResponse.json({ error: "reason is required" }, { status: 400 });
    }

    const detail = await reopenTeacherSession(auth.tenantId, auth.userId, sessionId, reason);

    return NextResponse.json(detail);
  } catch (error) {
    console.error("Teacher attendance reopen error:", error);
    const message = error instanceof Error ? error.message : "Failed to reopen session";
    const status =
      message === "Forbidden"
        ? 403
        : message.includes("required") || message.includes("Only") || message.includes("48")
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
