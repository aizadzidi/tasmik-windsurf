import { supabaseService } from "@/lib/supabaseServiceClient";
import { recordPaymentEvent } from "@/lib/payments/paymentsService";
import type { PaymentLineItem, PaymentRecord } from "@/types/payments";

type PaymentWithLines = PaymentRecord & {
  line_items?: PaymentLineItem[] | null;
};

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function activateOnlinePackage(payment: PaymentWithLines, metadata: Record<string, unknown>) {
  const packageId = stringValue(metadata.packageId);
  const assignmentId = stringValue(metadata.assignmentId);
  if (!packageId || !payment.tenant_id) return;

  const activationRes = await supabaseService.rpc("activate_paid_online_package_atomic", {
    p_tenant_id: payment.tenant_id,
    p_package_id: packageId,
    p_assignment_id: assignmentId,
  });
  if (activationRes.error) throw activationRes.error;

  const activation = Array.isArray(activationRes.data)
    ? activationRes.data[0]
    : activationRes.data;
  if (!activation?.ok) {
    const code = typeof activation?.code === "string" ? activation.code : "unknown";
    const eventType =
      code === "missing_package"
        ? "online_package_activation_missing_package"
        : code === "hold_expired"
          ? "online_package_activation_blocked_hold_expired"
          : "online_package_activation_ignored_status";
    await recordPaymentEvent(
      payment.id,
      "app",
      eventType,
      { packageId, assignmentId, code },
      { tenantId: payment.tenant_id, providerId: payment.provider_id ?? null }
    );
    return;
  }

  if (activation.code === "already_active") return;

  await recordPaymentEvent(
    payment.id,
    "app",
    "online_package_activated",
    { packageId, assignmentId: activation.assignment_id ?? assignmentId ?? null },
    { tenantId: payment.tenant_id, providerId: payment.provider_id ?? null }
  );
}

async function scheduleOnlinePackageChange(payment: PaymentWithLines, metadata: Record<string, unknown>) {
  const packageChangeRequestId = stringValue(metadata.packageChangeRequestId);
  if (!packageChangeRequestId || !payment.tenant_id) return;

  const updateRes = await supabaseService
    .from("online_package_change_requests")
    .update({
      billing_status: "paid",
      status: "scheduled",
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", payment.tenant_id)
    .eq("id", packageChangeRequestId)
    .eq("status", "pending_payment")
    .eq("billing_status", "pending_payment")
    .select("id,status,billing_status")
    .maybeSingle();
  if (updateRes.error) throw updateRes.error;

  if (updateRes.data?.id) {
    await recordPaymentEvent(
      payment.id,
      "app",
      "online_package_change_scheduled",
      { packageChangeRequestId },
      { tenantId: payment.tenant_id, providerId: payment.provider_id ?? null }
    );
  }
}

export async function applyPaidPaymentSideEffects(payment: PaymentWithLines | null | undefined) {
  if (!payment || payment.status !== "paid") return;

  for (const line of payment.line_items ?? []) {
    const metadata = metadataRecord(line.metadata);
    if (metadata.paymentContext !== "online") continue;

    if (metadata.source === "online_package") {
      await activateOnlinePackage(payment, metadata);
    } else if (metadata.source === "online_package_change") {
      await scheduleOnlinePackageChange(payment, metadata);
    }
  }
}
