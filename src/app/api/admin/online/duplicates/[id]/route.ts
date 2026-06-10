import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { duplicateGroupId } from "@/lib/online/duplicates";
import {
  ignoreStudentDuplicateSuggestion,
  mergeStudentRecords,
  StudentMergeConflictError,
} from "@/lib/studentMerge";

type DuplicateActionBody = {
  action?: "ignore" | "merge";
  canonical_student_id?: string;
  duplicate_student_id?: string;
};

const jsonError = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status });

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireAdminPermission(request, ["admin:online", "admin:dashboard"]);
    if (!guard.ok) return guard.response;

    const { id: groupId } = await context.params;
    const body = (await request.json()) as DuplicateActionBody;
    const action = body.action;
    const canonicalStudentId = (body.canonical_student_id ?? "").trim();
    const duplicateStudentId = (body.duplicate_student_id ?? "").trim();

    if (!action || !["ignore", "merge"].includes(action)) {
      return jsonError("Valid duplicate action is required.", 400);
    }
    if (!canonicalStudentId || !duplicateStudentId || canonicalStudentId === duplicateStudentId) {
      return jsonError("canonical_student_id and duplicate_student_id are required.", 400);
    }
    if (duplicateGroupId(canonicalStudentId, duplicateStudentId) !== groupId) {
      return jsonError("Duplicate group id does not match selected students.", 400);
    }

    const payload = await adminOperationSimple(async (client) => {
      if (action === "ignore") {
        await ignoreStudentDuplicateSuggestion({
          client,
          tenantId: guard.tenantId,
          canonicalStudentId,
          duplicateStudentId,
          actorUserId: guard.userId,
          duplicateGroupId: groupId,
        });
        return { ok: true, action };
      }

      const result = await mergeStudentRecords({
        client,
        tenantId: guard.tenantId,
        canonicalStudentId,
        duplicateStudentId,
        actorUserId: guard.userId,
      });

      return { ok: true, action, result };
    });

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("Admin online duplicate action error:", error);
    return jsonError(
      error instanceof StudentMergeConflictError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to update duplicate records.",
      error instanceof StudentMergeConflictError ? 409 : 500
    );
  }
}
