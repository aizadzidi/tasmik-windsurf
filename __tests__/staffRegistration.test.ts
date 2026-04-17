import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSupabaseAdminClient, mockEnforceRateLimit } = vi.hoisted(() => ({
  mockGetSupabaseAdminClient: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/supabaseAdminClient", () => ({
  getSupabaseAdminClient: mockGetSupabaseAdminClient,
}));

vi.mock("@/lib/rateLimit", () => ({
  enforceRateLimit: mockEnforceRateLimit,
}));

import { registerStaffWithInvite } from "@/lib/staffRegistration";

type FakeState = {
  authUsers: Array<{ id: string; email: string }>;
  tenant_invites: Array<Record<string, unknown>>;
  programs: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
  user_profiles: Array<Record<string, unknown>>;
  teacher_assignments: Array<Record<string, unknown>>;
};

type FakeConfig = {
  nextUserId?: string;
  teacherAssignmentUpsertError?: { code?: string; message?: string };
  incrementInviteFalse?: boolean;
};

const matchesFilters = (
  row: Record<string, unknown>,
  eqFilters: Array<[string, unknown]>,
  inFilters: Array<[string, unknown[]]>
) =>
  eqFilters.every(([column, value]) => row[column] === value) &&
  inFilters.every(([column, values]) => values.includes(row[column]));

function createDeleteBuilder(
  state: FakeState,
  table: keyof FakeState
) {
  const eqFilters: Array<[string, unknown]> = [];
  const builder = {
    eq(column: string, value: unknown) {
      eqFilters.push([column, value]);
      return builder;
    },
    then(resolve: (value: { data: Record<string, unknown>[]; error: null }) => void) {
      const rows = state[table] as Record<string, unknown>[];
      const kept: Record<string, unknown>[] = [];
      const removed: Record<string, unknown>[] = [];
      rows.forEach((row) => {
        if (matchesFilters(row, eqFilters, [])) {
          removed.push(row);
        } else {
          kept.push(row);
        }
      });
      state[table] = kept as FakeState[typeof table];
      resolve({ data: removed, error: null });
      return Promise.resolve({ data: removed, error: null });
    },
  };
  return builder;
}

function createSelectBuilder(
  state: FakeState,
  table: keyof FakeState
) {
  const eqFilters: Array<[string, unknown]> = [];
  const inFilters: Array<[string, unknown[]]> = [];

  return {
    eq(column: string, value: unknown) {
      eqFilters.push([column, value]);
      return this;
    },
    in(column: string, values: unknown[]) {
      inFilters.push([column, values]);
      const rows = (state[table] as Record<string, unknown>[]).filter((row) =>
        matchesFilters(row, eqFilters, inFilters)
      );
      return Promise.resolve({ data: rows, error: null });
    },
    maybeSingle() {
      const rows = (state[table] as Record<string, unknown>[]).filter((row) =>
        matchesFilters(row, eqFilters, inFilters)
      );
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    },
  };
}

function upsertRows(
  rows: Record<string, unknown>[],
  payload: Record<string, unknown> | Record<string, unknown>[],
  onConflict?: string
) {
  const incoming = Array.isArray(payload) ? payload : [payload];
  const conflictKeys = (onConflict ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  incoming.forEach((row) => {
    if (conflictKeys.length === 0) {
      rows.push({ ...row });
      return;
    }

    const existingIndex = rows.findIndex((existing) =>
      conflictKeys.every((column) => existing[column] === row[column])
    );
    if (existingIndex >= 0) {
      rows[existingIndex] = { ...rows[existingIndex], ...row };
      return;
    }
    rows.push({ ...row });
  });
}

function insertRows(
  rows: Record<string, unknown>[],
  payload: Record<string, unknown> | Record<string, unknown>[]
) {
  const incoming = Array.isArray(payload) ? payload : [payload];
  incoming.forEach((row) => rows.push({ ...row }));
}

function createSupabaseAdminStub(state: FakeState, config: FakeConfig = {}) {
  const createUser = vi.fn(async ({ email }: { email: string }) => {
    const id = config.nextUserId ?? `user-${state.authUsers.length + 1}`;
    state.authUsers.push({ id, email });
    return {
      data: { user: { id } },
      error: null,
    };
  });

  const deleteUser = vi.fn(async (userId: string) => {
    state.authUsers = state.authUsers.filter((user) => user.id !== userId);
    return { data: { user: null }, error: null };
  });

  return {
    auth: {
      admin: {
        createUser,
        deleteUser,
      },
    },
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "find_auth_user_id_by_email") {
        const email = args.p_email as string;
        const user = state.authUsers.find((entry) => entry.email === email);
        return { data: user?.id ?? null, error: null };
      }

      if (fn === "increment_invite_use_count") {
        if (config.incrementInviteFalse) {
          return { data: false, error: null };
        }
        const invite = state.tenant_invites.find((row) => row.id === args.invite_id);
        if (invite) {
          invite.use_count = Number(invite.use_count ?? 0) + 1;
        }
        return { data: true, error: null };
      }

      throw new Error(`Unexpected rpc call: ${fn}`);
    }),
    from(table: string) {
      if (
        table !== "tenant_invites" &&
        table !== "programs" &&
        table !== "users" &&
        table !== "user_profiles" &&
        table !== "teacher_assignments"
      ) {
        throw new Error(`Unexpected table: ${table}`);
      }

      const typedTable = table as keyof FakeState;
      return {
        select() {
          return createSelectBuilder(state, typedTable);
        },
        upsert(payload: Record<string, unknown> | Record<string, unknown>[], options?: { onConflict?: string }) {
          if (table === "teacher_assignments" && config.teacherAssignmentUpsertError) {
            return Promise.resolve({
              data: null,
              error: config.teacherAssignmentUpsertError,
            });
          }
          upsertRows(state[typedTable] as Record<string, unknown>[], payload, options?.onConflict);
          return Promise.resolve({ data: Array.isArray(payload) ? payload : [payload], error: null });
        },
        insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
          insertRows(state[typedTable] as Record<string, unknown>[], payload);
          return Promise.resolve({ data: Array.isArray(payload) ? payload : [payload], error: null });
        },
        delete() {
          return createDeleteBuilder(state, typedTable);
        },
      };
    },
  };
}

