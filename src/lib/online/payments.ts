import { NextRequest, NextResponse } from "next/server";
import {
  createBillplzBillWithConfig,
  isAllowedBillplzCollection,
} from "@/lib/payments/billplzClient";
import { resolveBillplzConfigForTenant } from "@/lib/payments/gatewayConfig";
import {
  PaymentIdempotencyConflictError,
  createPaymentRecord,
  findRecentPendingPaymentByIdempotencyKey,
  recordPaymentEvent,
  updatePayment,
} from "@/lib/payments/paymentsService";
import { buildPaymentPreview, calculateSubtotal, MERCHANT_FEE_CENTS } from "@/lib/payments/pricingUtils";
import {
  PayloadTooLargeError,
  createCheckoutFingerprint,
  isJsonContentType,
  isValidPaymentEmail,
  readRequestBodyTextWithLimit,
  resolveSafeRedirectUrl,
  sanitizePhoneNumber,
} from "@/lib/payments/paymentSecurity";
import { enforceRateLimit, getClientIp } from "@/lib/rateLimit";
import { supabaseService } from "@/lib/supabaseServiceClient";
import type { PaymentCartItem, PaymentRecord } from "@/types/payments";

const appBaseUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const callbackUrl =
  process.env.BILLPLZ_CALLBACK_URL ?? `${appBaseUrl.replace(/\/$/, "")}/api/billplz/webhook`;

const MAX_ONLINE_PAYLOAD_BYTES = 64 * 1024;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:_-]{12,120}$/;

type OnlinePayBody = {
  package_id?: string;
  package_change_request_id?: string;
  redirectUrl?: string;
  idempotencyKey?: string;
  payer?: {
    name?: string;
    email?: string;
    mobile?: string;
  };
};

type OnlinePackageRow = {
  id: string;
  student_id: string;
  course_id: string;
  status: string;
  hold_expires_at: string | null;
  effective_month: string | null;
  monthly_fee_cents_snapshot: number | null;
  student_package_assignment_id: string | null;
  student: { id: string; name: string | null; parent_id: string | null; account_owner_user_id: string | null } | null;
  course: { id: string; name: string | null; monthly_fee_cents: number | null } | null;
};

type OnlinePackageChangeRow = {
  id: string;
  student_id: string;
  next_package_id_draft: string | null;
  billing_status: string;
  status: string;
  pricing_delta_cents: number | null;
  effective_month: string | null;
  student: { id: string; name: string | null; parent_id: string | null; account_owner_user_id: string | null } | null;
  next_package: {
    id: string;
    course_id: string;
    monthly_fee_cents_snapshot: number | null;
    student_package_assignment_id: string | null;
    course: { id: string; name: string | null; monthly_fee_cents: number | null } | null;
  } | null;
};

type OnlinePayerScope =
  | { kind: "parent"; userId: string; email: string | null; tenantId: string }
  | { kind: "student"; userId: string; email: string | null; tenantId: string; studentId: string };

type OnlineCheckoutSubject = {
  source: "online_package" | "online_package_change";
  studentId: string;
  studentName: string;
  courseId: string;
  courseName: string;
  feeId: string;
  monthKey: string;
  amountCents: number;
  packageId?: string;
  packageChangeRequestId?: string;
  assignmentId?: string | null;
  checkoutExpiresAt?: string | null;
};

function isOnlinePayBody(value: unknown): value is OnlinePayBody {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.package_id === undefined || typeof candidate.package_id === "string") &&
    (candidate.package_change_request_id === undefined ||
      typeof candidate.package_change_request_id === "string") &&
    (candidate.redirectUrl === undefined || typeof candidate.redirectUrl === "string") &&
    (candidate.idempotencyKey === undefined || typeof candidate.idempotencyKey === "string") &&
    (candidate.payer === undefined || (candidate.payer !== null && typeof candidate.payer === "object"))
  );
}

