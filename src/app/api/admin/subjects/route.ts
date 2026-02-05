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

// GET - Fetch all subjects
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ['admin:exam']);
    if (!guard.ok) return guard.response;

    const tenantId = await resolveTenantIdOrThrow(request);

    const subjects = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from('subjects')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name');

      if (error) throw error;
      return data;
    });

    return NextResponse.json({ success: true, subjects });
  } catch (error: unknown) {
    console.error('Unexpected error fetching subjects:', error);
    const { message, status } = adminErrorDetails(error, 'Internal server error');
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

// POST - Create a new subject
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ['admin:exam']);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { name, description } = body;
    const tenantId = await resolveTenantIdOrThrow(request);

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
    }

    const newSubject = await adminOperationSimple(async (client) => {
      // Check if subject with same name already exists
      const { data: existingSubject, error: existingError } = await client
        .from('subjects')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('name', name.trim())
        .maybeSingle();

      if (existingError) throw existingError;
      if (existingSubject) {
        return NextResponse.json(
          { success: false, error: 'Subject with this name already exists' },
          { status: 409 }
        );
      }

      const { data, error } = await client
        .from('subjects')
        .insert([
          {
            name: name.trim(),
            description: toNullableText(description),
            tenant_id: tenantId,
          },
        ])
        .select()
        .single();

      if (error) throw error;
      return data;
    });

    if (newSubject instanceof NextResponse) {
      return newSubject;
    }

    return NextResponse.json({ success: true, subject: newSubject });
  } catch (error: unknown) {
    console.error('Unexpected error creating subject:', error);
    const { message, status } = adminErrorDetails(error, 'Internal server error');
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

// PUT - Update an existing subject
export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ['admin:exam']);
    if (!guard.ok) return guard.response;

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const tenantId = await resolveTenantIdOrThrow(request);

    if (!id) {
      return NextResponse.json({ success: false, error: 'Subject ID is required' }, { status: 400 });
    }

    const body = await request.json();
    const { name, description } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
    }

    const updatedSubject = await adminOperationSimple(async (client) => {
      // Check if another subject with same name already exists (excluding current subject)
      const { data: existingSubject, error: existingError } = await client
        .from('subjects')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('name', name.trim())
        .neq('id', id)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existingSubject) {
        return NextResponse.json(
          { success: false, error: 'Another subject with this name already exists' },
          { status: 409 }
        );
      }

      const { data, error } = await client
        .from('subjects')
        .update({
          name: name.trim(),
          description: toNullableText(description),
        })
        .eq('tenant_id', tenantId)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    });

    if (updatedSubject instanceof NextResponse) {
      return updatedSubject;
    }

    if (!updatedSubject) {
      return NextResponse.json({ success: false, error: 'Subject not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, subject: updatedSubject });
  } catch (error: unknown) {
    console.error('Unexpected error updating subject:', error);
    const { message, status } = adminErrorDetails(error, 'Internal server error');
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

// DELETE - Delete a subject
export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ['admin:exam']);
    if (!guard.ok) return guard.response;

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const tenantId = await resolveTenantIdOrThrow(request);

    if (!id) {
      return NextResponse.json({ success: false, error: 'Subject ID is required' }, { status: 400 });
    }

    const deleteResponse = await adminOperationSimple(async (client) => {
      // Check if subject is being used in any exam results
      const { data: examResults, error: checkError } = await client
        .from('exam_results')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('subject_id', id)
        .limit(1);

      if (checkError) throw checkError;
      if (examResults && examResults.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'Cannot delete subject that has exam results. Please remove associated exam results first.'
          },
          { status: 409 }
        );
      }

      // Check if subject is being used in any exam subjects
      const { data: examSubjects, error: checkExamError } = await client
        .from('exam_subjects')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('subject_id', id)
        .limit(1);

      if (checkExamError) throw checkExamError;
      if (examSubjects && examSubjects.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'Cannot delete subject that is assigned to exams. Please remove from exams first.'
          },
          { status: 409 }
        );
      }

      const { error: deleteError } = await client
        .from('subjects')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('id', id);

      if (deleteError) throw deleteError;
      return null;
    });

    if (deleteResponse instanceof NextResponse) {
      return deleteResponse;
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Unexpected error deleting subject:', error);
    const { message, status } = adminErrorDetails(error, 'Internal server error');
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
