import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";
import { supabaseService } from "@/lib/supabaseServiceClient";
import { fillPackageSlots } from "@/lib/online/scheduling";

type FillBody = {
  package_id?: string;
  slots?: Array<{ day_of_week: number; start_time: string }>;
};

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedTenantUser(request);
  if (!auth.ok) return auth.response;

  try {
    const { data: roleRow, error: roleError } = await supabaseService
      .from("users")
      .select("role")
      .eq("id", auth.userId)
      .maybeSingle();
    if (roleError) throw roleError;
    if (roleRow?.role !== "teacher") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as FillBody;
    const packageId = (body.package_id ?? "").trim();
    if (!packageId) {
      return NextResponse.json({ error: "package_id is required." }, { status: 400 });
    }
    if (!Array.isArray(body.slots) || body.slots.length === 0) {
      return NextResponse.json({ error: "At least one slot is required." }, { status: 400 });
    }

    const result = await fillPackageSlots(supabaseService, {
      tenantId: auth.tenantId,
      teacherId: auth.userId,
      packageId,
      slots: body.slots,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Teacher fill package slots error:", error);
    const message = error instanceof Error ? error.message : "Failed to fill package slots";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