function monthKeyFromDate(value: string | null | undefined): string {
  const date = value && value.length >= 7 ? value.slice(0, 7) : new Date().toISOString().slice(0, 7);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(date) ? date : new Date().toISOString().slice(0, 7);
}

function onlineFeeSlug(tenantId: string, courseId: string) {
  return `online-${tenantId.slice(0, 8)}-${courseId}`.toLowerCase();
}

async function ensureOnlineCourseFee(params: {
  tenantId: string;
  courseId: string;
  courseName: string;
  amountCents: number;
}) {
  const slug = onlineFeeSlug(params.tenantId, params.courseId);
  const payload = {
    tenant_id: params.tenantId,
    slug,
    name: `Online ${params.courseName}`,
    description: "Online recurring package fee",
    category: "tuition",
    billing_cycle: "monthly",
    amount_cents: Math.max(0, Math.trunc(params.amountCents)),
    is_optional: false,
    is_active: true,
    sort_order: 40,
    metadata: {
      source: "online_course",
      courseId: params.courseId,
      paymentContext: "online",
    },
  };

  const { data: existing, error: lookupError } = await supabaseService
    .from("payment_fee_catalog")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("slug", slug)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing?.id) {
    const { data, error } = await supabaseService
      .from("payment_fee_catalog")
      .update(payload)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  const { data, error } = await supabaseService
    .from("payment_fee_catalog")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

function sanitizePayerName(input: string | null | undefined, fallback: string): string {
  const value = (input ?? "").trim();
  return (value || fallback).slice(0, 80);
}

function assertPayerCanPayStudent(
  scope: OnlinePayerScope,
  student: { parent_id: string | null; account_owner_user_id: string | null } | null
) {
  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }
  if (scope.kind === "parent" && student.parent_id !== scope.userId) {
    return NextResponse.json({ error: "Package not found for this parent." }, { status: 404 });
  }
  if (scope.kind === "student" && student.account_owner_user_id !== scope.userId) {
    return NextResponse.json({ error: "Package not found for this student." }, { status: 404 });
  }
  return null;
}

