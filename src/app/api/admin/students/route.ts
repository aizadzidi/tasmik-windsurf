import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';
import { resolveTenantIdFromRequest } from '@/lib/tenantProvisioning';

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

// GET - Fetch students (admin only) - optionally filter by ID
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
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
    
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Admin students fetch error:', error);
    const { message, status } = adminErrorDetails(error, 'Failed to fetch students');
    return NextResponse.json({ error: message }, { status });
  }
}

// POST - Create new student (admin only)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, parent_id, assigned_teacher_id, class_id } = body;
    const tenantId = await resolveTenantIdOrThrow(request);

    if (!name) {
      return NextResponse.json(
        { error: 'Student name is required' },
        { status: 400 }
      );
    }

    const data = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from('students')
        .insert([{
          name,
          tenant_id: tenantId,
          parent_id,
          assigned_teacher_id: assigned_teacher_id || null,
          class_id: class_id || null
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
    const body = await request.json();
    const { id, name, parent_id, assigned_teacher_id, class_id } = body;
    const tenantId = await resolveTenantIdOrThrow(request);

    if (!id) {
      return NextResponse.json(
        { error: 'Student ID is required' },
        { status: 400 }
      );
    }

    const data = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from('students')
        .update({
          name,
          parent_id,
          assigned_teacher_id,
          class_id
        })
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
