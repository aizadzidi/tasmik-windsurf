import { describe, expect, it, vi } from "vitest";
import {
  claimOnlineSlot,
  confirmOnlineSlotPayment,
  mapClaimRpcError,
} from "@/lib/online/claims";
import { pickTeacherByLeastLoadRoundRobin } from "@/lib/online/assignment";

const baseClaimParams = {
  tenantId: "tenant-1",
  parentId: "parent-1",
  studentId: "student-1",
  slotTemplateId: "slot-1",
  sessionDate: "2026-03-10",
  actorUserId: "parent-1",
};

describe("online slot claim flow helpers", () => {
  it("returns exactly one success for concurrent claim attempts", async () => {
    let claimed = false;
    const rpc = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (!claimed) {
        claimed = true;
        return {
          data: [
            {
              ok: true,
              code: "claimed",
              message: "Slot claimed",
              claim_id: "claim-1",
              assigned_teacher_id: "teacher-1",
              seat_hold_expires_at: "2026-03-10T09:30:00Z",
              enrollment_id: "enrollment-1",
            },
          ],
          error: null,
        };
      }

      return {
        data: [
          {
            ok: false,
            code: "slot_taken",
            message: "Slot already claimed.",
            claim_id: "claim-1",
            assigned_teacher_id: null,
            seat_hold_expires_at: null,
            enrollment_id: null,
          },
        ],
        error: null,
      };
    });

    const [first, second] = await Promise.all([
      claimOnlineSlot(rpc, baseClaimParams),
      claimOnlineSlot(rpc, baseClaimParams),
    ]);

    const outcomes = [first, second];
    expect(outcomes.filter((result) => result.ok).length).toBe(1);
    expect(outcomes.filter((result) => !result.ok && result.code === "slot_taken").length).toBe(1);
  });

  it("maps hold expiry responses deterministically", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          ok: false,
          code: "hold_expired",
          message: "Seat hold expired.",
          claim_id: "claim-2",
          assigned_teacher_id: null,
          seat_hold_expires_at: null,
          enrollment_id: "enrollment-2",
        },
      ],
      error: null,
    }));

    const result = await claimOnlineSlot(rpc, baseClaimParams);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("hold_expired");
    }
  });

  it("maps payment confirmation from pending_payment to active", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          ok: true,
          code: "activated",
          message: "Payment confirmed and enrollment activated.",
          enrollment_id: "enrollment-5",
          claim_status: "active",
        },
      ],
      error: null,
    }));

    const result = await confirmOnlineSlotPayment(rpc, {
      tenantId: "tenant-1",
      claimId: "claim-5",
      actorUserId: "parent-1",
      paymentReference: "payment-5",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.code).toBe("activated");
      expect(result.claimStatus).toBe("active");
    }
  });

  it("maps unique violations into deterministic slot conflicts", () => {
    const mapped = mapClaimRpcError({
      code: "23505",
      message: "duplicate key value violates unique constraint",
    });

    expect(mapped.ok).toBe(false);
    if (!mapped.ok) {
      expect(mapped.code).toBe("slot_taken");
    }
  });
});

describe("online teacher assignment fairness", () => {
  it("prefers least-load then earliest last-assigned", () => {
    const pick = pickTeacherByLeastLoadRoundRobin([
      { teacherId: "teacher-b", activeLoad: 2, lastAssignedAt: "2026-02-10T10:00:00Z" },
      { teacherId: "teacher-a", activeLoad: 1, lastAssignedAt: "2026-02-11T10:00:00Z" },
      { teacherId: "teacher-c", activeLoad: 1, lastAssignedAt: null },
    ]);

    expect(pick?.teacherId).toBe("teacher-c");
  });

  it("uses teacher id as deterministic tie-break", () => {
    const pick = pickTeacherByLeastLoadRoundRobin([
      { teacherId: "teacher-z", activeLoad: 1, lastAssignedAt: "2026-02-11T10:00:00Z" },
      { teacherId: "teacher-a", activeLoad: 1, lastAssignedAt: "2026-02-11T10:00:00Z" },
    ]);

    expect(pick?.teacherId).toBe("teacher-a");
  });
});