async function resolvePackageSubject(scope: OnlinePayerScope, packageId: string): Promise<OnlineCheckoutSubject | NextResponse> {
  const { data, error } = await supabaseService
    .from("online_recurring_packages")
    .select(
      "id,student_id,course_id,status,hold_expires_at,effective_month,monthly_fee_cents_snapshot,student_package_assignment_id,student:students(id,name,parent_id,account_owner_user_id),course:online_courses(id,name,monthly_fee_cents)"
    )
    .eq("tenant_id", scope.tenantId)
    .eq("id", packageId)
    .maybeSingle<OnlinePackageRow>();
  if (error) throw error;
  if (!data?.id) return NextResponse.json({ error: "Package not found." }, { status: 404 });

  const ownershipError = assertPayerCanPayStudent(scope, data.student);
  if (ownershipError) return ownershipError;

  if (data.status !== "pending_payment") {
    return NextResponse.json({ error: "Package is not awaiting payment." }, { status: 409 });
  }
  if (data.hold_expires_at && new Date(data.hold_expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Package hold expired." }, { status: 409 });
  }

  const amountCents = Math.max(0, Math.trunc(Number(data.monthly_fee_cents_snapshot ?? data.course?.monthly_fee_cents ?? 0)));
  if (amountCents <= 0) {
    return NextResponse.json({ error: "Online package amount is not configured." }, { status: 409 });
  }

  const courseName = data.course?.name?.trim() || "Online Package";
  const feeId = await ensureOnlineCourseFee({
    tenantId: scope.tenantId,
    courseId: data.course_id,
    courseName,
    amountCents,
  });

  return {
    source: "online_package",
    studentId: data.student_id,
    studentName: data.student?.name?.trim() || "Student",
    courseId: data.course_id,
    courseName,
    feeId,
    monthKey: monthKeyFromDate(data.effective_month),
    amountCents,
    packageId: data.id,
    assignmentId: data.student_package_assignment_id,
    checkoutExpiresAt: data.hold_expires_at,
  };
}

async function resolvePackageChangeSubject(
  scope: OnlinePayerScope,
  packageChangeRequestId: string
): Promise<OnlineCheckoutSubject | NextResponse> {
  const { data, error } = await supabaseService
    .from("online_package_change_requests")
    .select(
      "id,student_id,next_package_id_draft,billing_status,status,pricing_delta_cents,effective_month,student:students(id,name,parent_id,account_owner_user_id),next_package:online_recurring_packages!online_package_change_requests_next_package_id_draft_fkey(id,course_id,monthly_fee_cents_snapshot,student_package_assignment_id,course:online_courses(id,name,monthly_fee_cents))"
    )
    .eq("tenant_id", scope.tenantId)
    .eq("id", packageChangeRequestId)
    .maybeSingle<OnlinePackageChangeRow>();
  if (error) throw error;
  if (!data?.id) return NextResponse.json({ error: "Package change request not found." }, { status: 404 });

  const ownershipError = assertPayerCanPayStudent(scope, data.student);
  if (ownershipError) return ownershipError;

  if (data.status !== "pending_payment" || data.billing_status !== "pending_payment") {
    return NextResponse.json({ error: "Package change request is not awaiting payment." }, { status: 409 });
  }

  const amountCents = Math.max(0, Math.trunc(Number(data.pricing_delta_cents ?? 0)));
  if (amountCents <= 0) {
    return NextResponse.json({ error: "Package change does not require online payment." }, { status: 409 });
  }

  const courseId = data.next_package?.course_id;
  if (!courseId) {
    return NextResponse.json({ error: "Next package draft is missing." }, { status: 409 });
  }

  const courseName = data.next_package?.course?.name?.trim() || "Online Package Change";
  const feeId = await ensureOnlineCourseFee({
    tenantId: scope.tenantId,
    courseId,
    courseName,
    amountCents: data.next_package?.monthly_fee_cents_snapshot ?? amountCents,
  });

  return {
    source: "online_package_change",
    studentId: data.student_id,
    studentName: data.student?.name?.trim() || "Student",
    courseId,
    courseName,
    feeId,
    monthKey: monthKeyFromDate(data.effective_month),
    amountCents,
    packageId: data.next_package_id_draft ?? undefined,
    packageChangeRequestId: data.id,
    assignmentId: data.next_package?.student_package_assignment_id ?? null,
  };
}

function buildOnlineDescription(subject: OnlineCheckoutSubject) {
  if (subject.source === "online_package_change") {
    return `Yuran tukar pakej online ${subject.monthKey} (${subject.studentName})`;
  }
  return `Yuran pakej online ${subject.monthKey} (${subject.studentName})`;
}

async function extendOnlinePackageHold(params: {
  tenantId: string;
  packageId: string | null | undefined;
  expiresAt: string | null | undefined;
}) {
  if (!params.packageId || !params.expiresAt) return;

  const { error } = await supabaseService
    .from("online_recurring_packages")
    .update({
      hold_expires_at: params.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.packageId)
    .eq("status", "pending_payment");
  if (error) throw error;
}

function normalizeGatewayDueAt(value: string | null | undefined) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T23:59:59.999Z`);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function laterIsoDate(...values: Array<string | null | undefined>) {
  let latestMs: number | null = null;
  values.forEach((value) => {
    if (!value) return;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return;
    const ms = date.getTime();
    if (latestMs === null || ms > latestMs) latestMs = ms;
  });
  return latestMs === null ? null : new Date(latestMs).toISOString();
}

export async function createOnlinePaymentCheckout(request: NextRequest, scope: OnlinePayerScope) {
  try {
    const ip = getClientIp(request);
    const limit = await enforceRateLimit({
      key: `payments:online:create:${scope.tenantId}:${scope.userId}:${ip}`,
      limit: 12,
      windowMs: 60 * 1000,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many checkout attempts. Please retry shortly." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    if (!isJsonContentType(request)) {
      return NextResponse.json({ error: "Unsupported content type." }, { status: 415 });
    }

    const rawBody = await readRequestBodyTextWithLimit(request, MAX_ONLINE_PAYLOAD_BYTES);
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!isOnlinePayBody(parsed)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const packageId = (parsed.package_id ?? "").trim();
    const packageChangeRequestId = (parsed.package_change_request_id ?? "").trim();
    if (!packageId && !packageChangeRequestId) {
      return NextResponse.json(
        { error: "package_id or package_change_request_id is required" },
        { status: 400 }
      );
    }

    const idempotencyKey = (parsed.idempotencyKey ?? "").trim();
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      return NextResponse.json(
        { error: "Invalid idempotency key. Retry from the checkout screen." },
        { status: 400 }
      );
    }

    const existing = await findRecentPendingPaymentByIdempotencyKey(
      scope.tenantId,
      scope.userId,
      idempotencyKey,
      45
    );
    if (existing?.redirect_url && existing.billplz_id) {
      return NextResponse.json({
        paymentId: existing.id,
        billId: existing.billplz_id,
        billUrl: existing.redirect_url,
        due_at: existing.expires_at ?? null,
        reused: true,
      });
    }

    const subjectOrResponse = packageChangeRequestId
      ? await resolvePackageChangeSubject(scope, packageChangeRequestId)
      : await resolvePackageSubject(scope, packageId);
    if (subjectOrResponse instanceof NextResponse) return subjectOrResponse;
    const subject = subjectOrResponse;

    const item: PaymentCartItem = {
      childId: subject.studentId,
      childName: subject.studentName,
      feeId: subject.feeId,
      feeName: subject.courseName,
      months: [subject.monthKey],
      quantity: 1,
      unitAmountCents: subject.amountCents,
      subtotalCents: calculateSubtotal(subject.amountCents, 1),
      metadata: {
        source: subject.source,
        paymentContext: "online",
        packageId: subject.packageId ?? null,
        packageChangeRequestId: subject.packageChangeRequestId ?? null,
        assignmentId: subject.assignmentId ?? null,
        courseId: subject.courseId,
        effectiveMonth: subject.monthKey,
      },
    };
    const preview = buildPaymentPreview([item], MERCHANT_FEE_CENTS);
    const gatewayConfig = await resolveBillplzConfigForTenant(scope.tenantId, "online");
    const checkoutFingerprint = createCheckoutFingerprint(
      [
        {
          childId: item.childId,
          feeId: item.feeId,
          quantity: item.quantity,
          unitAmountCents: item.unitAmountCents,
          months: item.months,
        },
      ],
      preview.merchantFeeCents
    );

    const payerName = sanitizePayerName(parsed.payer?.name, subject.studentName);
    const payerEmail = (parsed.payer?.email ?? scope.email ?? "").trim().toLowerCase();
    if (!isValidPaymentEmail(payerEmail)) {
      return NextResponse.json({ error: "Valid payer email is required." }, { status: 400 });
    }

    const payerMobile = sanitizePhoneNumber(parsed.payer?.mobile ?? "");
    if (payerMobile.length < 8 || payerMobile.length > 16) {
      return NextResponse.json({ error: "Valid payer mobile number is required." }, { status: 400 });
    }

    let payment: PaymentRecord;
    try {
      payment = await createPaymentRecord({
        tenantId: scope.tenantId,
        providerId: gatewayConfig.providerId,
        parentId: scope.userId,
        items: [item],
        totalCents: preview.totalCents,
        merchantFeeCents: preview.merchantFeeCents,
        payableMonths: preview.payableMonths,
        idempotencyKey,
        status: "initiated",
        providerMetadata: {
          paymentContext: "online",
          expectedCollectionId: gatewayConfig.primaryCollectionId,
          source: subject.source,
          packageId: subject.packageId ?? null,
          packageChangeRequestId: subject.packageChangeRequestId ?? null,
          studentId: subject.studentId,
          courseId: subject.courseId,
          effectiveMonth: subject.monthKey,
          checkoutFingerprint,
        },
      });
    } catch (error) {
      if (error instanceof PaymentIdempotencyConflictError) {
        return NextResponse.json(
          { error: "Checkout request is still being processed. Please retry shortly." },
          { status: 409 }
        );
      }
      throw error;
    }

    const redirect = resolveSafeRedirectUrl(
      parsed.redirectUrl,
      appBaseUrl,
      scope.kind === "student" ? "/student/fees" : "/family/fees"
    );
    const amountCents = preview.totalCents + preview.merchantFeeCents;

    let bill;
    try {
      bill = await createBillplzBillWithConfig(
        {
          name: payerName,
          email: payerEmail,
          mobile: payerMobile,
          amountCents,
          description: buildOnlineDescription(subject),
          callbackUrl,
          redirectUrl: redirect,
          reference1: payment.id,
          reference2: subject.monthKey,
          dueAt: subject.checkoutExpiresAt ?? null,
        },
        gatewayConfig
      );
    } catch (error) {
      await updatePayment(payment.id, { status: "failed" });
      await recordPaymentEvent(
        payment.id,
        "app",
        "online_billplz_bill_create_failed",
        { idempotencyKey, checkoutFingerprint, message: "Bill creation failed" },
        { tenantId: scope.tenantId, providerId: gatewayConfig.providerId }
      );
      throw error;
    }

    if (typeof bill.amount === "number" && Math.trunc(bill.amount) !== amountCents) {
      await updatePayment(payment.id, { status: "failed" });
      await recordPaymentEvent(
        payment.id,
        "app",
        "online_billplz_bill_amount_mismatch",
        { idempotencyKey, expectedAmountCents: amountCents, billAmountCents: bill.amount },
        { tenantId: scope.tenantId, providerId: gatewayConfig.providerId }
      );
      return NextResponse.json({ error: "Bill amount mismatch. Please try again." }, { status: 502 });
    }

    if (!isAllowedBillplzCollection(bill.collection_id, gatewayConfig)) {
      await updatePayment(payment.id, { status: "failed" });
      await recordPaymentEvent(
        payment.id,
        "app",
        "online_billplz_collection_mismatch",
        {
          idempotencyKey,
          expectedCollectionIds: gatewayConfig.allowedCollectionIds,
          receivedCollectionId: bill.collection_id ?? null,
        },
        { tenantId: scope.tenantId, providerId: gatewayConfig.providerId }
      );
      return NextResponse.json({ error: "Bill collection mismatch. Please contact support." }, { status: 502 });
    }

    const checkoutExpiresAt = laterIsoDate(
      normalizeGatewayDueAt(bill.due_at ?? null),
      subject.checkoutExpiresAt ?? null
    );
    await extendOnlinePackageHold({
      tenantId: scope.tenantId,
      packageId: subject.source === "online_package" ? subject.packageId : null,
      expiresAt: checkoutExpiresAt,
    });

    await updatePayment(payment.id, {
      billplzId: bill.id,
      status: "pending",
      redirectUrl: bill.url,
      expiresAt: checkoutExpiresAt,
    });

    await recordPaymentEvent(
      payment.id,
      "app",
      "online_billplz_bill_created",
      {
        idempotencyKey,
        checkoutFingerprint,
        expectedAmountCents: amountCents,
        bill: {
          id: bill.id,
          amount: bill.amount,
          due_at: bill.due_at ?? null,
          collection_id: bill.collection_id ?? null,
        },
      },
      { tenantId: scope.tenantId, providerId: gatewayConfig.providerId }
    );

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
    console.error("Online payment checkout error:", error);
    return NextResponse.json({ error: "Unable to create online payment checkout." }, { status: 500 });
  }
}
