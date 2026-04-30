export type OnlineFamilyRecoveryStudent = {
  id: string;
  name: string | null;
  parent_id: string | null;
  record_type: string | null;
  account_owner_user_id: string | null;
};

export type OnlineFamilyRecoveryUser = {
  id: string;
  role: string | null;
};

export type OnlineFamilyRecoveryStore = {
  fetchStudentsByIds: (
    tenantId: string,
    studentIds: string[]
  ) => Promise<OnlineFamilyRecoveryStudent[]>;
  fetchOnlineStudentIds: (tenantId: string, studentIds: string[]) => Promise<Set<string>>;
  fetchUserById: (userId: string) => Promise<OnlineFamilyRecoveryUser | null>;
  promoteUserToParent: (params: { tenantId: string; userId: string }) => Promise<void>;
  linkStudentsToParent: (params: {
    tenantId: string;
    studentIds: string[];
    parentId: string;
  }) => Promise<void>;
};

export type RecoverOnlineClaimedFamilyParams = {
  tenantId: string;
  claimedStudentId: string;
  studentIds: string[];
};

export type RecoverOnlineClaimedFamilyResult = {
  family_user_id: string;
  linked_student_ids: string[];
  promoted_user: boolean;
};

export class OnlineFamilyRecoveryError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "OnlineFamilyRecoveryError";
    this.code = code;
    this.status = status;
  }
}

const uniqueTrimmed = (values: string[]) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

export async function recoverOnlineClaimedFamily(
  store: OnlineFamilyRecoveryStore,
  params: RecoverOnlineClaimedFamilyParams
): Promise<RecoverOnlineClaimedFamilyResult> {
  const tenantId = params.tenantId.trim();
  const claimedStudentId = params.claimedStudentId.trim();
  const selectedStudentIds = uniqueTrimmed(params.studentIds);

  if (!tenantId || !claimedStudentId) {
    throw new OnlineFamilyRecoveryError(
      "VALIDATION_ERROR",
      "tenantId and claimedStudentId are required."
    );
  }

  if (selectedStudentIds.length === 0) {
    throw new OnlineFamilyRecoveryError(
      "VALIDATION_ERROR",
      "Select at least one family member to recover."
    );
  }

  const targetStudentIds = uniqueTrimmed([claimedStudentId, ...selectedStudentIds]);
  const students = await store.fetchStudentsByIds(tenantId, targetStudentIds);
  const studentById = new Map(students.map((student) => [student.id, student]));
  const missingStudentIds = targetStudentIds.filter((studentId) => !studentById.has(studentId));
  if (missingStudentIds.length > 0) {
    throw new OnlineFamilyRecoveryError(
      "STUDENT_NOT_FOUND",
      "One or more selected students were not found.",
      404
    );
  }

  const claimedStudent = studentById.get(claimedStudentId);
  if (!claimedStudent || claimedStudent.record_type === "prospect") {
    throw new OnlineFamilyRecoveryError("STUDENT_NOT_FOUND", "Claimed student not found.", 404);
  }

  const familyUserId = claimedStudent.account_owner_user_id;
  if (!familyUserId) {
    throw new OnlineFamilyRecoveryError(
      "CLAIMED_STUDENT_OWNER_MISSING",
      "This student has not been claimed by a portal account yet.",
      409
    );
  }

  const prospectStudent = students.find((student) => student.record_type === "prospect");
  if (prospectStudent) {
    throw new OnlineFamilyRecoveryError(
      "PROSPECT_NOT_ALLOWED",
      "Prospect records cannot be linked to a family account.",
      409
    );
  }

  const onlineStudentIds = await store.fetchOnlineStudentIds(tenantId, targetStudentIds);
  const nonOnlineStudent = targetStudentIds.find((studentId) => !onlineStudentIds.has(studentId));
  if (nonOnlineStudent) {
    throw new OnlineFamilyRecoveryError(
      "ONLINE_ENROLLMENT_REQUIRED",
      "All selected students must be enrolled in an online or hybrid program.",
      409
    );
  }

  const linkedElsewhere = students.find(
    (student) => student.parent_id && student.parent_id !== familyUserId
  );
  if (linkedElsewhere) {
    throw new OnlineFamilyRecoveryError(
      "STUDENT_LINKED_TO_ANOTHER_PARENT",
      "One or more selected students are already linked to another parent account.",
      409
    );
  }

  const familyUser = await store.fetchUserById(familyUserId);
  if (!familyUser?.id) {
    throw new OnlineFamilyRecoveryError("FAMILY_USER_NOT_FOUND", "Claimed portal user not found.", 404);
  }

  if (familyUser.role !== "student" && familyUser.role !== "parent") {
    throw new OnlineFamilyRecoveryError(
      "ROLE_CONFLICT",
      "Claimed portal user must be a student or parent account.",
      409
    );
  }

  const promotedUser = familyUser.role === "student";
  if (promotedUser) {
    await store.promoteUserToParent({ tenantId, userId: familyUserId });
  }

  await store.linkStudentsToParent({
    tenantId,
    studentIds: targetStudentIds,
    parentId: familyUserId,
  });

  return {
    family_user_id: familyUserId,
    linked_student_ids: targetStudentIds,
    promoted_user: promotedUser,
  };
}
