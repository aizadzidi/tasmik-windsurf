import type { SupabaseClient } from "@supabase/supabase-js";

export type OnlineFamilyLinkStudent = {
  id: string;
  parent_id?: string | null;
  account_owner_user_id?: string | null;
};

type EnrollmentRow = {
  student_id: string | null;
  metadata: Record<string, unknown> | null;
};

type FamilyClaimTokenRow = {
  id: string;
  consumed_by_user_id: string | null;
};

type FamilyClaimTokenStudentRow = {
  family_claim_token_id: string;
  student_id: string | null;
};

const unique = (values: Array<string | null | undefined>) =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value))));

const familyReasonText = (metadata: Record<string, unknown> | null) => {
  const reason = metadata?.status_reason ?? metadata?.reason;
  return typeof reason === "string" ? reason.toLowerCase() : "";
};

export async function resolveOnlineFamilyLinkedStudentIds(
  client: SupabaseClient,
  tenantId: string,
  students: OnlineFamilyLinkStudent[]
) {
  const studentIds = unique(students.map((student) => student.id));
  const parentIds = unique(students.map((student) => student.parent_id));
  const linkedStudentIds = new Set<string>();

  if (studentIds.length === 0) return linkedStudentIds;

  const { data: enrollmentRows, error: enrollmentError } = await client
    .from("enrollments")
    .select("student_id, metadata")
    .eq("tenant_id", tenantId)
    .in("student_id", studentIds)
    .in("status", ["pending_payment", "active", "paused"]);
  if (enrollmentError) throw enrollmentError;

  const studentById = new Map(students.map((student) => [student.id, student]));

  ((enrollmentRows ?? []) as EnrollmentRow[]).forEach((row) => {
    if (!row.student_id) return;
    const student = studentById.get(row.student_id);
    if (student?.parent_id && familyReasonText(row.metadata).includes("family")) {
      linkedStudentIds.add(row.student_id);
    }
  });

  const recoveredFamilyOwnerIds = new Set(
    students
      .filter(
        (student) =>
          student.parent_id &&
          student.account_owner_user_id &&
          student.parent_id === student.account_owner_user_id
      )
      .map((student) => student.account_owner_user_id as string)
  );

  students.forEach((student) => {
    if (student.parent_id && recoveredFamilyOwnerIds.has(student.parent_id)) {
      linkedStudentIds.add(student.id);
    }
  });

  if (parentIds.length === 0) return linkedStudentIds;

  const { data: tokenRows, error: tokenError } = await client
    .from("online_family_claim_tokens")
    .select("id, consumed_by_user_id")
    .eq("tenant_id", tenantId)
    .in("consumed_by_user_id", parentIds)
    .not("consumed_at", "is", null)
    .is("revoked_at", null);
  if (tokenError) throw tokenError;

  const tokenParentById = new Map(
    ((tokenRows ?? []) as FamilyClaimTokenRow[])
      .filter((row) => row.id && row.consumed_by_user_id)
      .map((row) => [row.id, row.consumed_by_user_id as string])
  );
  const tokenIds = Array.from(tokenParentById.keys());

  if (tokenIds.length === 0) return linkedStudentIds;

  const { data: tokenStudentRows, error: tokenStudentError } = await client
    .from("online_family_claim_token_students")
    .select("family_claim_token_id, student_id")
    .eq("tenant_id", tenantId)
    .in("family_claim_token_id", tokenIds)
    .in("student_id", studentIds);
  if (tokenStudentError) throw tokenStudentError;

  ((tokenStudentRows ?? []) as FamilyClaimTokenStudentRow[]).forEach((row) => {
    if (!row.student_id) return;
    const student = studentById.get(row.student_id);
    const tokenParentId = tokenParentById.get(row.family_claim_token_id);
    if (student?.parent_id && tokenParentId && student.parent_id === tokenParentId) {
      linkedStudentIds.add(row.student_id);
    }
  });

  return linkedStudentIds;
}
