import { NextRequest, NextResponse } from "next/server";
import {
  isAllowedBillplzCollection,
  normalizeBillplzPayload,
  verifyBillplzSignature,
} from "@/lib/payments/billplzClient";
import { resolveBillplzConfigForTenant } from "@/lib/payments/gatewayConfig";
import {
  getPaymentByBillplzId,
  hasProcessedWebhookEvent,
  processBillplzWebhookAtomically,
  recordPaymentEvent,
  updatePayment,
} from "@/lib/payments/paymentsService";
import {
  canTransitionPaymentStatus,
  PayloadTooLargeError,
  createBillplzProviderEventId,
  createWebhookFingerprint,
  expectedPaymentAmountCents,
  isFormUrlEncodedContentType,
  parseAmountCents,
  readRequestBodyTextWithLimit,
  resolveBillplzStatus,
} from "@/lib/payments/paymentSecurity";
import { enforceRateLimit, getClientIp } from "@/lib/rateLimit";
import { logPaymentError } from "@/lib/payments/paymentLogging";

const MAX_WEBHOOK_PAYLOAD_BYTES = 64 * 1024;

function parseFormEncoded(body: string) {
  const params = new URLSearchParams(body);
  const out: Record<string, string> = {};
  params.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const limit = await enforceRateLimit({
      key: `payments:webhook:${ip}`,
      limit: 180,
      windowMs: 60 * 1000,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many webhook requests" },
        {
          status: 429,
          headers: {
            "Retry-After": String(limit.retryAfterSeconds),
          },
        }
      );
    }

    if (!isFormUrlEncodedContentType(request)) {
      return NextResponse.json({ error: "Unsupported content type." }, { status: 415 });
    }

    const rawBody = await readRequestBodyTextWithLimit(request, MAX_WEBHOOK_PAYLOAD_BYTES);
    const parsed = parseFormEncoded(rawBody);
    const payload = normalizeBillplzPayload(parsed);
    const webhookFingerprint = createWebhookFingerprint(payload);

    if (!payload.id) {
      return NextResponse.json({ error: "Missing bill ID" }, { status: 400 });
    }

    const payment = await getPaymentByBillplzId(payload.id);
    if (!payment) {
      return NextResponse.json({ ok: true, ignored: true });
    }
    if (!payment.tenant_id) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const gatewayConfig = await resolveBillplzConfigForTenant(payment.tenant_id);

    if (!verifyBillplzSignature(payload, gatewayConfig)) {
      await recordPaymentEvent(payment.id, "billplz", "webhook_rejected_invalid_signature", {
        billId: payload.id,
        fingerprint: webhookFingerprint,
      }, {
        tenantId: payment.tenant_id,
        providerId: gatewayConfig.providerId,
        providerEventId: createBillplzProviderEventId(payload.id, webhookFingerprint),
        providerEventFingerprint: webhookFingerprint,
      });
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    if (!isAllowedBillplzCollection(payload.collection_id, gatewayConfig)) {
      await recordPaymentEvent(payment.id, "billplz", "webhook_rejected_collection_mismatch", {
        billId: payload.id,
        collectionId: payload.collection_id ?? null,
        allowedCollectionIds: gatewayConfig.allowedCollectionIds,
        fingerprint: webhookFingerprint,
      }, {
        tenantId: payment.tenant_id,
        providerId: gatewayConfig.providerId,
        providerEventId: createBillplzProviderEventId(payload.id, webhookFingerprint),
        providerEventFingerprint: webhookFingerprint,
      });
      return NextResponse.json({ error: "Invalid collection ID" }, { status: 400 });
    }

    const receivedAmountCents = parseAmountCents(payload.amount);
    if (receivedAmountCents === null) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    const providerEventId = createBillplzProviderEventId(payload.id, webhookFingerprint);
    const paid = payload.paid === "true" || payload.paid === "1";

    const atomicResult = await processBillplzWebhookAtomically({
      tenantId: payment.tenant_id,
      billplzId: payload.id,
      providerEventId,
      webhookFingerprint,
      receivedAmountCents,
      paid,
      state: payload.state,
      dueAt: payload.due_at ?? null,
      paidAt: payload.paid_at ?? null,
      payload: {
        billId: payload.id,
        paid: payload.paid,
        state: payload.state,
        amount: payload.amount,
        paidAt: payload.paid_at ?? null,
        dueAt: payload.due_at ?? null,
        collectionId: payload.collection_id ?? null,
      },
    });

    if (atomicResult) {
      if (atomicResult.outcome === "replay") return NextResponse.json({ ok: true, replay: true });
      if (atomicResult.outcome === "ignored") return NextResponse.json({ ok: true, ignored: true });
      if (atomicResult.outcome === "not_found") return NextResponse.json({ ok: true, ignored: true });
      if (atomicResult.outcome === "rejected") {
        return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    const alreadyProcessed = await hasProcessedWebhookEvent(payment.id, webhookFingerprint);
    if (alreadyProcessed) {
      return NextResponse.json({ ok: true, replay: true });
    }

    const expectedAmount = expectedPaymentAmountCents(
      payment.total_amount_cents ?? 0,
      payment.merchant_fee_cents ?? 0
    );
    if (receivedAmountCents !== expectedAmount) {
      await recordPaymentEvent(payment.id, "billplz", "webhook_rejected_amount_mismatch", {
        billId: payload.id,
        expectedAmountCents: expectedAmount,
        receivedAmountCents,
        fingerprint: webhookFingerprint,
      }, {
        tenantId: payment.tenant_id ?? undefined,
        providerId: gatewayConfig.providerId,
        providerEventId,
        providerEventFingerprint: webhookFingerprint,
      });
      return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
    }

    const nextStatus = resolveBillplzStatus(paid, payload.state);
    const currentStatus = payment.status;

    if (!canTransitionPaymentStatus(currentStatus, nextStatus)) {
      await recordPaymentEvent(payment.id, "billplz", "webhook_ignored_invalid_transition", {
        fromStatus: currentStatus,
        toStatus: nextStatus,
        billId: payload.id,
        fingerprint: webhookFingerprint,
      }, {
        tenantId: payment.tenant_id ?? undefined,
        providerId: gatewayConfig.providerId,
        providerEventId,
        providerEventFingerprint: webhookFingerprint,
      });
      return NextResponse.json({ ok: true, ignored: true });
    }

    const resolvedPaidAt =
      nextStatus === "paid"
        ? payment.paid_at ?? payload.paid_at ?? new Date().toISOString()
        : payment.paid_at ?? null;
    const shouldUpdate =
      currentStatus !== nextStatus ||
      (nextStatus === "paid" && !payment.paid_at && Boolean(resolvedPaidAt)) ||
      (payload.due_at && payment.expires_at !== payload.due_at);

    if (shouldUpdate) {
      await updatePayment(payment.id, {
        status: nextStatus,
        paidAt: resolvedPaidAt,
        expiresAt: payload.due_at ?? payment.expires_at ?? null,
      });
    }

    await recordPaymentEvent(payment.id, "billplz", "webhook_processed", {
      billId: payload.id,
      currentStatus,
      nextStatus,
      receivedAmountCents,
      paid: payload.paid,
      state: payload.state,
      paidAt: payload.paid_at ?? null,
      dueAt: payload.due_at ?? null,
      x_signature: payload.x_signature ?? null,
      fingerprint: webhookFingerprint,
    }, {
      tenantId: payment.tenant_id ?? undefined,
      providerId: gatewayConfig.providerId,
      providerEventId,
      providerEventFingerprint: webhookFingerprint,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: "Payload too large." }, { status: 413 });
    }
    logPaymentError("billplz-webhook", error);
    return NextResponse.json({ error: "Unable to process payment webhook." }, { status: 500 });
  }
}
