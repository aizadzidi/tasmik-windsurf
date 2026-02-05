import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
import { requireAdminPermission } from "@/lib/adminPermissions";

type JuzTestPayload = {
  id?: string;
  student_id?: string;
  juz_number?: number;
  [key: string]: unknown;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ADMIN_JUZ_PERMISSIONS = ["admin:reports", "admin:exam"];

const adminErrorDetails = (error: unknown, fallback: string) => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message ?? fallback)
        : fallback;
  const status = message.includes("Admin access required") ? 403 : 500;
  return { message, status };
};

const resolveUserId = async (request: NextRequest) => {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true as const, userId: data.user.id };
};

const resolveTenantIdOrThrow = async (request: NextRequest) =>
  adminOperationSimple(async (client) => {
    const tenantId = await resolveTenantIdFromRequest(request, client);
    if (tenantId) return tenantId;

    const { data, error } = await client.from("tenants").select("id").limit(2);
    if (error) throw error;
    if (!data || data.length !== 1) {
      throw new Error("Tenant context missing");
    }

    return data[0].id;
  });

const isTeacherAssignedToStudent = async (
  tenantId: string,
  userId: string,
  studentId: string
) =>
  adminOperationSimple(async (client) => {
    const { data: profile, error: profileError } = await client
      .from("user_profiles")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== "teacher") return false;

    const { data: student, error: studentError } = await client
      .from("students")
      .select("assigned_teacher_id")
      .eq("id", studentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (studentError) throw studentError;

    return student?.assigned_teacher_id === userId;
  });

