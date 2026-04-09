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

const ADMIN_PERMISSIONS = ['admin:dashboard', 'admin:crm', 'admin:certificates'] as const;

// GET - Fetch class_subjects mapping + all subjects for the tenant
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, [...ADMIN_PERMISSIONS]);
    if (!guard.ok) return guard.response;
    const tenantId = await resolveTenantIdOrThrow(request);

    const result = await adminOperationSimple(async (client) => {
      const [csRes, subjRes] = await Promise.all([
        client.from('class_subjects').select('class_id, subject_id').eq('tenant_id', tenantId),
        client.from('subjects').select('id, name').eq('tenant_id', tenantId).order('name'),
      ]);

      if (csRes.error) throw csRes.error;
      if (subjRes.error) throw subjRes.error;

      return {
        classSubjects: csRes.data ?? [],
        allSubjects: subjRes.data ?? [],
      };
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Admin class-subjects fetch error:', error);
    const { message, status } = adminErrorDetails(error, 'Failed to fetch class-subjects');
    return NextResponse.json({ error: message }, { status });
  }
}

// PUT - Replace-all subjects for a class (with rollback on failure)
export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, [...ADMIN_PERMISSIONS]);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { classId, subjectIds } = body;
    const tenantId = await resolveTenantIdOrThrow(request);

    if (!classId || typeof classId !== 'string') {
      return NextResponse.json({ error: 'classId is required' }, { status: 400 });
    }
    if (!Array.isArray(subjectIds) || subjectIds.some((id: unknown) => typeof id !== 'string')) {
      return NextResponse.json({ error: 'subjectIds must be an array of strings' }, { status: 400 });
    }

    const result = await adminOperationSimple(async (client) => {
      // Validate classId belongs to tenant
      const { data: classRow, error: classError } = await client
        .from('classes')
        .select('id')
        .eq('id', classId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (classError) throw classError;
      if (!classRow) {
        return NextResponse.json({ error: 'Class not found' }, { status: 404 });
      }

      // Validate all subjectIds belong to tenant
      if (subjectIds.length > 0) {
        const { data: validSubjects, error: subjError } = await client
          .from('subjects')
          .select('id')
          .in('id', subjectIds)
          .eq('tenant_id', tenantId);
        if (subjError) throw subjError;
        if ((validSubjects?.length ?? 0) !== subjectIds.length) {
          return NextResponse.json({ error: 'One or more subject IDs are invalid' }, { status: 400 });
        }
      }

      // Snapshot current assignments for rollback
      const { data: previousRows, error: snapError } = await client
        .from('class_subjects')
        .select('class_id, subject_id, tenant_id')
        .eq('class_id', classId)
        .eq('tenant_id', tenantId);
      if (snapError) throw snapError;

      // Delete existing assignments
      const { error: deleteError } = await client
        .from('class_subjects')
        .delete()
        .eq('class_id', classId)
        .eq('tenant_id', tenantId);
      if (deleteError) throw deleteError;

      // Insert new assignments
      if (subjectIds.length > 0) {
        const rows = subjectIds.map((sid: string) => ({
          class_id: classId,
          subject_id: sid,
          tenant_id: tenantId,
        }));
        const { error: insertError } = await client
          .from('class_subjects')
          .insert(rows);

        if (insertError) {
          // Rollback: re-insert previous rows
          if (previousRows && previousRows.length > 0) {
            const { error: rollbackError } = await client.from('class_subjects').insert(previousRows);
            if (rollbackError) console.error('Rollback failed:', rollbackError);
          }
          throw insertError;
        }
      }

      // Return updated mappings for this class
      const { data: updated, error: fetchError } = await client
        .from('class_subjects')
        .select('class_id, subject_id')
        .eq('class_id', classId)
        .eq('tenant_id', tenantId);
      if (fetchError) throw fetchError;

      return { classSubjects: updated ?? [] };
    });

    if (result instanceof NextResponse) return result;
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Admin class-subjects update error:', error);
    const { message, status } = adminErrorDetails(error, 'Failed to update class-subjects');
    return NextResponse.json({ error: message }, { status });
  }
}
