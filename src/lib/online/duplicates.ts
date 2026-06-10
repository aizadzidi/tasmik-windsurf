import type { SupabaseClient } from "@supabase/supabase-js";

type ClientLike = Pick<SupabaseClient, "from">;

export type OnlineDuplicateStudent = {
  id: string;
  name: string | null;
  parent_contact_number: string | null;
  assigned_teacher_id: string | null;
  account_owner_user_id: string | null;
  crm_stage: string | null;
  crm_status_reason: string | null;
  created_at: string | null;
};

export type OnlineDuplicateEnrollment = {
  student_id: string | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
};

export type OnlineDuplicatePackage = {
  student_id: string;
};

export type OnlineDuplicateCandidate = {
  duplicate_group_id: string;
  canonical_student_id: string;
  duplicate_student_id: string;
  confidence: "high" | "medium";
  reason: string;
};

const ACTIVE_ENROLLMENT_STATUSES = ["pending_payment", "active", "paused"];

export const normalizeDuplicateName = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

export const normalizeDuplicatePhone = (value: string | null | undefined) =>
  (value ?? "").replace(/\D/g, "");

export const duplicateGroupId = (studentAId: string, studentBId: string) =>
  [studentAId, studentBId].sort().join(":");

const metadataText = (metadata: Record<string, unknown> | null | undefined, key: string) => {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
};

const ignoredDuplicateGroupIds = (enrollments: OnlineDuplicateEnrollment[]) => {
  const ignored = new Set<string>();
  enrollments.forEach((enrollment) => {
    const value = enrollment.metadata?.duplicate_ignored_group_id;
    if (typeof value === "string" && value.trim()) {
      ignored.add(value.trim());
    }
  });
  return ignored;
};

const sourceRank = (
  student: OnlineDuplicateStudent,
  enrollment: OnlineDuplicateEnrollment | undefined,
  packageCount: number
) => {
  let rank = 0;
  const source = metadataText(enrollment?.metadata, "source");
  const reason = metadataText(enrollment?.metadata, "status_reason").toLowerCase();

  if (packageCount > 0) rank += 100;
  if (student.assigned_teacher_id) rank += 25;
  if (student.crm_stage === "active") rank += 15;
  if (source === "csv_import" || reason.includes("csv")) rank += 10;
  if (student.account_owner_user_id) rank += 5;
  return rank;
};

export async function resolveOnlineProgramIds(client: ClientLike, tenantId: string) {
  const { data, error } = await client
    .from("programs")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("type", ["online", "hybrid"]);
  if (error) throw error;
  return (data ?? [])
    .map((row) => row.id as string | null)
    .filter((id): id is string => Boolean(id));
}

export async function fetchOnlineDuplicateCandidates(params: {
  client: ClientLike;
  tenantId: string;
  students: OnlineDuplicateStudent[];
}) {
  const { client, tenantId, students } = params;
  const studentIds = students.map((student) => student.id);
  if (studentIds.length === 0) return [] as OnlineDuplicateCandidate[];

  const onlineProgramIds = await resolveOnlineProgramIds(client, tenantId);
  if (onlineProgramIds.length === 0) return [] as OnlineDuplicateCandidate[];

  const [enrollmentRes, packageRes] = await Promise.all([
    client
      .from("enrollments")
      .select("student_id, status, metadata")
      .eq("tenant_id", tenantId)
      .in("student_id", studentIds)
      .in("program_id", onlineProgramIds)
      .in("status", ACTIVE_ENROLLMENT_STATUSES),
    client
      .from("online_student_package_assignments")
      .select("student_id")
      .eq("tenant_id", tenantId)
      .in("student_id", studentIds)
      .in("status", ["draft", "pending_payment", "active", "paused"]),
  ]);
  if (enrollmentRes.error) throw enrollmentRes.error;
  if (packageRes.error) throw packageRes.error;

  const enrollments = (enrollmentRes.data ?? []) as OnlineDuplicateEnrollment[];
  const ignoredGroupIds = ignoredDuplicateGroupIds(enrollments);
  const enrollmentByStudentId = new Map(
    enrollments
      .filter((enrollment) => enrollment.student_id)
      .map((enrollment) => [String(enrollment.student_id), enrollment])
  );
  const packageCountByStudentId = new Map<string, number>();
  ((packageRes.data ?? []) as OnlineDuplicatePackage[]).forEach((pkg) => {
    packageCountByStudentId.set(pkg.student_id, (packageCountByStudentId.get(pkg.student_id) ?? 0) + 1);
  });

  const groups = new Map<string, OnlineDuplicateStudent[]>();
  students.forEach((student) => {
    const normalizedName = normalizeDuplicateName(student.name);
    if (!normalizedName) return;
    const group = groups.get(normalizedName) ?? [];
    group.push(student);
    groups.set(normalizedName, group);
  });

  const candidates: OnlineDuplicateCandidate[] = [];
  groups.forEach((group) => {
    if (group.length < 2) return;

    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const first = group[i];
        const second = group[j];
        const groupId = duplicateGroupId(first.id, second.id);
        if (ignoredGroupIds.has(groupId)) continue;

        const firstPhone = normalizeDuplicatePhone(first.parent_contact_number);
        const secondPhone = normalizeDuplicatePhone(second.parent_contact_number);
        const phoneMatches = Boolean(firstPhone && secondPhone && firstPhone === secondPhone);
        const oneClaimed = Boolean(first.account_owner_user_id) !== Boolean(second.account_owner_user_id);
        const bothUnclaimed = !first.account_owner_user_id && !second.account_owner_user_id;
        const hasPackage =
          (packageCountByStudentId.get(first.id) ?? 0) > 0 ||
          (packageCountByStudentId.get(second.id) ?? 0) > 0;

        if (!phoneMatches && !oneClaimed && !bothUnclaimed) continue;

        const firstRank = sourceRank(first, enrollmentByStudentId.get(first.id), packageCountByStudentId.get(first.id) ?? 0);
        const secondRank = sourceRank(second, enrollmentByStudentId.get(second.id), packageCountByStudentId.get(second.id) ?? 0);
        const canonical = firstRank >= secondRank ? first : second;
        const duplicate = canonical.id === first.id ? second : first;

        candidates.push({
          duplicate_group_id: groupId,
          canonical_student_id: canonical.id,
          duplicate_student_id: duplicate.id,
          confidence: phoneMatches || (oneClaimed && hasPackage) ? "high" : "medium",
          reason: phoneMatches
            ? "Same name and phone"
            : oneClaimed && hasPackage
              ? "Same name; one record has portal, one has package"
              : "Same name",
        });
      }
    }
  });

  return candidates;
}
