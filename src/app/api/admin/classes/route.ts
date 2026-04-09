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

const allowedLevels = [
  'Lower Primary',
  'Upper Primary',
  'Lower Secondary',
  'Upper Secondary',
];

// GET - Fetch all classes (admin only)
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, [
      'admin:dashboard',
      'admin:crm',
      'admin:certificates',
    ]);
    if (!guard.ok) return guard.response;
    const tenantId = await resolveTenantIdOrThrow(request);

    const data = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from('classes')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name');
      
      if (error) throw error;
      return data;
    });
    
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Admin classes fetch error:', error);
    const { message, status } = adminErrorDetails(error, 'Failed to fetch classes');
    return NextResponse.json({ error: message }, { status });
  }
}

// POST - Create new class (admin only)
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, [
      'admin:dashboard',
      'admin:crm',
      'admin:certificates',
    ]);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { name, level } = body;
    const tenantId = await resolveTenantIdOrThrow(request);
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const normalizedLevel = toNullableText(level);

    if (!trimmedName) {
      return NextResponse.json(
        { error: 'Class name is required' },
        { status: 400 }
      );
    }

    if (normalizedLevel && !allowedLevels.includes(normalizedLevel)) {
      return NextResponse.json(
        { error: 'Invalid class level' },
        { status: 400 }
      );
    }

    const createResult = await adminOperationSimple(async (client) => {
      const { data: existingClass, error: existingError } = await client
        .from('classes')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('name', trimmedName)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existingClass) {
        return NextResponse.json(
          { error: 'Class with this name already exists' },
          { status: 409 }
        );
      }

      const { data, error } = await client
        .from('classes')
        .insert([{ name: trimmedName, level: normalizedLevel, tenant_id: tenantId }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    });

    if (createResult instanceof NextResponse) {
      return createResult;
    }

    return NextResponse.json(createResult);
  } catch (error: unknown) {
    console.error('Admin class creation error:', error);
    const { message, status } = adminErrorDetails(error, 'Failed to create class');
    return NextResponse.json({ error: message }, { status });
  }
}

// PUT - Update class name (admin only)
export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, [
      'admin:dashboard',
      'admin:crm',
      'admin:certificates',
    ]);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { id, name, level } = body;
    const tenantId = await resolveTenantIdOrThrow(request);
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const normalizedLevel = toNullableText(level);

    if (!id || !trimmedName) {
      return NextResponse.json(
        { error: 'Class id and name are required' },
        { status: 400 }
      );
    }

    if (normalizedLevel && !allowedLevels.includes(normalizedLevel)) {
      return NextResponse.json(
        { error: 'Invalid class level' },
        { status: 400 }
      );
    }

    const updateResult = await adminOperationSimple(async (client) => {
      const { data: existingClass, error: existingError } = await client
        .from('classes')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('name', trimmedName)
        .neq('id', id)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existingClass) {
        return NextResponse.json(
          { error: 'Another class with this name already exists' },
          { status: 409 }
        );
      }

      const { data, error } = await client
        .from('classes')
        .update({ name: trimmedName, level: normalizedLevel })
        .eq('tenant_id', tenantId)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    });

    if (updateResult instanceof NextResponse) {
      return updateResult;
    }

    if (!updateResult) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    return NextResponse.json(updateResult);
  } catch (error: unknown) {
    console.error('Admin class update error:', error);
    const { message, status } = adminErrorDetails(error, 'Failed to update class');
    return NextResponse.json({ error: message }, { status });
  }
}

// DELETE - Remove class (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, [
      'admin:dashboard',
      'admin:crm',
      'admin:certificates',
    ]);
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const tenantId = await resolveTenantIdOrThrow(request);

    if (!id) {
      return NextResponse.json(
        { error: 'Class id is required' },
        { status: 400 }
      );
    }

    await adminOperationSimple(async (client) => {
      const { error } = await client
        .from('classes')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('id', id);

      if (error) throw error;
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Admin class delete error:', error);
    const { message, status } = adminErrorDetails(error, 'Failed to delete class');
    return NextResponse.json({ error: message }, { status });
  }
}
