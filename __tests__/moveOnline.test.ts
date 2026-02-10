import { describe, expect, it } from "vitest";
import {
  MoveOnlineError,
  toMoveOnlineError,
  validateMoveOnlineApplyResult,
} from "@/lib/moveOnline";

describe("move-online helpers", () => {
  it("accepts apply result only when staging and student IDs match", () => {
    const row = validateMoveOnlineApplyResult(
      [
        {
          processed: 1,
          enrollments_upserted: 2,
          previous_enrollments_closed: 1,
          class_assignments_cleared: 1,
          processed_staging_id: "stage-1",
          processed_student_id: "student-1",
          target_status: "active",
        },
      ],
      { stagingId: "stage-1", studentId: "student-1" }
    );

    expect(row.processed).toBe(1);
    expect(row.target_status).toBe("active");
  });

  it("rejects apply result when processed student does not match", () => {
    expect(() =>
      validateMoveOnlineApplyResult(
        [
          {
            processed: 1,
            processed_staging_id: "stage-1",
            processed_student_id: "student-X",
            target_status: "active",
          },
        ],
        { stagingId: "stage-1", studentId: "student-1" }
      )
    ).toThrow(MoveOnlineError);
  });

  it("maps duplicate staging conflict into safe client error", () => {
    const mapped = toMoveOnlineError({
      code: "23505",
      message: "duplicate key value violates unique constraint",
      details: "Key (tenant_id, student_id, target_program_type) already exists in student_program_migration_staging",
    });

    expect(mapped.status).toBe(409);
    expect(mapped.code).toBe("PENDING_MIGRATION_EXISTS");
  });

  it("maps unknown failures into generic 500 error", () => {
    const mapped = toMoveOnlineError(new Error("db timeout"));
    expect(mapped.status).toBe(500);
    expect(mapped.code).toBe("MOVE_ONLINE_FAILED");
    expect(mapped.clientMessage).toContain("Failed to move student to online");
  });
});
