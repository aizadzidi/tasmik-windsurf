import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { supabaseService } from "@/lib/supabaseServiceClient";
import { isAttendanceV2EnabledForTenant } from "@/lib/attendanceV2";
import { getAdminSessionDetail } from "@/lib/campusAttendanceService";

type Params = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const guard = await requireAdminPermission(request, ["admin:attendance"]);
  if (!guard.ok) return guard.response;

  try {
    const enabled = await isAttendanceV2EnabledForTenant(supabaseService, guard.tenantId);
    if (!enabled) {
      return NextResponse.json({ error: "Attendance V2 is not enabled for this tenant." }, { status: 404 });
    }

    const resolved = await params;
    const sessionId = resolved.sessionId;
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const detail = await getAdminSessionDetail(guard.tenantId, sessionId);
    return NextResponse.json(detail);
  } catch (error) {
    console.error("Admin attendance session detail error:", error);
    const message = error instanceof Error ? error.message : "Failed to load session";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
