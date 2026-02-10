type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type MoveOnlineErrorArgs = {
  status: number;
  code: string;
  clientMessage: string;
  internalMessage?: string;
};

export type MoveOnlineApplyRow = {
  processed: number;
  enrollments_upserted: number;
  previous_enrollments_closed: number;
  class_assignments_cleared: number;
  processed_staging_id: string | null;
  processed_student_id: string | null;
  target_status: string | null;
};

export class MoveOnlineError extends Error {
  status: number;
  code: string;
  clientMessage: string;

  constructor(args: MoveOnlineErrorArgs) {
    super(args.internalMessage || args.clientMessage);
    this.name = "MoveOnlineError";
    this.status = args.status;
    this.code = args.code;
    this.clientMessage = args.clientMessage;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toNumber = (value: unknown): number => (typeof value === "number" ? value : 0);

const toStringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const toSupabaseErrorLike = (value: unknown): SupabaseErrorLike | null => {
  if (!isRecord(value)) return null;
  const code = typeof value.code === "string" ? value.code : undefined;
  const message = typeof value.message === "string" ? value.message : undefined;
  const details = typeof value.details === "string" ? value.details : undefined;
  const hint = typeof value.hint === "string" ? value.hint : undefined;
  if (!code && !message && !details && !hint) return null;
  return { code, message, details, hint };
};

const normalizeArrayRow = (result: unknown): MoveOnlineApplyRow | null => {
  if (!Array.isArray(result) || result.length === 0 || !isRecord(result[0])) return null;
  const row = result[0];
  return {
    processed: toNumber(row.processed),
    enrollments_upserted: toNumber(row.enrollments_upserted),
    previous_enrollments_closed: toNumber(row.previous_enrollments_closed),
    class_assignments_cleared: toNumber(row.class_assignments_cleared),
    processed_staging_id: toStringOrNull(row.processed_staging_id),
    processed_student_id: toStringOrNull(row.processed_student_id),
    target_status: toStringOrNull(row.target_status),
  };
};

export const isTargetEnrollmentStatus = (status: string | null) =>
  status === "active" || status === "pending_payment";

export const validateMoveOnlineApplyResult = (
  result: unknown,
  expected: { stagingId: string; studentId: string }
): MoveOnlineApplyRow => {
  const row = normalizeArrayRow(result);
  if (!row || row.processed !== 1) {
    throw new MoveOnlineError({
      status: 409,
      code: "MOVE_ONLINE_NOT_APPLIED",
      clientMessage: "Move could not be completed. Please retry.",
    });
  }

  if (
    row.processed_staging_id !== expected.stagingId ||
    row.processed_student_id !== expected.studentId
  ) {
    throw new MoveOnlineError({
      status: 409,
      code: "MOVE_ONLINE_TARGET_MISMATCH",
      clientMessage: "Move result did not match the selected student.",
    });
  }

  if (!isTargetEnrollmentStatus(row.target_status)) {
    throw new MoveOnlineError({
      status: 409,
      code: "MOVE_ONLINE_INVALID_TARGET_STATUS",
      clientMessage: "Move completed with invalid enrollment status. Please contact support.",
    });
  }

  return row;
};

export const toMoveOnlineError = (error: unknown): MoveOnlineError => {
  if (error instanceof MoveOnlineError) return error;

  const supabaseError = toSupabaseErrorLike(error);
  const rawMessage =
    (error instanceof Error && error.message) ||
    supabaseError?.message ||
    "Failed to move student to online";
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes("student not found")) {
    return new MoveOnlineError({
      status: 404,
      code: "STUDENT_NOT_FOUND",
      clientMessage: "Student not found in this tenant.",
      internalMessage: rawMessage,
    });
  }

  if (normalized.includes("pending migration row")) {
    return new MoveOnlineError({
      status: 409,
      code: "PENDING_MIGRATION_EXISTS",
      clientMessage: "This student already has a pending migration. Clear it first.",
      internalMessage: rawMessage,
    });
  }

  if (supabaseError?.code === "23505") {
    const uniqueContext = `${supabaseError.message || ""} ${supabaseError.details || ""}`.toLowerCase();
    if (!uniqueContext.includes("student_program_migration_staging")) {
      return new MoveOnlineError({
        status: 500,
        code: "MOVE_ONLINE_FAILED",
        clientMessage: "Failed to move student to online. Please try again.",
        internalMessage: rawMessage,
      });
    }

    return new MoveOnlineError({
      status: 409,
      code: "PENDING_MIGRATION_EXISTS",
      clientMessage: "This student already has a pending migration. Clear it first.",
      internalMessage: rawMessage,
    });
  }

  if (normalized.includes("forbidden") || normalized.includes("admin access required")) {
    return new MoveOnlineError({
      status: 403,
      code: "FORBIDDEN",
      clientMessage: "You do not have permission to move this student.",
      internalMessage: rawMessage,
    });
  }

  return new MoveOnlineError({
    status: 500,
    code: "MOVE_ONLINE_FAILED",
    clientMessage: "Failed to move student to online. Please try again.",
    internalMessage: rawMessage,
  });
};
