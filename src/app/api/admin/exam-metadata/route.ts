import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { createClient } from '@supabase/supabase-js';

interface CreateExamData {
  title: string;
  subjects: string[];
  classIds: string[];
  dateRange: {
    from: string;
    to: string;
  };
  conductWeightages: { [classId: string]: number };
  gradingSystemId?: string;
}

const isValidUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

// GET - Fetch exam metadata (exams, classes, subjects for dropdowns)
export async function GET() {
  try {
    // Get all exams with their associated classes and subjects
    const { data: exams, error: examsError } = await supabase
      .from('exams')
      .select(`
        id,
        name,
        type,
        exam_start_date,
        exam_end_date,
        created_at,
        grading_system_id,
        exam_classes(
          conduct_weightage,
          classes(id, name)
        ),
        exam_subjects(
          subjects(id, name)
        )
      `)
      .order('created_at', { ascending: false });

    if (examsError) {
      console.error('Error fetching exams:', examsError);
      return NextResponse.json({ error: 'Failed to fetch exams' }, { status: 500 });
    }

    // Get all classes
    const { data: classes, error: classesError } = await supabase
      .from('classes')
      .select('id, name')
      .order('name');

    if (classesError) {
      console.error('Error fetching classes:', classesError);
      return NextResponse.json({ error: 'Failed to fetch classes' }, { status: 500 });
    }

    // Get all subjects
    const { data: subjects, error: subjectsError } = await supabase
      .from('subjects')
      .select('id, name')
      .order('name');

    if (subjectsError) {
      console.error('Error fetching subjects:', subjectsError);
      return NextResponse.json({ error: 'Failed to fetch subjects' }, { status: 500 });
    }

    return NextResponse.json({
      exams: exams || [],
      classes: classes || [],
      subjects: subjects || [],
      success: true
    });

  } catch (error: unknown) {
    console.error('Error in exam-metadata API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create new exam
export async function POST(request: Request) {
  try {
    // Parse raw text first to ensure we can gracefully handle invalid JSON
    const raw = await request.text();
    let body: CreateExamData;
    try {
      body = JSON.parse(raw);
    } catch (e) {
      console.error('Invalid JSON in exam creation request:', raw?.slice(0, 500));
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { title, subjects, classIds, dateRange, conductWeightages, gradingSystemId } = body;

    console.log('Received exam creation request:', { title, subjects, classIds, dateRange, conductWeightages, gradingSystemId });

    if (!title || !subjects.length || !classIds.length || !dateRange.from) {
      console.log('Missing required fields validation failed');
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Early validation for UUID formats
    if (!Array.isArray(classIds) || classIds.some((id) => !isValidUuid(id))) {
      return NextResponse.json({ error: 'Invalid class ID format' }, { status: 400 });
    }
    if (gradingSystemId && !isValidUuid(gradingSystemId)) {
      return NextResponse.json({ error: 'Invalid grading system ID format' }, { status: 400 });
    }

    // Create a service role client to bypass RLS issues
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Start a transaction to create exam and related records
    console.log('Creating exam with data:', {
      name: title,
      type: 'formal',
      exam_start_date: dateRange.from,
      exam_end_date: dateRange.to || dateRange.from,
      grading_system_id: gradingSystemId || null,
      created_at: new Date().toISOString()
    });
    
    const { data: exam, error: examError } = await supabaseAdmin
      .from('exams')
      .insert({
        name: title,
        type: 'formal',
        exam_start_date: dateRange.from,
        exam_end_date: dateRange.to || dateRange.from,
        grading_system_id: gradingSystemId || null,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (examError) {
      console.error('Error creating exam:', examError);
      console.error('Exam error details:', JSON.stringify(examError, null, 2));
      return NextResponse.json({ 
        error: 'Failed to create exam', 
        details: examError.message || 'Unknown error',
        code: examError.code || 'NO_CODE'
      }, { status: 500 });
    }

    // Get subject IDs from subject names
    const { data: subjectData, error: subjectError } = await supabaseAdmin
      .from('subjects')
      .select('id, name')
      .in('name', subjects);

    if (subjectError) {
      console.error('Error fetching subjects:', subjectError);
      return NextResponse.json({ error: 'Failed to fetch subjects' }, { status: 500 });
    }

    // Create exam_subjects entries
    const examSubjects = subjectData.map(subject => ({
      exam_id: exam.id,
      subject_id: subject.id
    }));

    const { error: examSubjectsError } = await supabaseAdmin
      .from('exam_subjects')
      .insert(examSubjects);

    if (examSubjectsError) {
      console.error('Error creating exam subjects:', examSubjectsError);
      return NextResponse.json({ error: 'Failed to create exam subjects' }, { status: 500 });
    }

    // Create exam_classes entries with conduct weightages
    const examClasses = classIds.map(classId => ({
      exam_id: exam.id,
      class_id: classId,
      conduct_weightage: conductWeightages[classId] || 0
    }));

    const { error: examClassesError } = await supabaseAdmin
      .from('exam_classes')
      .insert(examClasses);

    if (examClassesError) {
      console.error('Error creating exam classes:', examClassesError);
      return NextResponse.json({ error: 'Failed to create exam classes' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      examId: exam.id,
      message: 'Exam created successfully' 
    });

  } catch (error: unknown) {
    console.error('Error in POST exam-metadata API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update existing exam
export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const examId = searchParams.get('id');
    
    if (!examId) {
      return NextResponse.json({ error: 'Exam ID is required' }, { status: 400 });
    }
    if (!isValidUuid(examId)) {
      return NextResponse.json({ error: 'Invalid exam ID format' }, { status: 400 });
    }

    // Parse raw text first to ensure we can gracefully handle invalid JSON
    const raw = await request.text();
    let body: CreateExamData;
    try {
      body = JSON.parse(raw);
    } catch (e) {
      console.error('Invalid JSON in exam update request:', raw?.slice(0, 500));
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { title, subjects, classIds, dateRange, conductWeightages, gradingSystemId } = body;

    if (!title || !subjects.length || !classIds.length || !dateRange.from) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Early validation for UUID formats
    if (!Array.isArray(classIds) || classIds.some((id) => !isValidUuid(id))) {
      return NextResponse.json({ error: 'Invalid class ID format' }, { status: 400 });
    }
    if (gradingSystemId && !isValidUuid(gradingSystemId)) {
      return NextResponse.json({ error: 'Invalid grading system ID format' }, { status: 400 });
    }

    // Create a service role client to bypass RLS issues
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Update the exam
    const { data: exam, error: examError } = await supabaseAdmin
      .from('exams')
      .update({
        name: title,
        exam_start_date: dateRange.from,
        exam_end_date: dateRange.to || dateRange.from,
        grading_system_id: gradingSystemId || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', examId)
      .select()
      .single();

    if (examError) {
      console.error('Error updating exam:', examError);
      return NextResponse.json({ error: 'Failed to update exam' }, { status: 500 });
    }

    // Delete existing exam_subjects and exam_classes
    await Promise.all([
      supabaseAdmin.from('exam_subjects').delete().eq('exam_id', examId),
      supabaseAdmin.from('exam_classes').delete().eq('exam_id', examId)
    ]);

    // Get subject IDs from subject names
    const { data: subjectData, error: subjectError } = await supabaseAdmin
      .from('subjects')
      .select('id, name')
      .in('name', subjects);

    if (subjectError) {
      console.error('Error fetching subjects:', subjectError);
      return NextResponse.json({ error: 'Failed to fetch subjects' }, { status: 500 });
    }

    // Create new exam_subjects entries
    const examSubjects = subjectData.map(subject => ({
      exam_id: examId,
      subject_id: subject.id
    }));

    const { error: examSubjectsError } = await supabaseAdmin
      .from('exam_subjects')
      .insert(examSubjects);

    if (examSubjectsError) {
      console.error('Error creating exam subjects:', examSubjectsError);
      return NextResponse.json({ error: 'Failed to update exam subjects' }, { status: 500 });
    }

    // Create new exam_classes entries with conduct weightages
    const examClasses = classIds.map(classId => ({
      exam_id: examId,
      class_id: classId,
      conduct_weightage: conductWeightages[classId] || 0
    }));

    const { error: examClassesError } = await supabaseAdmin
      .from('exam_classes')
      .insert(examClasses);

    if (examClassesError) {
      console.error('Error creating exam classes:', examClassesError);
      return NextResponse.json({ error: 'Failed to update exam classes' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      examId: exam.id,
      message: 'Exam updated successfully' 
    });

  } catch (error: unknown) {
    console.error('Error in PUT exam-metadata API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete existing exam
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const examId = searchParams.get('id');
    
    if (!examId) {
      return NextResponse.json({ error: 'Exam ID is required' }, { status: 400 });
    }

    // Create a service role client to bypass RLS issues
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Check if exam has any results
    const { data: examResults, error: resultsError } = await supabaseAdmin
      .from('exam_results')
      .select('id')
      .eq('exam_id', examId)
      .limit(1);

    if (resultsError) {
      console.error('Error checking exam results:', resultsError);
      return NextResponse.json({ error: 'Failed to check exam results' }, { status: 500 });
    }

    // Check for cascade parameter
    const cascade = searchParams.get('cascade') === 'true';
    
    if (examResults && examResults.length > 0) {
      if (!cascade) {
        return NextResponse.json({ 
          error: 'Cannot delete exam with existing results. Please remove all student results first.',
          hasResults: true,
          resultsCount: examResults.length
        }, { status: 400 });
      } else {
        // Cascade delete: Delete all related exam results first
        const { error: deleteResultsError } = await supabaseAdmin
          .from('exam_results')
          .delete()
          .eq('exam_id', examId);
        
        if (deleteResultsError) {
          console.error('Error deleting exam results:', deleteResultsError);
          return NextResponse.json({ error: 'Failed to delete exam results' }, { status: 500 });
        }
      }
    }

    // Delete exam and all related records in correct order
    // First delete junction table records
    await Promise.all([
      supabaseAdmin.from('exam_subjects').delete().eq('exam_id', examId),
      supabaseAdmin.from('exam_classes').delete().eq('exam_id', examId)
    ]);

    // Finally delete the exam
    const { error: examError } = await supabaseAdmin
      .from('exams')
      .delete()
      .eq('id', examId);

    if (examError) {
      console.error('Error deleting exam:', examError);
      return NextResponse.json({ error: 'Failed to delete exam' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Exam deleted successfully' 
    });

  } catch (error: unknown) {
    console.error('Error in DELETE exam-metadata API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
