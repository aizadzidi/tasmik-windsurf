import { describe, expect, it } from "vitest";
import {
  OnlineFamilyRecoveryError,
  recoverOnlineClaimedFamily,
  type OnlineFamilyRecoveryStore,
  type OnlineFamilyRecoveryStudent,
  type OnlineFamilyRecoveryUser,
} from "@/lib/online/familyRecovery";

type FakeStoreState = {
  students: OnlineFamilyRecoveryStudent[];
  users: OnlineFamilyRecoveryUser[];
  onlineStudentIds?: string[];
  promotedUsers?: string[];
};

const createStore = (state: FakeStoreState): OnlineFamilyRecoveryStore => {
  const onlineStudentIds = new Set(
    state.onlineStudentIds ?? state.students.map((student) => student.id)
  );
  state.promotedUsers = state.promotedUsers ?? [];

  return {
    async fetchStudentsByIds(_tenantId, studentIds) {
      return state.students.filter((student) => studentIds.includes(student.id));
    },
    async fetchOnlineStudentIds(_tenantId, studentIds) {
      return new Set(studentIds.filter((studentId) => onlineStudentIds.has(studentId)));
    },
    async fetchUserById(userId) {
      return state.users.find((user) => user.id === userId) ?? null;
    },
    async promoteUserToParent({ userId }) {
      const user = state.users.find((row) => row.id === userId);
      if (user) user.role = "parent";
      state.promotedUsers?.push(userId);
    },
    async linkStudentsToParent({ studentIds, parentId }) {
      state.students.forEach((student) => {
        if (studentIds.includes(student.id)) {
          student.parent_id = parentId;
        }
      });
    },
  };
};

const baseStudents: OnlineFamilyRecoveryStudent[] = [
  {
    id: "student-claimed",
    name: "Claimed",
    parent_id: null,
    record_type: "student",
    account_owner_user_id: "user-claimed",
  },
  {
    id: "student-sibling",
    name: "Sibling",
    parent_id: null,
    record_type: "student",
    account_owner_user_id: null,
  },
];

describe("online family recovery", () => {
  it("rejects a claimed student without an account owner", async () => {
    const state = {
      students: [
        { ...baseStudents[0], account_owner_user_id: null },
        { ...baseStudents[1] },
      ],
      users: [{ id: "user-claimed", role: "student" }],
    };

    await expect(
      recoverOnlineClaimedFamily(createStore(state), {
        tenantId: "tenant-1",
        claimedStudentId: "student-claimed",
        studentIds: ["student-sibling"],
      })
    ).rejects.toMatchObject({
      code: "CLAIMED_STUDENT_OWNER_MISSING",
    } satisfies Partial<OnlineFamilyRecoveryError>);
  });

  it("promotes the claimed student owner to parent and links the family", async () => {
    const state = {
      students: baseStudents.map((student) => ({ ...student })),
      users: [{ id: "user-claimed", role: "student" }],
      promotedUsers: [],
    };

    const result = await recoverOnlineClaimedFamily(createStore(state), {
      tenantId: "tenant-1",
      claimedStudentId: "student-claimed",
      studentIds: ["student-sibling"],
    });

    expect(result).toEqual({
      family_user_id: "user-claimed",
      linked_student_ids: ["student-claimed", "student-sibling"],
      promoted_user: true,
    });
    expect(state.users[0].role).toBe("parent");
    expect(state.promotedUsers).toEqual(["user-claimed"]);
    expect(state.students.map((student) => [student.id, student.parent_id])).toEqual([
      ["student-claimed", "user-claimed"],
      ["student-sibling", "user-claimed"],
    ]);
  });

  it("rejects a selected student already linked to another parent", async () => {
    const state = {
      students: [
        { ...baseStudents[0] },
        { ...baseStudents[1], parent_id: "other-parent" },
      ],
      users: [{ id: "user-claimed", role: "student" }],
    };

    await expect(
      recoverOnlineClaimedFamily(createStore(state), {
        tenantId: "tenant-1",
        claimedStudentId: "student-claimed",
        studentIds: ["student-sibling"],
      })
    ).rejects.toMatchObject({
      code: "STUDENT_LINKED_TO_ANOTHER_PARENT",
    } satisfies Partial<OnlineFamilyRecoveryError>);
  });

  it("keeps sibling student-login ownership untouched", async () => {
    const state = {
      students: [
        { ...baseStudents[0] },
        { ...baseStudents[1], account_owner_user_id: "sibling-login" },
      ],
      users: [{ id: "user-claimed", role: "parent" }],
    };

    const result = await recoverOnlineClaimedFamily(createStore(state), {
      tenantId: "tenant-1",
      claimedStudentId: "student-claimed",
      studentIds: ["student-sibling"],
    });

    expect(result.promoted_user).toBe(false);
    expect(state.students.find((student) => student.id === "student-sibling")).toMatchObject({
      parent_id: "user-claimed",
      account_owner_user_id: "sibling-login",
    });
  });

  it("rejects non-online selected students", async () => {
    const state = {
      students: baseStudents.map((student) => ({ ...student })),
      users: [{ id: "user-claimed", role: "student" }],
      onlineStudentIds: ["student-claimed"],
    };

    await expect(
      recoverOnlineClaimedFamily(createStore(state), {
        tenantId: "tenant-1",
        claimedStudentId: "student-claimed",
        studentIds: ["student-sibling"],
      })
    ).rejects.toMatchObject({
      code: "ONLINE_ENROLLMENT_REQUIRED",
    } satisfies Partial<OnlineFamilyRecoveryError>);
  });
});
