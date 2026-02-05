import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';
import { resolveTenantIdFromRequest } from '@/lib/tenantProvisioning';
import { requireAdminPermission } from '@/lib/adminPermissions';

const adminErrorDetails = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const status = message.includes('Admin access required') ? 403 : 500;
  return { message, status };
};

const resolveTenantIdOrThrow = async (request: NextRequest) =>
  adminOperationSimple(async (client) => {
    const tenantId = await resolveTenantIdFromRequest(request, client);
    if (tenantId) return tenantId;

    const { data, error } = await client.from('tenants').select('id').limit(2);
    if (error) throw error;
    if (!data || data.length !== 1) {
      throw new Error('Tenant context missing');
    }

    return data[0].id;
  });

const toNullableText = (value?: string | null) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const resolveDefaultStage = (recordType?: string | null) =>
  recordType === 'prospect' ? 'interested' : 'active';

// GET - Fetch students (admin only) - optionally filter by ID
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, [
      'admin:dashboard',
      'admin:crm',
      'admin:certificates',
      'admin:historical',
    ]);
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const includeProspects = searchParams.get('include_prospects') === 'true';
    const tenantId = await resolveTenantIdOrThrow(request);

    const data = await adminOperationSimple(async (client) => {
      let query = client
        .from('students')
        .select('*')
        .eq('tenant_id', tenantId);
      
      if (id) {
        query = query.eq('id', id);
      } else {
        query = query.order('name');
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data;
    });

    const filtered = includeProspects
      ? data
      : (data || []).filter((student) => student.record_type !== 'prospect');

    return NextResponse.json(filtered);
  } catch (error: unknown) {
    console.error('Admin students fetch error:', error);
    const { message, status } = adminErrorDetails(error, 'Failed to fetch students');
    return NextResponse.json({ error: message }, { status });
  }
}

