import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminPermission } from '@/lib/adminPermissions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Fetch all conduct criteria
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ['admin:exam']);
    if (!guard.ok) return guard.response;

    const { data: criterias, error } = await supabase
      .from('conduct_criterias')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching conduct criteria:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, criterias });
  } catch (error) {
    console.error('Unexpected error fetching conduct criteria:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create a new conduct criteria
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ['admin:exam']);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { name, description, max_score } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
    }

    // Validate max_score
    const maxScoreValue = max_score ? parseInt(max_score) : 100;
    if (isNaN(maxScoreValue) || maxScoreValue < 1 || maxScoreValue > 1000) {
      return NextResponse.json({ success: false, error: 'Max score must be between 1 and 1000' }, { status: 400 });
    }

    // Check if criteria with same name already exists
    const { data: existingCriteria } = await supabase
      .from('conduct_criterias')
      .select('id')
      .eq('name', name.trim())
      .single();

    if (existingCriteria) {
      return NextResponse.json({ success: false, error: 'Conduct criteria with this name already exists' }, { status: 409 });
    }

    const { data: newCriteria, error } = await supabase
      .from('conduct_criterias')
      .insert([
        {
          name: name.trim(),
          description: description?.trim() || null,
          max_score: maxScoreValue,
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating conduct criteria:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, criteria: newCriteria });
  } catch (error) {
    console.error('Unexpected error creating conduct criteria:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update an existing conduct criteria
export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ['admin:exam']);
    if (!guard.ok) return guard.response;

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Conduct criteria ID is required' }, { status: 400 });
    }

    const body = await request.json();
    const { name, description, max_score } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
    }

    // Validate max_score
    const maxScoreValue = max_score ? parseInt(max_score) : 100;
    if (isNaN(maxScoreValue) || maxScoreValue < 1 || maxScoreValue > 1000) {
      return NextResponse.json({ success: false, error: 'Max score must be between 1 and 1000' }, { status: 400 });
    }

    // Check if another criteria with same name already exists (excluding current criteria)
    const { data: existingCriteria } = await supabase
      .from('conduct_criterias')
      .select('id')
      .eq('name', name.trim())
      .neq('id', id)
      .single();

    if (existingCriteria) {
      return NextResponse.json({ success: false, error: 'Another conduct criteria with this name already exists' }, { status: 409 });
    }

    const { data: updatedCriteria, error } = await supabase
      .from('conduct_criterias')
      .update({
        name: name.trim(),
        description: description?.trim() || null,
        max_score: maxScoreValue,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating conduct criteria:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!updatedCriteria) {
      return NextResponse.json({ success: false, error: 'Conduct criteria not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, criteria: updatedCriteria });
  } catch (error) {
    console.error('Unexpected error updating conduct criteria:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete a conduct criteria
export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ['admin:exam']);
    if (!guard.ok) return guard.response;

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Conduct criteria ID is required' }, { status: 400 });
    }

    // Check if criteria is being used in any conduct entries
    const { data: _conductEntries, error: checkError } = await supabase
      .from('conduct_entries')
      .select('id')
      .limit(1);

    if (checkError) {
      console.error('Error checking conduct criteria usage:', checkError);
      return NextResponse.json({ success: false, error: 'Error checking conduct criteria usage' }, { status: 500 });
    }

    // Note: Since conduct_entries table structure uses individual columns for each criteria,
    // we need to check if this is a default criteria that's being used
    const { data: criteria } = await supabase
      .from('conduct_criterias')
      .select('name')
      .eq('id', id)
      .single();

    if (criteria) {
      const criteriaName = criteria.name.toLowerCase();
      const defaultCriterias = ['discipline', 'effort', 'participation', 'motivational level', 'character', 'leadership'];
      
      if (defaultCriterias.some(name => criteriaName.includes(name.toLowerCase()))) {
        return NextResponse.json({ 
          success: false, 
          error: 'Cannot delete default conduct criteria that may be referenced in the system.' 
        }, { status: 409 });
      }
    }

    const { error: deleteError } = await supabase
      .from('conduct_criterias')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting conduct criteria:', deleteError);
      return NextResponse.json({ success: false, error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error deleting conduct criteria:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
