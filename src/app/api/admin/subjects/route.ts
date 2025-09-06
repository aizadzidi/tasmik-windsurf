import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Fetch all subjects
export async function GET() {
  try {
    const { data: subjects, error } = await supabase
      .from('subjects')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching subjects:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, subjects });
  } catch (error) {
    console.error('Unexpected error fetching subjects:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create a new subject
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
    }

    // Check if subject with same name already exists
    const { data: existingSubject } = await supabase
      .from('subjects')
      .select('id')
      .eq('name', name.trim())
      .single();

    if (existingSubject) {
      return NextResponse.json({ success: false, error: 'Subject with this name already exists' }, { status: 409 });
    }

    const { data: newSubject, error } = await supabase
      .from('subjects')
      .insert([
        {
          name: name.trim(),
          description: description?.trim() || null,
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating subject:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, subject: newSubject });
  } catch (error) {
    console.error('Unexpected error creating subject:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update an existing subject
export async function PUT(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Subject ID is required' }, { status: 400 });
    }

    const body = await request.json();
    const { name, description } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
    }

    // Check if another subject with same name already exists (excluding current subject)
    const { data: existingSubject } = await supabase
      .from('subjects')
      .select('id')
      .eq('name', name.trim())
      .neq('id', id)
      .single();

    if (existingSubject) {
      return NextResponse.json({ success: false, error: 'Another subject with this name already exists' }, { status: 409 });
    }

    const { data: updatedSubject, error } = await supabase
      .from('subjects')
      .update({
        name: name.trim(),
        description: description?.trim() || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating subject:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!updatedSubject) {
      return NextResponse.json({ success: false, error: 'Subject not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, subject: updatedSubject });
  } catch (error) {
    console.error('Unexpected error updating subject:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete a subject
export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Subject ID is required' }, { status: 400 });
    }

    // Check if subject is being used in any exam results
    const { data: examResults, error: checkError } = await supabase
      .from('exam_results')
      .select('id')
      .eq('subject_id', id)
      .limit(1);

    if (checkError) {
      console.error('Error checking subject usage:', checkError);
      return NextResponse.json({ success: false, error: 'Error checking subject usage' }, { status: 500 });
    }

    if (examResults && examResults.length > 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Cannot delete subject that has exam results. Please remove associated exam results first.' 
      }, { status: 409 });
    }

    // Check if subject is being used in any exam subjects
    const { data: examSubjects, error: checkExamError } = await supabase
      .from('exam_subjects')
      .select('id')
      .eq('subject_id', id)
      .limit(1);

    if (checkExamError) {
      console.error('Error checking exam subject usage:', checkExamError);
      return NextResponse.json({ success: false, error: 'Error checking exam subject usage' }, { status: 500 });
    }

    if (examSubjects && examSubjects.length > 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Cannot delete subject that is assigned to exams. Please remove from exams first.' 
      }, { status: 409 });
    }

    const { error: deleteError } = await supabase
      .from('subjects')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting subject:', deleteError);
      return NextResponse.json({ success: false, error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error deleting subject:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}