import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock("@/lib/supabaseServiceClient", () => ({
  supabaseService: {
    from: mockFrom,
    rpc: mockRpc,
  },
}));

import {
  PaymentIdempotencyConflictError,
  createPaymentRecord,
  processBillplzWebhookAtomically,
} from "@/lib/payments/paymentsService";

describe("payments service security behavior", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockRpc.mockReset();
  });

  it("maps DB unique collisions into idempotency conflict error", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table !== "payments") throw new Error("Unexpected table");
      return {
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: null,
              error: { code: "23505", message: "duplicate key value violates unique constraint" },
            }),
          }),
        }),
      };
    });

    await expect(
      createPaymentRecord({
        tenantId: "tenant-1",
        providerId: "provider-1",
        parentId: "parent-1",
        items: [],
        totalCents: 1000,
        merchantFeeCents: 100,
        payableMonths: ["2026-02"],
        idempotencyKey: "idem_key_123456",
      })
    ).rejects.toBeInstanceOf(PaymentIdempotencyConflictError);
  });

  it("handles webhook replay outcome from atomic RPC path", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          outcome: "replay",
          payment_id: "payment-1",
          current_status: "pending",
          next_status: null,
        },
      ],
      error: null,
    });

    const result = await processBillplzWebhookAtomically({
      tenantId: "tenant-1",
      billplzId: "bill-1",
      providerEventId: "event-1",
      webhookFingerprint: "fingerprint-1",
      receivedAmountCents: 1100,
      paid: true,
      state: "paid",
      dueAt: null,
      paidAt: null,
      payload: { id: "bill-1" },
    });

    expect(result?.outcome).toBe("replay");
  });

  it("falls back when atomic webhook RPC is not deployed yet", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "function process_billplz_webhook_event(uuid,text,text,text,integer,boolean,text,timestamptz,timestamptz,jsonb) does not exist" },
    });

    const result = await processBillplzWebhookAtomically({
      tenantId: "tenant-1",
      billplzId: "bill-1",
      providerEventId: "event-1",
      webhookFingerprint: "fingerprint-1",
      receivedAmountCents: 1100,
      paid: true,
      state: "paid",
      dueAt: null,
      paidAt: null,
      payload: { id: "bill-1" },
    });

    expect(result).toBeNull();
  });
});
