import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { getJuzFromPageRange } from "@/lib/quranMapping";
import {
  MAX_NEW_MURAJAAH_SPAN,
  parseNullableInt,
  QURAN_PAGE_MAX,
  QURAN_PAGE_MIN
} from "@/lib/murajaahRange";

const isNewMurajaahType = (value: unknown) => value === "New Murajaah";

const validateNewMurajaahRange = ({
  type,
  pageFrom,
  pageTo,
  juz
}: {
  type: unknown;
  pageFrom: unknown;
  pageTo: unknown;
  juz: unknown;
}): string | null => {
  if (!isNewMurajaahType(type)) return null;

  const fromValue = parseNullableInt(pageFrom);
  const toValue = parseNullableInt(pageTo);
  if (fromValue === null || toValue === null) {
    return "New Murajaah requires both page_from and page_to.";
  }
  if (
    fromValue < QURAN_PAGE_MIN || fromValue > QURAN_PAGE_MAX ||
    toValue < QURAN_PAGE_MIN || toValue > QURAN_PAGE_MAX
  ) {
    return "New Murajaah pages must be between 1 and 604.";
  }
  if (fromValue > toValue) {
    return "New Murajaah page_from must be less than or equal to page_to.";
  }

  const count = toValue - fromValue + 1;
  if (count > MAX_NEW_MURAJAAH_SPAN) {
    return `New Murajaah range cannot exceed ${MAX_NEW_MURAJAAH_SPAN} pages.`;
  }

  const derivedJuz = getJuzFromPageRange(fromValue, toValue);
  if (!derivedJuz) {
    return "Unable to derive juz from New Murajaah page range.";
  }

  const juzValue = parseNullableInt(juz);
  if (juzValue !== null && juzValue !== derivedJuz) {
    return `New Murajaah juz mismatch. Expected Juz ${derivedJuz}.`;
  }

  return null;
};

// POST - Admin creates a report for any student
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:reports", "admin:online-reports", "admin:online"]);
    if (!guard.ok) return guard.response;

    const payload = await request.json();
    const studentId = String(payload?.student_id || "");
    if (!studentId) {
      return NextResponse.json({ error: "student_id is required" }, { status: 400 });
    }

    const newMurajaahValidationError = validateNewMurajaahRange({
      type: payload?.type,
      pageFrom: payload?.page_from,
      pageTo: payload?.page_to,
      juz: payload?.juzuk
    });
    if (newMurajaahValidationError) {
      return NextResponse.json({ error: newMurajaahValidationError }, { status: 400 });
    }

    const data = await adminOperationSimple(async (client) => {
      // Verify student belongs to same tenant
      const { data: student, error: studentError } = await client
        .from("students")
        .select("id, tenant_id, assigned_teacher_id")
        .eq("id", studentId)
        .eq("tenant_id", guard.tenantId)
        .neq("record_type", "prospect")
        .single();

      if (studentError || !student) {
        throw new Error("Student not found or not in your tenant");
      }

      const row = {
        student_id: studentId,
        teacher_id: payload?.teacher_id || student.assigned_teacher_id || guard.userId,
        tenant_id: guard.tenantId,
        type: payload?.type ?? null,
        surah: payload?.surah ?? null,
        juzuk: payload?.juzuk ?? null,
        ayat_from: payload?.ayat_from ?? null,
        ayat_to: payload?.ayat_to ?? null,
        page_from: payload?.page_from ?? null,
        page_to: payload?.page_to ?? null,
        grade: payload?.grade ?? null,
        reading_progress: payload?.reading_progress ?? null,
        date: payload?.date ?? null,
      };

      const { data: report, error } = await client
        .from("reports")
        .insert(row)
        .select("*")
        .single();
      if (error) throw error;

      return report;
    });

    return NextResponse.json({ data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH - Admin updates any report
export async function PATCH(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:reports", "admin:online-reports", "admin:online"]);
    if (!guard.ok) return guard.response;

    const payload = await request.json();
    const reportId = String(payload?.id || "");
    if (!reportId) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const data = await adminOperationSimple(async (client) => {
      const { data: reportRow, error: reportError } = await client
        .from("reports")
        .select("id, student_id, type, page_from, page_to, juzuk, tenant_id")
        .eq("id", reportId)
        .single();

      if (reportError || !reportRow) {
        throw new Error("Report not found");
      }

      if (reportRow.tenant_id !== guard.tenantId) {
        throw new Error("Not allowed");
      }

      const effectiveType = payload?.type ?? reportRow.type;
      const effectivePageFrom = payload?.page_from ?? reportRow.page_from;
      const effectivePageTo = payload?.page_to ?? reportRow.page_to;
      const effectiveJuz = payload?.juzuk ?? reportRow.juzuk;

      const newMurajaahValidationError = validateNewMurajaahRange({
        type: effectiveType,
        pageFrom: effectivePageFrom,
        pageTo: effectivePageTo,
        juz: effectiveJuz
      });
      if (newMurajaahValidationError) {
        throw new Error(newMurajaahValidationError);
      }

      const updates = {
        type: payload?.type,
        surah: payload?.surah,
        juzuk: payload?.juzuk,
        ayat_from: payload?.ayat_from,
        ayat_to: payload?.ayat_to,
        page_from: payload?.page_from,
        page_to: payload?.page_to,
        grade: payload?.grade,
        reading_progress: payload?.reading_progress,
        date: payload?.date,
      };

      const { data: report, error } = await client
        .from("reports")
        .update(updates)
        .eq("id", reportId)
        .select("*")
        .single();
      if (error) throw error;

      return report;
    });

    return NextResponse.json({ data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE - Admin deletes any report
export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:reports", "admin:online-reports", "admin:online"]);
    if (!guard.ok) return guard.response;

    const payload = await request.json();
    const reportId = String(payload?.id || "");
    if (!reportId) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await adminOperationSimple(async (client) => {
      const { data: reportRow, error: reportError } = await client
        .from("reports")
        .select("id, tenant_id")
        .eq("id", reportId)
        .single();

      if (reportError || !reportRow) {
        throw new Error("Report not found");
      }

      if (reportRow.tenant_id !== guard.tenantId) {
        throw new Error("Not allowed");
      }

      const { error } = await client.from("reports").delete().eq("id", reportId);
      if (error) throw error;
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
