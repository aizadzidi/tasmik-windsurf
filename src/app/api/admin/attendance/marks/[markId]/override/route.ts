import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { supabaseService } from "@/lib/supabaseServiceClient";
import { isAttendanceV2EnabledForTenant } from "@/lib/attendanceV2";
import { overrideAttendanceMark } from "@/lib/campusAttendanceService";
import type { OverrideMarkPayload } from "@/types/campusAttendance";

type Params = {
  params: Promise<{ markId: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const guard = await requireAdminPermission(request, ["admin:attendance"]);
  if (!guard.ok) return guard.response;

  try {
    const enabled = await isAttendanceV2EnabledForTenant(supabaseService, guard.tenantId);
    if (!enabled) {
      return NextResponse.json({ error: "Attendance V2 is not enabled for this tenant." }, { status: 404 });
    }

    const resolved = await params;
    const markId = resolved.markId;
    if (!markId) {
      return NextResponse.json({ error: "markId is required" }, { status: 400 });
    }

    const body = (await request.json()) as OverrideMarkPayload;
    if (!body.reason?.trim()) {
      return NextResponse.json({ error: "reason is required" }, { status: 400 });
    }

    const mark = await overrideAttendanceMark(
      guard.tenantId,
      guard.userId,
      markId,
      body.status,
      body.reason,
      body.notes?.trim() || null,
    );

    return NextResponse.json({ mark });
  } catch (error) {
    console.error("Admin attendance override error:", error);
    const message = error instanceof Error ? error.message : "Failed to override attendance";
    const status = message.includes("not found") ? 404 : message.includes("required") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
