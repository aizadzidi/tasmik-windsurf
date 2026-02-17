import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { verifyBillplzSignature } from "@/lib/payments/billplzClient";
import type { BillplzRuntimeConfig } from "@/lib/payments/gatewayConfig";
import type { BillplzCallbackPayload } from "@/types/payments";
import {
  PayloadTooLargeError,
  createBillplzProviderEventId,
  isJsonContentType,
  isPaymentOwnedByTenantParent,
  readRequestBodyTextWithLimit,
} from "@/lib/payments/paymentSecurity";

const baseConfig: BillplzRuntimeConfig = {
  providerId: "provider-1",
  keyVersion: "v2",
  apiBase: "https://www.billplz.com/api/v3",
  apiKeys: ["api-key-live"],
  primaryCollectionId: "collection-live",
  allowedCollectionIds: ["collection-live"],
  webhookSecrets: ["secret-live", "secret-previous"],
  source: "tenant",
};

function signPayload(payload: Record<string, string | null | undefined>, secret: string) {
  const dataString = Object.keys(payload)
    .filter((key) => key !== "x_signature")
    .sort()
    .map((key) => `${key}${payload[key] ?? ""}`)
    .join("|");
  return createHmac("sha256", secret).update(dataString).digest("hex");
}

describe("payment security guards", () => {
  it("rejects tampered Billplz signature", () => {
    const payload: BillplzCallbackPayload = {
      id: "bill-123",
      collection_id: "collection-live",
      paid: "true",
      state: "paid",
      amount: "12000",
      paid_at: "2026-02-17T10:00:00.000Z",
      due_at: "2026-02-28T00:00:00.000Z",
      url: "https://billplz.test/bills/bill-123",
    };
    payload.x_signature = signPayload(payload, "secret-live");

    expect(verifyBillplzSignature(payload, baseConfig)).toBe(true);

    payload.amount = "13000";
    expect(verifyBillplzSignature(payload, baseConfig)).toBe(false);
  });

  it("accepts rotated webhook secret while key rotation window is active", () => {
    const payload: BillplzCallbackPayload = {
      id: "bill-123",
      collection_id: "collection-live",
      paid: "false",
      state: "pending",
      amount: "12000",
      paid_at: "",
      due_at: "2026-02-28T00:00:00.000Z",
      url: "https://billplz.test/bills/bill-123",
    };
    payload.x_signature = signPayload(payload, "secret-previous");

    expect(verifyBillplzSignature(payload, baseConfig)).toBe(true);
  });

  it("enforces payment ownership boundary for tenant + parent", () => {
    expect(
      isPaymentOwnedByTenantParent(
        { tenant_id: "tenant-a", parent_id: "parent-a" },
        "tenant-a",
        "parent-a"
      )
    ).toBe(true);

    expect(
      isPaymentOwnedByTenantParent(
        { tenant_id: "tenant-b", parent_id: "parent-a" },
        "tenant-a",
        "parent-a"
      )
    ).toBe(false);
  });

  it("throws when payload size exceeds security limit", async () => {
    const request = new Request("https://example.test/api/billplz/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ big: "x".repeat(8_000) }),
    });

    await expect(readRequestBodyTextWithLimit(request, 512)).rejects.toBeInstanceOf(
      PayloadTooLargeError
    );
  });

  it("derives deterministic provider event id and validates json content-type", () => {
    const eventId = createBillplzProviderEventId("bill-1", "abc123");
    expect(eventId).toBe("bill-1:abc123");

    const request = new Request("https://example.test/api/billplz/create", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: "{}",
    });
    expect(isJsonContentType(request)).toBe(true);
  });
});
