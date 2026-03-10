import { NextRequest, NextResponse } from "next/server";
import { isMissingRelationError } from "@/lib/online/db";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";
import { supabaseService } from "@/lib/supabaseServiceClient";

type PayBody = {
  package_id?: string;
  package_change_request_id?: string;
  payment_reference?: string | null;
};

const PAYABLE_PACKAGE_STATUS = "pending_payment";
const PAYABLE_CHANGE_STATUS = "pending_payment";
const PAYABLE_CHANGE_BILLING_STATUS = "pending_payment";

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedTenantUser(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as PayBody;
    const packageId = (body.package_id ?? "").trim();
    const packageChangeRequestId = (body.package_change_request_id ?? "").trim();
    if (!packageId && !packageChangeRequestId) {
      return NextResponse.json(
        { error: "package_id or package_change_request_id is required" },
        { status: 400 },
      );
    }

    if (packageChangeRequestId) {
      const changeRes = await supabaseService
        .from("online_package_change_requests")
        .select("id, student_id, next_package_id_draft, billing_status, status")
        .eq("tenant_id", auth.tenantId)
        .eq("id", packageChangeRequestId)
        .maybeSingle();
      if (changeRes.error) throw changeRes.error;
      if (!changeRes.data?.id) {
        return NextResponse.json({ error: "Package change request not found." }, { status: 404 });
      }

      const studentRes = await supabaseService
        .from("students")
        .select("id")
        .eq("tenant_id", auth.tenantId)
        .eq("id", changeRes.data.student_id)
        .eq("parent_id", auth.userId)
        .maybeSingle();
      if (studentRes.error) throw studentRes.error;
      if (!studentRes.data?.id) {
        return NextResponse.json({ error: "Package change request not found for this parent." }, { status: 404 });
      }
      if (
        changeRes.data.status !== PAYABLE_CHANGE_STATUS ||
        changeRes.data.billing_status !== PAYABLE_CHANGE_BILLING_STATUS
      ) {
        return NextResponse.json(
          { error: "Package change request is not awaiting payment." },
          { status: 409 },
        );
      }

      const updateChangeRes = await supabaseService
        .from("online_package_change_requests")
        .update({
          billing_status: "paid",
          status: "scheduled",
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", auth.tenantId)
        .eq("id", packageChangeRequestId)
        .eq("status", PAYABLE_CHANGE_STATUS)
        .eq("billing_status", PAYABLE_CHANGE_BILLING_STATUS)
        .select("*")
        .maybeSingle();
      if (updateChangeRes.error) throw updateChangeRes.error;
      if (!updateChangeRes.data?.id) {
        return NextResponse.json(
          { error: "Package change request is no longer payable." },
          { status: 409 },
        );
      }

      return NextResponse.json({
        ok: true,
        code: "scheduled",
        message: "Next-month package change has been paid and scheduled.",
        package_change_request: updateChangeRes.data,
      });
    }

    const packageRes = await supabaseService
      .from("online_recurring_packages")
      .select("id, student_id, status, hold_expires_at")
      .eq("tenant_id", auth.tenantId)
      .eq("id", packageId)
      .maybeSingle();
    if (packageRes.error) throw packageRes.error;
    if (!packageRes.data?.id) {
      return NextResponse.json({ error: "Package not found." }, { status: 404 });
    }

    const studentRes = await supabaseService
      .from("students")
      .select("id")
      .eq("tenant_id", auth.tenantId)
      .eq("id", packageRes.data.student_id)
      .eq("parent_id", auth.userId)
      .maybeSingle();
    if (studentRes.error) throw studentRes.error;
    if (!studentRes.data?.id) {
      return NextResponse.json({ error: "Package not found for this parent." }, { status: 404 });
    }
    if (packageRes.data.status !== PAYABLE_PACKAGE_STATUS) {
      return NextResponse.json(
        { error: "Package is not awaiting payment." },
        { status: 409 },
      );
    }

    if (
      packageRes.data.hold_expires_at &&
      new Date(packageRes.data.hold_expires_at).getTime() <= Date.now()
    ) {
      return NextResponse.json({ error: "Package hold expired." }, { status: 409 });
    }

    const updatePackageRes = await supabaseService
      .from("online_recurring_packages")
      .update({
        status: "active",
        hold_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", auth.tenantId)
      .eq("id", packageId)
      .eq("status", PAYABLE_PACKAGE_STATUS)
      .select("*")
      .maybeSingle();
    if (updatePackageRes.error) throw updatePackageRes.error;
    if (!updatePackageRes.data?.id) {
      return NextResponse.json(
        { error: "Package is no longer payable." },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      code: "activated",
      message: "Recurring package payment confirmed.",
      package: updatePackageRes.data,
    });
  } catch (error: unknown) {
    console.error("Parent online package payment confirm error:", error);
    if (
      isMissingRelationError(error as { message?: string }, "online_recurring_packages") ||
      isMissingRelationError(error as { message?: string }, "online_package_change_requests")
    ) {
      return NextResponse.json(
        { error: "Online package payment flow is not configured yet. Please contact support." },
        { status: 503 },
      );
    }
    const message = error instanceof Error ? error.message : "Failed to confirm package payment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