describe("registerStaffWithInvite", () => {
  beforeEach(() => {
    mockGetSupabaseAdminClient.mockReset();
    mockEnforceRateLimit.mockReset();
    mockEnforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  });

  it("rejects legacy teacher invites that are missing a scope", async () => {
    const state: FakeState = {
      authUsers: [],
      tenant_invites: [
        {
          id: "invite-1",
          code: "TEACH1",
          tenant_id: "tenant-1",
          max_uses: 5,
          use_count: 0,
          expires_at: "2099-01-01T00:00:00.000Z",
          is_active: true,
          target_role: "teacher",
          teacher_scope: null,
        },
      ],
      programs: [],
      users: [],
      user_profiles: [],
      teacher_assignments: [],
    };
    const supabaseAdmin = createSupabaseAdminStub(state);
    mockGetSupabaseAdminClient.mockReturnValue(supabaseAdmin);

    const result = await registerStaffWithInvite({
      name: "Teacher Legacy",
      email: "legacy@example.com",
      password: "password123",
      phone: null,
      inviteCode: "teach1",
      requestId: "req-1",
    });

    expect(result).toMatchObject({
      ok: false,
      code: "TEACHER_SCOPE_REQUIRED",
      status: 409,
    });
    expect(supabaseAdmin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("creates teacher assignments that match the invite scope", async () => {
    const state: FakeState = {
      authUsers: [],
      tenant_invites: [
        {
          id: "invite-1",
          code: "CAMP01",
          tenant_id: "tenant-1",
          max_uses: 5,
          use_count: 0,
          expires_at: "2099-01-01T00:00:00.000Z",
          is_active: true,
          target_role: "teacher",
          teacher_scope: "campus",
        },
      ],
      programs: [
        { id: "program-campus", tenant_id: "tenant-1", type: "campus" },
        { id: "program-online", tenant_id: "tenant-1", type: "online" },
      ],
      users: [],
      user_profiles: [],
      teacher_assignments: [],
    };
    const supabaseAdmin = createSupabaseAdminStub(state, { nextUserId: "user-1" });
    mockGetSupabaseAdminClient.mockReturnValue(supabaseAdmin);

    const result = await registerStaffWithInvite({
      name: "Campus Teacher",
      email: "campus@example.com",
      password: "password123",
      phone: "0123456789",
      inviteCode: "camp01",
      requestId: "req-2",
    });

    expect(result).toMatchObject({
      ok: true,
      code: "STAFF_REGISTERED",
      target_role: "teacher",
    });
    expect(state.teacher_assignments).toEqual([
      {
        tenant_id: "tenant-1",
        teacher_id: "user-1",
        program_id: "program-campus",
        role: "teacher",
      },
    ]);
    expect(state.user_profiles).toHaveLength(1);
    expect(state.tenant_invites[0].use_count).toBe(1);
  });

  it("cleans up a newly created auth user when teacher assignment setup fails", async () => {
    const state: FakeState = {
      authUsers: [],
      tenant_invites: [
        {
          id: "invite-1",
          code: "FAIL01",
          tenant_id: "tenant-1",
          max_uses: 5,
          use_count: 0,
          expires_at: "2099-01-01T00:00:00.000Z",
          is_active: true,
          target_role: "teacher",
          teacher_scope: "online",
        },
      ],
      programs: [{ id: "program-online", tenant_id: "tenant-1", type: "online" }],
      users: [],
      user_profiles: [],
      teacher_assignments: [],
    };
    const supabaseAdmin = createSupabaseAdminStub(state, {
      nextUserId: "user-fail",
      teacherAssignmentUpsertError: { message: "insert failed" },
    });
    mockGetSupabaseAdminClient.mockReturnValue(supabaseAdmin);

    const result = await registerStaffWithInvite({
      name: "Fail Teacher",
      email: "fail@example.com",
      password: "password123",
      phone: null,
      inviteCode: "fail01",
      requestId: "req-3",
    });

    expect(result).toMatchObject({
      ok: false,
      code: "TEACHER_ASSIGNMENTS_INSERT_FAILED",
      status: 500,
    });
    expect(supabaseAdmin.auth.admin.deleteUser).toHaveBeenCalledWith("user-fail", true);
    expect(state.authUsers).toEqual([]);
    expect(state.users).toEqual([]);
    expect(state.user_profiles).toEqual([]);
    expect(state.teacher_assignments).toEqual([]);
  });
});
