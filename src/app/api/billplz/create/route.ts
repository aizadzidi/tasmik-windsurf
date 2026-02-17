import { NextRequest, NextResponse } from "next/server";
import {
  createBillplzBillWithConfig,
  isAllowedBillplzCollection,
} from "@/lib/payments/billplzClient";
import { resolveBillplzConfigForTenant } from "@/lib/payments/gatewayConfig";
import { buildPaymentPreview, calculateSubtotal, MERCHANT_FEE_CENTS } from "@/lib/payments/pricingUtils";
import {
  PaymentIdempotencyConflictError,
  createPaymentRecord,
  findRecentPendingPaymentByIdempotencyKey,
  recordPaymentEvent,
  updatePayment,
} from "@/lib/payments/paymentsService";
import type { FeeMetadata, PaymentCartItem, PaymentRecord } from "@/types/payments";
import { supabaseService } from "@/lib/supabaseServiceClient";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";
import {
  PayloadTooLargeError,
  isJsonContentType,
  createCheckoutFingerprint,
  isValidMonthKey,
  isValidPaymentEmail,
  normalizeMonthKeys,
  readRequestBodyTextWithLimit,
  resolveSafeRedirectUrl,
  sanitizePhoneNumber,
} from "@/lib/payments/paymentSecurity";
import { enforceRateLimit, getClientIp } from "@/lib/rateLimit";
import { logPaymentError } from "@/lib/payments/paymentLogging";

const appBaseUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const callbackUrl =
  process.env.BILLPLZ_CALLBACK_URL ?? `${appBaseUrl.replace(/\/$/, "")}/api/billplz/webhook`;

const MAX_ITEMS_PER_CHECKOUT = 40;
const MAX_NON_MONTHLY_QUANTITY = 24;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:_-]{12,120}$/;
const MAX_CREATE_PAYLOAD_BYTES = 128 * 1024;

type PaymentCartItemInput = {
  childId: string;
  feeId: string;
  months?: string[];
  quantity?: number;
};

type CreateBillplzRequestBody = {
  parentId?: string;
  payer?: {
    name?: string;
    email?: string;
    mobile?: string;
  };
  items: PaymentCartItemInput[];
  redirectUrl?: string;
  description?: string;
  idempotencyKey?: string;
};

type DbChildRow = {
  id: string;
  name: string | null;
  parent_id: string | null;
  record_type: string | null;
  tenant_id: string | null;
};

type DbAssignmentRow = {
  id: string;
  child_id: string;
  fee_id: string;
  custom_amount_cents: number | null;
  effective_months: string[] | null;
  tenant_id: string | null;
};

type DbFeeRow = {
  id: string;
  name: string;
  billing_cycle: "monthly" | "yearly" | "one_time" | "ad_hoc";
  amount_cents: number;
  metadata: FeeMetadata | null;
  tenant_id: string | null;
};

function isPaymentCartItemInput(item: unknown): item is PaymentCartItemInput {
  if (!item || typeof item !== "object") return false;
  const candidate = item as Record<string, unknown>;
  if (typeof candidate.childId !== "string" || typeof candidate.feeId !== "string") {
    return false;
  }

  if ("months" in candidate && candidate.months !== undefined) {
    if (!Array.isArray(candidate.months) || !candidate.months.every((month) => typeof month === "string")) {
      return false;
    }
  }

  if ("quantity" in candidate && candidate.quantity !== undefined && typeof candidate.quantity !== "number") {
    return false;
  }

  return true;
}

function isCreateBillplzRequestBody(body: unknown): body is CreateBillplzRequestBody {
  if (!body || typeof body !== "object") return false;
  const candidate = body as Record<string, unknown>;

  if (!Array.isArray(candidate.items) || !candidate.items.every(isPaymentCartItemInput)) {
    return false;
  }

  if ("parentId" in candidate && candidate.parentId !== undefined && typeof candidate.parentId !== "string") {
    return false;
  }

  if ("redirectUrl" in candidate && candidate.redirectUrl !== undefined && typeof candidate.redirectUrl !== "string") {
    return false;
  }

  if ("description" in candidate && candidate.description !== undefined && typeof candidate.description !== "string") {
    return false;
  }

  if (
    "idempotencyKey" in candidate &&
    candidate.idempotencyKey !== undefined &&
    typeof candidate.idempotencyKey !== "string"
  ) {
    return false;
  }

  if ("payer" in candidate && candidate.payer !== undefined) {
    if (!candidate.payer || typeof candidate.payer !== "object") return false;
  }

  return true;
}

