import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { supabaseService } from "@/lib/supabaseServiceClient";
import { isAttendanceV2EnabledForTenant } from "@/lib/attendanceV2";
import { updateSessionTemplate } from "@/lib/campusAttendanceService";
import type { SessionTemplatePayload } from "@/types/campusAttendance";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: NextRequest, { params }: Params) {
  const guard = await requireAdminPermission(request, ["admin:attendance"]);
  if (!guard.ok) return guard.response;

  try {
    const enabled = await isAttendanceV2EnabledForTenant(supabaseService, guard.tenantId);
    if (!enabled) {
      return NextResponse.json({ error: "Attendance V2 is not enabled for this tenant." }, { status: 404 });
    }

    const resolved = await params;
    const id = resolved.id;
    if (!id) {
      return NextResponse.json({ error: "template id is required" }, { status: 400 });
    }

    const payload = (await request.json()) as Partial<SessionTemplatePayload>;
    const template = await updateSessionTemplate(guard.tenantId, id, payload);
    return NextResponse.json({ template });
  } catch (error) {
    console.error("Admin attendance schedule template update error:", error);
    const message = error instanceof Error ? error.message : "Failed to update template";
    const status = message.includes("must") ? 400 : message.includes("No rows") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
