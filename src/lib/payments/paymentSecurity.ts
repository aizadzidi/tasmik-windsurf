import { createHash } from "crypto";
import type { PaymentLineItem, PaymentRecord, PaymentStatus } from "@/types/payments";

const monthKeyPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const allowedStatusTransitions: Record<PaymentStatus, PaymentStatus[]> = {
  draft: ["initiated"],
  initiated: ["pending", "paid", "failed", "expired"],
  pending: ["paid", "failed", "expired"],
  paid: ["refunded"],
  failed: ["pending", "paid", "expired"],
  expired: ["pending", "paid", "failed"],
  refunded: [],
};

export type CheckoutFingerprintLine = {
  childId: string;
  feeId: string;
  quantity: number;
  unitAmountCents: number;
  months: string[];
};

export class PayloadTooLargeError extends Error {
  constructor(message = "Payload exceeds limit") {
    super(message);
    this.name = "PayloadTooLargeError";
  }
}

function normalizeContentType(value: string | null): string {
  return (value ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

export function isJsonContentType(request: Request): boolean {
  return normalizeContentType(request.headers.get("content-type")) === "application/json";
}

export function isFormUrlEncodedContentType(request: Request): boolean {
  return normalizeContentType(request.headers.get("content-type")) === "application/x-www-form-urlencoded";
}

export async function readRequestBodyTextWithLimit(
  request: Request,
  maxBytes: number
): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  });

  return new TextDecoder().decode(merged);
}

export function normalizeMonthKeys(input: string[]): string[] {
  const normalized = Array.from(
    new Set(
      input
        .map((value) => value.trim())
        .filter((value) => monthKeyPattern.test(value))
    )
  ).sort();

  return normalized;
}

export function isValidMonthKey(monthKey: string): boolean {
  return monthKeyPattern.test(monthKey);
}

export function isValidPaymentEmail(email: string): boolean {
  return emailPattern.test(email.trim());
}

export function sanitizePhoneNumber(input: string): string {
  return input.replace(/[^0-9+]/g, "");
}

export function canTransitionPaymentStatus(
  currentStatus: PaymentStatus,
  nextStatus: PaymentStatus
): boolean {
  if (currentStatus === nextStatus) return true;
  return allowedStatusTransitions[currentStatus]?.includes(nextStatus) ?? false;
}

export function resolveBillplzStatus(paid: boolean, state?: string | null): PaymentStatus {
  if (paid) return "paid";
  if (state === "pending") return "pending";
  if (state === "overdue" || state === "expired") return "expired";
  return "failed";
}

export function expectedPaymentAmountCents(totalCents: number, merchantFeeCents: number): number {
  return Math.max(0, Math.trunc(totalCents)) + Math.max(0, Math.trunc(merchantFeeCents));
}

export function parseAmountCents(input: string | number | null | undefined): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.trunc(input) : null;
  }
  if (typeof input !== "string" || input.trim().length === 0) return null;
  const value = Number(input);
  return Number.isFinite(value) ? Math.trunc(value) : null;
}

export function createCheckoutFingerprint(
  lines: CheckoutFingerprintLine[],
  merchantFeeCents: number
): string {
  const normalized = [...lines]
    .map((line) => ({
      childId: line.childId,
      feeId: line.feeId,
      quantity: Math.max(1, Math.trunc(line.quantity)),
      unitAmountCents: Math.max(0, Math.trunc(line.unitAmountCents)),
      months: normalizeMonthKeys(line.months ?? []),
    }))
    .sort((a, b) =>
      `${a.childId}:${a.feeId}:${a.months.join(",")}`.localeCompare(
        `${b.childId}:${b.feeId}:${b.months.join(",")}`
      )
    );

  const payload = JSON.stringify({
    merchantFeeCents: Math.max(0, Math.trunc(merchantFeeCents)),
    lines: normalized,
  });

  return createHash("sha256").update(payload).digest("hex");
}

export function createWebhookFingerprint(payload: Record<string, string | null | undefined>): string {
  const canonical = Object.keys(payload)
    .sort()
    .map((key) => `${key}=${payload[key] ?? ""}`)
    .join("&");

  return createHash("sha256").update(canonical).digest("hex");
}

export function createBillplzProviderEventId(
  billId: string,
  webhookFingerprint: string
): string {
  return `${billId}:${webhookFingerprint}`;
}

export function createFingerprintFromPaymentLineItems(
  lineItems: PaymentLineItem[] | null | undefined,
  merchantFeeCents: number
): string {
  const normalizedLines: CheckoutFingerprintLine[] = (lineItems ?? []).map((line) => ({
    childId: line.child_id ?? "",
    feeId: line.fee_id ?? "",
    quantity: line.quantity ?? 1,
    unitAmountCents: line.unit_amount_cents ?? 0,
    months: Array.isArray(line.metadata?.months)
      ? line.metadata.months.filter((item): item is string => typeof item === "string")
      : [],
  }));

  return createCheckoutFingerprint(normalizedLines, merchantFeeCents);
}

export function resolveSafeRedirectUrl(
  redirectUrl: string | undefined,
  appBaseUrl: string,
  fallbackPath: string
): string {
  const safeBase = appBaseUrl.replace(/\/$/, "");
  const fallback = `${safeBase}${fallbackPath.startsWith("/") ? fallbackPath : `/${fallbackPath}`}`;

  if (!redirectUrl) return fallback;

  try {
    const baseUrl = new URL(safeBase);
    const candidate = new URL(redirectUrl, safeBase);
    if (candidate.origin !== baseUrl.origin) {
      return fallback;
    }
    return candidate.toString();
  } catch {
    return fallback;
  }
}

export function isPaymentOwnedByTenantParent(
  payment: Pick<PaymentRecord, "tenant_id" | "parent_id"> | null | undefined,
  tenantId: string,
  parentId: string
): boolean {
  if (!payment) return false;
  return payment.tenant_id === tenantId && payment.parent_id === parentId;
}
