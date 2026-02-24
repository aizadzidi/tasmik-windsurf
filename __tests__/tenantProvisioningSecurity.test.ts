import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureUserProfile, TenantReassignmentError } from "@/lib/tenantProvisioning";

type MockParams = {
  resolvedTenantId: string;
  existingTenantId: string | null;
};

function createSupabaseMock(params: MockParams) {
  const upsertMock = vi.fn(() => ({
    select: () => ({
      single: async () => ({
        data: { tenant_id: params.resolvedTenantId, role: "school_admin" },
        error: null,
      }),
    }),
  }));

  const from = vi.fn((table: string) => {
    if (table === "tenant_domains") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { tenant_id: params.resolvedTenantId },
              error: null,
            }),
          }),
        }),
      };
    }

    if (table === "users") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { name: "Admin User", role: "admin" },
              error: null,
            }),
          }),
        }),
      };
    }

    if (table === "user_profiles") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data:
                params.existingTenantId === null
                  ? null
                  : { tenant_id: params.existingTenantId, role: "school_admin" },
              error: null,
            }),
          }),
        }),
        upsert: upsertMock,
      };
    }

    if (table === "tenants") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: params.resolvedTenantId },
              error: null,
            }),
          }),
        }),
      };
    }

    throw new Error(`Unexpected table access: ${table}`);
  });

  return {
    client: { from } as unknown,
    from,
    upsertMock,
  };
}

describe("tenant provisioning security", () => {
  it("rejects cross-tenant reassignment attempts", async () => {
    const { client, upsertMock } = createSupabaseMock({
      resolvedTenantId: "tenant-b",
      existingTenantId: "tenant-a",
    });

    const request = new Request("https://tenant-b.eclazz.com", {
      headers: { host: "tenant-b.eclazz.com" },
    });

    await expect(
      ensureUserProfile({
        request: request as unknown as NextRequest,
        userId: "user-1",
        supabaseAdmin: client as SupabaseClient,
      })
    ).rejects.toBeInstanceOf(TenantReassignmentError);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("allows profile upsert when tenant remains unchanged", async () => {
    const { client, upsertMock } = createSupabaseMock({
      resolvedTenantId: "tenant-a",
      existingTenantId: "tenant-a",
    });

    const request = new Request("https://tenant-a.eclazz.com", {
      headers: { host: "tenant-a.eclazz.com" },
    });

    const result = await ensureUserProfile({
      request: request as unknown as NextRequest,
      userId: "user-1",
      supabaseAdmin: client as SupabaseClient,
    });

    expect(result?.tenant_id).toBe("tenant-a");
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });
});
