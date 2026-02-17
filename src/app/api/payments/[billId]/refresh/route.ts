import { NextRequest, NextResponse } from "next/server";
import {
  fetchBillplzBillWithConfig,
  isAllowedBillplzCollection,
} from "@/lib/payments/billplzClient";
import { resolveBillplzConfigForTenant } from "@/lib/payments/gatewayConfig";
import {
  getPaymentByBillplzId,
  recordPaymentEvent,
  updatePayment,
} from "@/lib/payments/paymentsService";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";
import {
  canTransitionPaymentStatus,
  expectedPaymentAmountCents,
  isPaymentOwnedByTenantParent,
  resolveBillplzStatus,
} from "@/lib/payments/paymentSecurity";
import { enforceRateLimit, getClientIp } from "@/lib/rateLimit";
import { logPaymentError } from "@/lib/payments/paymentLogging";

type RefreshRouteContext = {
  params: Promise<{ billId: string }>;
};

export async function GET(request: NextRequest, context: RefreshRouteContext) {
  try {
    const auth = await requireAuthenticatedTenantUser(request);
    if (!auth.ok) return auth.response;

    const ip = getClientIp(request);
    const limit = await enforceRateLimit({
      key: `payments:refresh:${auth.tenantId}:${auth.userId}:${ip}`,
      limit: 40,
      windowMs: 60 * 1000,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many status refresh attempts. Please retry shortly." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    const { billId } = await context.params;
    if (!billId || typeof billId !== "string") {
      return NextResponse.json({ error: "Invalid bill ID" }, { status: 400 });
    }

    const payment = await getPaymentByBillplzId(billId);
    if (!payment || !isPaymentOwnedByTenantParent(payment, auth.tenantId, auth.userId)) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const gatewayConfig = await resolveBillplzConfigForTenant(auth.tenantId);
    const bill = await fetchBillplzBillWithConfig(billId, gatewayConfig);
    const expectedAmountCents = expectedPaymentAmountCents(
      payment.total_amount_cents ?? 0,
      payment.merchant_fee_cents ?? 0
    );
    if (bill.amount !== expectedAmountCents) {
      await recordPaymentEvent(payment.id, "app", "billplz_refresh_amount_mismatch", {
        billId,
        expectedAmountCents,
        receivedAmountCents: bill.amount,
      }, { tenantId: auth.tenantId });
      return NextResponse.json({ error: "Bill amount mismatch" }, { status: 502 });
    }

    if (!isAllowedBillplzCollection(bill.collection_id, gatewayConfig)) {
      await recordPaymentEvent(payment.id, "app", "billplz_refresh_collection_mismatch", {
        billId,
        expectedCollectionIds: gatewayConfig.allowedCollectionIds,
        receivedCollectionId: bill.collection_id,
      }, { tenantId: auth.tenantId });
      return NextResponse.json({ error: "Bill collection mismatch" }, { status: 502 });
    }

    const nextStatus = resolveBillplzStatus(Boolean(bill.paid), bill.state);
    const currentStatus = payment.status;
    if (!canTransitionPaymentStatus(currentStatus, nextStatus)) {
      await recordPaymentEvent(payment.id, "app", "billplz_refresh_ignored_invalid_transition", {
        billId,
        fromStatus: currentStatus,
        toStatus: nextStatus,
      }, { tenantId: auth.tenantId });
      return NextResponse.json({ payment, bill, ignored: true });
    }

    const updated = await updatePayment(payment.id, {
      status: nextStatus,
      paidAt: bill.paid ? payment.paid_at ?? bill.paid_at ?? new Date().toISOString() : payment.paid_at ?? null,
      expiresAt: bill.due_at ?? payment.expires_at ?? null,
    });

    await recordPaymentEvent(payment.id, "app", "billplz_refresh", {
      billId,
      currentStatus,
      nextStatus,
      amountCents: bill.amount,
      dueAt: bill.due_at ?? null,
      paidAt: bill.paid_at ?? null,
    }, { tenantId: auth.tenantId });

    return NextResponse.json({ payment: updated, bill });
  } catch (error: unknown) {
    logPaymentError("payment-refresh", error);
    return NextResponse.json({ error: "Unable to refresh payment status." }, { status: 500 });
  }
}
