import type { SupabaseClient } from "@supabase/supabase-js";

type Client = SupabaseClient;

type ReferenceUpdateResult = {
  table: string;
  column: string;
  rows: number;
  skipped?: boolean;
};

export type StudentMergeResult = {
  canonical_student_id: string;
  archived_student_id: string;
  moved_portal_user_id: string | null;
  reference_updates: ReferenceUpdateResult[];
};

type MergeRpcResult = {
  canonical_student_id?: string;
  archived_student_id?: string;
  moved_portal_user_id?: string | null;
  reference_updates?: ReferenceUpdateResult[];
};

export class StudentMergeConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudentMergeConflictError";
  }
}

const isMergeConflict = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string | null; message?: string | null };
  return (
    candidate.code === "23505" ||
    candidate.code === "P0001" ||
    (candidate.message ?? "").toLowerCase().includes("merge conflict")
  );
};

export async function mergeStudentRecords(params: {
  client: Client;
  tenantId: string;
  canonicalStudentId: string;
  duplicateStudentId: string;
  actorUserId: string;
}): Promise<StudentMergeResult> {
  const { data, error } = await params.client.rpc("merge_student_duplicate", {
    p_tenant_id: params.tenantId,
    p_canonical_student_id: params.canonicalStudentId,
    p_duplicate_student_id: params.duplicateStudentId,
    p_actor_user_id: params.actorUserId,
  });

  if (error) {
    if (isMergeConflict(error)) {
      throw new StudentMergeConflictError(error.message);
    }
    throw error;
  }

  const result = (data ?? {}) as MergeRpcResult;
  if (!result.canonical_student_id || !result.archived_student_id) {
    throw new Error("Merge did not return the updated student records.");
  }

  return {
    canonical_student_id: result.canonical_student_id,
    archived_student_id: result.archived_student_id,
    moved_portal_user_id: result.moved_portal_user_id ?? null,
    reference_updates: result.reference_updates ?? [],
  };
}

export async function ignoreStudentDuplicateSuggestion(params: {
  client: Client;
  tenantId: string;
  canonicalStudentId: string;
  duplicateStudentId: string;
  actorUserId: string;
  duplicateGroupId: string;
}) {
  const onlineEnrollments = await params.client
    .from("enrollments")
    .select("id, metadata")
    .eq("tenant_id", params.tenantId)
    .in("student_id", [params.canonicalStudentId, params.duplicateStudentId]);
  if (onlineEnrollments.error) throw onlineEnrollments.error;

  const updates = ((onlineEnrollments.data ?? []) as Array<{
    id: string;
    metadata: Record<string, unknown> | null;
  }>).map((row) =>
    params.client
      .from("enrollments")
      .update({
        metadata: {
          ...(row.metadata ?? {}),
          duplicate_ignored_group_id: params.duplicateGroupId,
          duplicate_ignored_at: new Date().toISOString(),
          duplicate_ignored_by: params.actorUserId,
        },
      })
      .eq("tenant_id", params.tenantId)
      .eq("id", row.id)
  );

  const results = await Promise.all(updates);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}