function getCustomAmountForParent(metadata: FeeMetadata | null | undefined, parentUserId: string): number | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const raw = metadata.customAmounts;
  if (!Array.isArray(raw)) return null;

  const match = raw.find((entry) => {
    if (!entry || typeof entry !== "object") return false;
    return "userId" in entry && (entry as { userId?: unknown }).userId === parentUserId;
  }) as { amountCents?: unknown } | undefined;

  if (!match) return null;
  const amount = Number(match.amountCents);
  return Number.isFinite(amount) ? Math.trunc(amount) : null;
}

function sanitizePayerName(input: string | null | undefined, fallback: string): string {
  const value = (input ?? "").trim();
  if (!value) return fallback;
  return value.slice(0, 80);
}

function resolveNonMonthlyQuantity(input: number | undefined): number {
  if (typeof input !== "number" || !Number.isFinite(input)) return 1;
  const rounded = Math.trunc(input);
  if (rounded < 1) return 1;
  return Math.min(rounded, MAX_NON_MONTHLY_QUANTITY);
}

function buildDescription(items: PaymentCartItem[], payableMonths: string[], customDescription?: string): string {
  const cleaned = (customDescription ?? "").trim();
  if (cleaned.length > 0) {
    return cleaned.slice(0, 120);
  }

  const childrenSummary = Array.from(new Set(items.map((item) => item.childName))).join(", ");
  return `Yuran ${payableMonths.length ? payableMonths.join(", ") : "semasa"} (${childrenSummary})`;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedTenantUser(request);
    if (!auth.ok) return auth.response;

    const ip = getClientIp(request);
    const limit = await enforceRateLimit({
      key: `payments:create:${auth.tenantId}:${auth.userId}:${ip}`,
      limit: 15,
      windowMs: 60 * 1000,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many checkout attempts. Please retry shortly." },
        {
          status: 429,
          headers: {
            "Retry-After": String(limit.retryAfterSeconds),
            "X-RateLimit-Remaining": String(limit.remaining),
          },
        }
      );
    }

    if (!isJsonContentType(request)) {
      return NextResponse.json({ error: "Unsupported content type." }, { status: 415 });
    }

    const rawBody = await readRequestBodyTextWithLimit(request, MAX_CREATE_PAYLOAD_BYTES);
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!isCreateBillplzRequestBody(body)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (body.parentId && body.parentId !== auth.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!body.items.length) {
      return NextResponse.json({ error: "At least one line item is required" }, { status: 400 });
    }
    if (body.items.length > MAX_ITEMS_PER_CHECKOUT) {
      return NextResponse.json({ error: "Too many line items in one checkout." }, { status: 400 });
    }

    const idempotencyKey = (body.idempotencyKey ?? "").trim();
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      return NextResponse.json(
        { error: "Invalid idempotency key. Retry from the checkout screen." },
        { status: 400 }
      );
    }

    const existing = await findRecentPendingPaymentByIdempotencyKey(
      auth.tenantId,
      auth.userId,
      idempotencyKey,
      45
    );
    if (existing) {
      if (existing.redirect_url && existing.billplz_id) {
        return NextResponse.json({
          paymentId: existing.id,
          billId: existing.billplz_id,
          billUrl: existing.redirect_url,
          due_at: existing.expires_at ?? null,
          reused: true,
        });
      }
      return NextResponse.json(
        { error: "Checkout request is still being processed. Please retry shortly." },
        { status: 409 }
      );
    }

    const requestedItems = body.items.map((item) => ({
      childId: item.childId.trim(),
      feeId: item.feeId.trim(),
      months: normalizeMonthKeys(item.months ?? []),
      quantity: item.quantity,
    }));

    const duplicates = new Set<string>();
    const seen = new Set<string>();
    requestedItems.forEach((item) => {
      const key = `${item.childId}:${item.feeId}`;
      if (seen.has(key)) duplicates.add(key);
      seen.add(key);
    });
    if (duplicates.size > 0) {
      return NextResponse.json({ error: "Duplicate fee line detected in checkout." }, { status: 400 });
    }

    const childIds = Array.from(new Set(requestedItems.map((item) => item.childId)));
    const feeIds = Array.from(new Set(requestedItems.map((item) => item.feeId)));

    const [{ data: childRows, error: childError }, { data: assignmentRows, error: assignmentError }, { data: feeRows, error: feeError }] =
      await Promise.all([
        supabaseService
          .from("students")
          .select("id, name, parent_id, record_type, tenant_id")
          .eq("tenant_id", auth.tenantId)
          .in("id", childIds)
          .eq("parent_id", auth.userId)
          .neq("record_type", "prospect"),
        supabaseService
          .from("child_fee_assignments")
          .select("id, child_id, fee_id, custom_amount_cents, effective_months, tenant_id")
          .eq("tenant_id", auth.tenantId)
          .in("child_id", childIds)
          .eq("is_active", true),
        supabaseService
          .from("payment_fee_catalog")
          .select("id, name, billing_cycle, amount_cents, metadata, tenant_id")
          .eq("tenant_id", auth.tenantId)
          .in("id", feeIds)
          .eq("is_active", true),
      ]);

    if (childError) throw childError;
    if (assignmentError) throw assignmentError;
    if (feeError) throw feeError;

    const children = (childRows ?? []) as DbChildRow[];
    if (children.length !== childIds.length) {
      return NextResponse.json({ error: "Some selected children are not available for this parent." }, { status: 403 });
    }

    const assignments = ((assignmentRows ?? []) as DbAssignmentRow[]).filter((row) => row.tenant_id === auth.tenantId);
    const fees = ((feeRows ?? []) as DbFeeRow[]).filter((row) => row.tenant_id === auth.tenantId);

    const childById = new Map(children.map((row) => [row.id, row]));
    const feeById = new Map(fees.map((row) => [row.id, row]));
    const assignmentByKey = new Map(assignments.map((row) => [`${row.child_id}:${row.fee_id}`, row]));
    const activeAssignmentChildIds = new Set(assignments.map((row) => row.child_id));

    const normalizedItems: PaymentCartItem[] = [];
    for (const item of requestedItems) {
      if (!item.childId || !item.feeId) {
        return NextResponse.json({ error: "Invalid child or fee reference." }, { status: 400 });
      }

      const child = childById.get(item.childId);
      if (!child) {
        return NextResponse.json({ error: "Child not found for this parent." }, { status: 403 });
      }

      const fee = feeById.get(item.feeId);
      if (!fee) {
        return NextResponse.json({ error: "Fee is no longer active." }, { status: 400 });
      }
      const assignmentKey = `${item.childId}:${item.feeId}`;
      const assignment = assignmentByKey.get(assignmentKey);
      const childHasActiveAssignments = activeAssignmentChildIds.has(item.childId);
      if (!assignment && childHasActiveAssignments) {
        return NextResponse.json({ error: "Fee assignment is not active for selected child." }, { status: 400 });
      }
      const effectiveMonthsSource = assignment?.effective_months;
      const assignmentCustomAmount = assignment?.custom_amount_cents;

      let quantity = 1;
      let months: string[] = [];

      if (fee.billing_cycle === "monthly") {
        months = normalizeMonthKeys(item.months ?? []);
        if (!months.length) {
          return NextResponse.json(
            { error: "Set at least one month for each monthly fee before paying." },
            { status: 400 }
          );
        }
        if (months.some((month) => !isValidMonthKey(month))) {
          return NextResponse.json({ error: "Invalid month format. Use YYYY-MM." }, { status: 400 });
        }

        const effectiveMonths = normalizeMonthKeys(
          Array.isArray(effectiveMonthsSource)
            ? effectiveMonthsSource.filter((month): month is string => typeof month === "string")
            : []
        );
        if (effectiveMonths.length > 0 && months.some((month) => !effectiveMonths.includes(month))) {
          return NextResponse.json(
            { error: "One or more months are outside the allowed billing schedule." },
            { status: 400 }
          );
        }
        quantity = months.length;
      } else {
        if ((item.months ?? []).length > 0) {
          return NextResponse.json(
            { error: "Non-monthly fees cannot include month selections." },
            { status: 400 }
          );
        }
        quantity = resolveNonMonthlyQuantity(item.quantity);
      }

      const fallbackAmount = Math.max(0, Math.trunc(fee.amount_cents ?? 0));
      const amountFromFeeMetadata = getCustomAmountForParent(fee.metadata, auth.userId);
      const unitAmountCents = Math.max(
        0,
        Math.trunc(assignmentCustomAmount ?? amountFromFeeMetadata ?? fallbackAmount)
      );

      normalizedItems.push({
        childId: child.id,
        childName: child.name?.trim() || "Child",
        feeId: fee.id,
        feeName: fee.name?.trim() || "Fee",
        months,
        quantity,
        unitAmountCents,
        subtotalCents: calculateSubtotal(unitAmountCents, quantity),
      });
    }

    const preview = buildPaymentPreview(normalizedItems, MERCHANT_FEE_CENTS);
    const checkoutFingerprint = createCheckoutFingerprint(
      normalizedItems.map((item) => ({
        childId: item.childId,
        feeId: item.feeId,
        quantity: item.quantity,
        unitAmountCents: item.unitAmountCents,
        months: item.months,
      })),
      preview.merchantFeeCents
    );

    const defaultName = (body.payer?.name ?? "").trim() || "Parent";
    const payerName = sanitizePayerName(body.payer?.name, defaultName);
    const payerEmail = (body.payer?.email ?? auth.email ?? "").trim().toLowerCase();
    if (!isValidPaymentEmail(payerEmail)) {
      return NextResponse.json({ error: "Valid payer email is required." }, { status: 400 });
    }

    const payerMobile = sanitizePhoneNumber(body.payer?.mobile ?? "");
    if (payerMobile.length < 8 || payerMobile.length > 16) {
      return NextResponse.json({ error: "Valid payer mobile number is required." }, { status: 400 });
    }

    const gatewayConfig = await resolveBillplzConfigForTenant(auth.tenantId);

    let payment: PaymentRecord;
    try {
      payment = await createPaymentRecord({
        tenantId: auth.tenantId,
        providerId: gatewayConfig.providerId,
        parentId: auth.userId,
        items: normalizedItems,
        totalCents: preview.totalCents,
        merchantFeeCents: preview.merchantFeeCents,
        payableMonths: preview.payableMonths,
        idempotencyKey,
        status: "initiated",
      });
    } catch (error) {
      if (error instanceof PaymentIdempotencyConflictError) {
        const existingConflict = await findRecentPendingPaymentByIdempotencyKey(
          auth.tenantId,
          auth.userId,
          idempotencyKey,
          45
        );
        if (existingConflict?.redirect_url && existingConflict.billplz_id) {
          return NextResponse.json({
            paymentId: existingConflict.id,
            billId: existingConflict.billplz_id,
            billUrl: existingConflict.redirect_url,
            due_at: existingConflict.expires_at ?? null,
            reused: true,
          });
        }
        return NextResponse.json(
          { error: "Checkout request is still being processed. Please retry shortly." },
          { status: 409 }
        );
      }
      throw error;
    }

    const redirect = resolveSafeRedirectUrl(
      body.redirectUrl,
      appBaseUrl,
      `/parent/payments?paymentId=${encodeURIComponent(payment.id)}`
    );
    const description = buildDescription(normalizedItems, preview.payableMonths, body.description);
    const amountCents = preview.totalCents + preview.merchantFeeCents;

    let bill;
    try {
      bill = await createBillplzBillWithConfig({
        name: payerName,
        email: payerEmail,
        mobile: payerMobile,
        amountCents,
        description,
        callbackUrl,
        redirectUrl: redirect,
        reference1: payment.id,
        reference2: preview.payableMonths[0] ?? undefined,
      }, gatewayConfig);
    } catch (error) {
      await updatePayment(payment.id, { status: "failed" });
      await recordPaymentEvent(payment.id, "app", "billplz_bill_create_failed", {
        idempotencyKey,
        checkoutFingerprint,
        message: "Bill creation failed",
      }, { tenantId: auth.tenantId });
      throw error;
    }

    if (typeof bill.amount === "number" && Math.trunc(bill.amount) !== amountCents) {
      await updatePayment(payment.id, { status: "failed" });
      await recordPaymentEvent(payment.id, "app", "billplz_bill_amount_mismatch", {
        idempotencyKey,
        expectedAmountCents: amountCents,
        billAmountCents: bill.amount,
      }, { tenantId: auth.tenantId });
      return NextResponse.json({ error: "Bill amount mismatch. Please try again." }, { status: 502 });
    }

    if (bill.collection_id && !isAllowedBillplzCollection(bill.collection_id, gatewayConfig)) {
      await updatePayment(payment.id, { status: "failed" });
      await recordPaymentEvent(payment.id, "app", "billplz_collection_mismatch", {
        idempotencyKey,
        expectedCollectionIds: gatewayConfig.allowedCollectionIds,
        receivedCollectionId: bill.collection_id,
      }, { tenantId: auth.tenantId });
      return NextResponse.json({ error: "Bill collection mismatch. Please contact support." }, { status: 502 });
    }

    const updated = await updatePayment(payment.id, {
      billplzId: bill.id,
      status: "pending",
      redirectUrl: bill.url,
      expiresAt: bill.due_at ?? null,
    });

    await recordPaymentEvent(payment.id, "app", "billplz_bill_created", {
      idempotencyKey,
      checkoutFingerprint,
      expectedAmountCents: amountCents,
      payment: {
        id: updated.id,
        status: updated.status,
      },
      bill: {
        id: bill.id,
        amount: bill.amount,
        due_at: bill.due_at ?? null,
        collection_id: bill.collection_id ?? null,
      },
    }, { tenantId: auth.tenantId });

    return NextResponse.json({
      paymentId: payment.id,
      billId: bill.id,
      billUrl: bill.url,
      due_at: bill.due_at ?? null,
      reused: false,
    });
  } catch (error: unknown) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: "Payload too large." }, { status: 413 });
    }

    logPaymentError("billplz-create", error);
    return NextResponse.json({ error: "Unable to create payment checkout." }, { status: 500 });
  }
}