const resolveStudentIdForTest = async (tenantId: string, testId: string) =>
  adminOperationSimple(async (client) => {
    const { data, error } = await client
      .from("juz_tests")
      .select("student_id")
      .eq("id", testId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw error;
    return data?.student_id ? String(data.student_id) : null;
  });

export async function POST(request: NextRequest) {
  try {
    const testData = (await request.json()) as JuzTestPayload;
    const adminGuard = await requireAdminPermission(request, ADMIN_JUZ_PERMISSIONS);
    if (!adminGuard.ok && adminGuard.response.status !== 403) {
      return adminGuard.response;
    }

    const tenantId = adminGuard.ok ? adminGuard.tenantId : await resolveTenantIdOrThrow(request);
    
    // Validate required fields
    if (!testData.student_id || !testData.juz_number) {
      return NextResponse.json(
        { error: "Missing required fields: student_id and juz_number" },
        { status: 400 }
      );
    }

    if (!adminGuard.ok) {
      const userGuard = await resolveUserId(request);
      if (!userGuard.ok) return userGuard.response;

      const isAssigned = await isTeacherAssignedToStudent(
        tenantId,
        userGuard.userId,
        String(testData.student_id)
      );
      if (!isAssigned) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Insert the juz test record using service-role client (bypasses RLS)
    const insertedRecord = await adminOperationSimple(async (client) => {
      const payload = { ...testData, tenant_id: tenantId };
      const { data, error } = await client
        .from("juz_tests")
        .insert([payload])
        .select();
      if (error) {
        throw error;
      }
      
      let record = data?.[0];

      // Some legacy DB defaults/triggers still overwrite certain fields on insert.
      // Immediately re-apply the values we just collected so the final record
      // always reflects the form submission without requiring a manual edit.
      if (record?.id) {
        const fieldsToPreserve = [
          "section2_scores",
          "tajweed_score",
          "recitation_score",
          "total_percentage",
          "passed",
          "should_repeat",
          "remarks",
          "examiner_name",
        ] as const;

        type PreservedField = (typeof fieldsToPreserve)[number];
        const updatePayload = fieldsToPreserve.reduce<Partial<Record<PreservedField, unknown>>>((acc, field) => {
          if (testData[field] !== undefined) {
            acc[field] = testData[field];
          }
          return acc;
        }, {});

        if (record && Object.keys(updatePayload).length > 0) {
          const { data: enforcedData, error: enforceError } = await client
            .from("juz_tests")
            .update(updatePayload)
            .eq("id", record.id)
            .select();
          
          if (!enforceError && enforcedData?.[0]) {
            record = enforcedData[0];
          } else if (enforceError) {
            console.warn("Failed to re-apply juz test scores after insert:", enforceError);
          }
        }
      }

      return record;
    });

    return NextResponse.json(insertedRecord, { status: 201 });
  } catch (error: unknown) {
    console.error("API error:", error);
    const { message, status } = adminErrorDetails(error, "Internal server error");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("student_id");
    const adminGuard = await requireAdminPermission(request, ADMIN_JUZ_PERMISSIONS);
    if (!adminGuard.ok && adminGuard.response.status !== 403) {
      return adminGuard.response;
    }
    const tenantId = adminGuard.ok ? adminGuard.tenantId : await resolveTenantIdOrThrow(request);

    if (!studentId) {
      return NextResponse.json(
        { error: "Missing student_id parameter" },
        { status: 400 }
      );
    }

    if (!adminGuard.ok) {
      const userGuard = await resolveUserId(request);
      if (!userGuard.ok) return userGuard.response;

      const isAssigned = await isTeacherAssignedToStudent(
        tenantId,
        userGuard.userId,
        studentId
      );
      if (!isAssigned) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Fetch juz tests for the student using service-role client
    const data = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from("juz_tests")
        .select("*")
        .eq("student_id", studentId)
        .eq("tenant_id", tenantId)
        .order("test_date", { ascending: false });
      if (error) throw error;
      return data;
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("API error:", error);
    const { message, status } = adminErrorDetails(error, "Internal server error");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const testId = searchParams.get("id");
    const updateData = await request.json();
    const adminGuard = await requireAdminPermission(request, ADMIN_JUZ_PERMISSIONS);
    if (!adminGuard.ok && adminGuard.response.status !== 403) {
      return adminGuard.response;
    }
    const tenantId = adminGuard.ok ? adminGuard.tenantId : await resolveTenantIdOrThrow(request);

    if (!testId) {
      return NextResponse.json(
        { error: "Missing test ID parameter" },
        { status: 400 }
      );
    }

    if (!adminGuard.ok) {
      const userGuard = await resolveUserId(request);
      if (!userGuard.ok) return userGuard.response;

      const studentId = await resolveStudentIdForTest(tenantId, testId);
      if (!studentId) {
        return NextResponse.json({ error: "Test not found" }, { status: 404 });
      }

      const isAssigned = await isTeacherAssignedToStudent(
        tenantId,
        userGuard.userId,
        studentId
      );
      if (!isAssigned) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Update the juz test record using service-role client (bypasses RLS)
    const data = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from("juz_tests")
        .update(updateData)
        .eq("id", testId)
        .eq("tenant_id", tenantId)
        .select();
      if (error) throw error;
      return data;
    });

    return NextResponse.json(data[0]);
  } catch (error: unknown) {
    console.error("API error:", error);
    const { message, status } = adminErrorDetails(error, "Internal server error");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const testId = searchParams.get("id");
    const adminGuard = await requireAdminPermission(request, ADMIN_JUZ_PERMISSIONS);
    if (!adminGuard.ok && adminGuard.response.status !== 403) {
      return adminGuard.response;
    }
    const tenantId = adminGuard.ok ? adminGuard.tenantId : await resolveTenantIdOrThrow(request);

    if (!testId) {
      return NextResponse.json(
        { error: "Missing test ID parameter" },
        { status: 400 }
      );
    }

    if (!adminGuard.ok) {
      const userGuard = await resolveUserId(request);
      if (!userGuard.ok) return userGuard.response;

      const studentId = await resolveStudentIdForTest(tenantId, testId);
      if (!studentId) {
        return NextResponse.json({ error: "Test not found" }, { status: 404 });
      }

      const isAssigned = await isTeacherAssignedToStudent(
        tenantId,
        userGuard.userId,
        studentId
      );
      if (!isAssigned) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Delete the juz test record using service-role client (bypasses RLS)
    await adminOperationSimple(async (client) => {
      const { error } = await client
        .from("juz_tests")
        .delete()
        .eq("id", testId)
        .eq("tenant_id", tenantId);
      if (error) throw error;
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("API error:", error);
    const { message, status } = adminErrorDetails(error, "Internal server error");
    return NextResponse.json({ error: message }, { status });
  }
}