// POST - Create new student (admin only)
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, [
      'admin:dashboard',
      'admin:crm',
      'admin:certificates',
      'admin:historical',
    ]);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const {
      name,
      parent_id,
      assigned_teacher_id,
      class_id,
      record_type,
      crm_stage,
      crm_status_reason,
      identification_number,
      address,
      parent_name,
      parent_contact_number,
      parent_occupation,
      household_income,
      interviewer_remark,
      student_id_no,
      date_of_birth,
      birth_place,
      gender,
      religion,
      admission_date,
      leaving_date,
      admission_age,
      leaving_age,
      reason_leaving,
      conduct_record,
      attendance_record,
      club_sport,
      club_position,
      participation_achievement,
      hafazan_surah,
      hafazan_page,
      hafazan_ayah,
      hafazan_grade
    } = body;
    const tenantId = await resolveTenantIdOrThrow(request);

    if (!name) {
      return NextResponse.json(
        { error: 'Student name is required' },
        { status: 400 }
      );
    }

    const resolvedRecordType = record_type || 'student';
    const resolvedCrmStage = crm_stage || resolveDefaultStage(resolvedRecordType);

    const data = await adminOperationSimple(async (client) => {
      const today = new Date().toISOString().slice(0, 10);
      const resolvedAdmissionDate =
        toNullableText(admission_date) ?? (resolvedRecordType === 'student' ? today : null);
      const resolvedLeavingDate =
        toNullableText(leaving_date) ?? (resolvedCrmStage === 'discontinued' ? today : null);
      const { data, error } = await client
        .from('students')
        .insert([{
          name,
          tenant_id: tenantId,
          parent_id: parent_id || null,
          assigned_teacher_id: assigned_teacher_id || null,
          class_id: class_id || null,
          record_type: resolvedRecordType,
          crm_stage: resolvedCrmStage,
          crm_status_reason: toNullableText(crm_status_reason),
          identification_number: toNullableText(identification_number),
          address: toNullableText(address),
          parent_name: toNullableText(parent_name),
          parent_contact_number: toNullableText(parent_contact_number),
          parent_occupation: toNullableText(parent_occupation),
          household_income: toNullableText(household_income),
          interviewer_remark: toNullableText(interviewer_remark),
          student_id_no: toNullableText(student_id_no),
          date_of_birth: toNullableText(date_of_birth),
          birth_place: toNullableText(birth_place),
          gender: toNullableText(gender),
          religion: toNullableText(religion),
          admission_date: resolvedAdmissionDate,
          leaving_date: resolvedLeavingDate,
          admission_age: toNullableText(admission_age),
          leaving_age: toNullableText(leaving_age),
          reason_leaving: toNullableText(reason_leaving),
          conduct_record: toNullableText(conduct_record),
          attendance_record: toNullableText(attendance_record),
          club_sport: toNullableText(club_sport),
          club_position: toNullableText(club_position),
          participation_achievement: toNullableText(participation_achievement),
          hafazan_surah: toNullableText(hafazan_surah),
          hafazan_page: toNullableText(hafazan_page),
          hafazan_ayah: toNullableText(hafazan_ayah),
          hafazan_grade: toNullableText(hafazan_grade)
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    });
    
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Admin student creation error:', error);
    const { message, status } = adminErrorDetails(error, 'Failed to create student');
    return NextResponse.json({ error: message }, { status });
  }
}

// PUT - Update student (admin only)
export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, [
      'admin:dashboard',
      'admin:crm',
      'admin:certificates',
      'admin:historical',
    ]);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const {
      id,
      name,
      parent_id,
      assigned_teacher_id,
      class_id,
      record_type,
      crm_stage,
      crm_status_reason,
      identification_number,
      address,
      parent_name,
      parent_contact_number,
      parent_occupation,
      household_income,
      interviewer_remark,
      student_id_no,
      date_of_birth,
      birth_place,
      gender,
      religion,
      admission_date,
      leaving_date,
      admission_age,
      leaving_age,
      reason_leaving,
      conduct_record,
      attendance_record,
      club_sport,
      club_position,
      participation_achievement,
      hafazan_surah,
      hafazan_page,
      hafazan_ayah,
      hafazan_grade
    } = body;
    const tenantId = await resolveTenantIdOrThrow(request);

    if (!id) {
      return NextResponse.json(
        { error: 'Student ID is required' },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {
      name,
      parent_id,
      assigned_teacher_id,
      class_id,
      record_type,
      crm_stage,
      crm_status_reason: toNullableText(crm_status_reason),
      identification_number: toNullableText(identification_number),
      address: toNullableText(address),
      parent_name: toNullableText(parent_name),
      parent_contact_number: toNullableText(parent_contact_number),
      parent_occupation: toNullableText(parent_occupation),
      household_income: toNullableText(household_income),
      interviewer_remark: toNullableText(interviewer_remark),
      student_id_no: toNullableText(student_id_no),
      date_of_birth: toNullableText(date_of_birth),
      birth_place: toNullableText(birth_place),
      gender: toNullableText(gender),
      religion: toNullableText(religion),
      admission_age: toNullableText(admission_age),
      leaving_age: toNullableText(leaving_age),
      reason_leaving: toNullableText(reason_leaving),
      conduct_record: toNullableText(conduct_record),
      attendance_record: toNullableText(attendance_record),
      club_sport: toNullableText(club_sport),
      club_position: toNullableText(club_position),
      participation_achievement: toNullableText(participation_achievement),
      hafazan_surah: toNullableText(hafazan_surah),
      hafazan_page: toNullableText(hafazan_page),
      hafazan_ayah: toNullableText(hafazan_ayah),
      hafazan_grade: toNullableText(hafazan_grade)
    };

    if (!crm_stage && record_type) {
      updates.crm_stage = resolveDefaultStage(record_type);
    }

    const data = await adminOperationSimple(async (client) => {
      const today = new Date().toISOString().slice(0, 10);
      const needsAdmissionDate = record_type === 'student';
      const needsLeavingDate = crm_stage === 'discontinued';
      const admissionInput = toNullableText(admission_date);
      const leavingInput = toNullableText(leaving_date);

      if ((needsAdmissionDate && !admissionInput) || (needsLeavingDate && !leavingInput)) {
        const { data: existing, error: existingError } = await client
          .from('students')
          .select('admission_date, leaving_date')
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .single();

        if (existingError) throw existingError;

        if (needsAdmissionDate) {
          updates.admission_date = admissionInput ?? existing?.admission_date ?? today;
        }
        if (needsLeavingDate) {
          updates.leaving_date = leavingInput ?? existing?.leaving_date ?? today;
        }
      } else {
        if (admissionInput) updates.admission_date = admissionInput;
        if (leavingInput) updates.leaving_date = leavingInput;
      }

      const { data, error } = await client
        .from('students')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    });
    
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Admin student update error:', error);
    const { message, status } = adminErrorDetails(error, 'Failed to update student');
    return NextResponse.json({ error: message }, { status });
  }
}

// DELETE - Delete student (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, [
      'admin:dashboard',
      'admin:crm',
      'admin:certificates',
      'admin:historical',
    ]);
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const tenantId = await resolveTenantIdOrThrow(request);

    if (!id) {
      return NextResponse.json(
        { error: 'Student ID is required' },
        { status: 400 }
      );
    }

    await adminOperationSimple(async (client) => {
      const { error } = await client
        .from('students')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);
      
      if (error) throw error;
    });
    
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Admin student deletion error:', error);
    const { message, status } = adminErrorDetails(error, 'Failed to delete student');
    return NextResponse.json({ error: message }, { status });
  }
}
