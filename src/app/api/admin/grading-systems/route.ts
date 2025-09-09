import { NextResponse } from "next/server";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";

type GradeEntry = {
  letter?: string;
  grade?: string;
  min: number;
  max: number;
  gpa?: number;
};

type GradingScale = {
  type: 'letter' | 'percentage' | 'pass_fail';
  grades: GradeEntry[];
};

function validateGradingScale(scale: GradingScale): { ok: true } | { ok: false; message: string } {
  if (!scale || !['letter', 'percentage', 'pass_fail'].includes(scale.type)) {
    return { ok: false, message: 'Invalid grading scale type' };
  }
  if (!Array.isArray(scale.grades) || scale.grades.length === 0) {
    return { ok: false, message: 'Grades are required' };
  }
  const grades = [...scale.grades].sort((a, b) => (a.min ?? 0) - (b.min ?? 0));
  for (let i = 0; i < grades.length; i++) {
    const g = grades[i];
    const hasLabel = scale.type === 'letter' ? !!g.letter && g.letter.trim() !== '' : !!g.grade && g.grade.trim() !== '';
    if (!hasLabel) {
      return { ok: false, message: `Grade #${i + 1} is missing a label` };
    }
    if (
      typeof g.min !== 'number' || typeof g.max !== 'number' ||
      Number.isNaN(g.min) || Number.isNaN(g.max)
    ) {
      return { ok: false, message: `Grade #${i + 1} has invalid bounds` };
    }
    if (g.min < 0 || g.max > 100) {
      return { ok: false, message: `Grade #${i + 1} must be within 0-100` };
    }
    if (g.min >= g.max) {
      return { ok: false, message: `Grade #${i + 1}: min must be less than max` };
    }
    if (i < grades.length - 1) {
      const n = grades[i + 1];
      if (g.min <= n.max && g.max >= n.min) {
        return { ok: false, message: `Grade #${i + 1} overlaps with the next range` };
      }
    }
  }
  return { ok: true };
}

// POST - Create a grading system (admin only via service role client)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, grading_scale } = body || {};

    if (!name || !grading_scale) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const validation = validateGradingScale(grading_scale as GradingScale);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.message }, { status: 400 });
    }

    const result = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from('grading_systems')
        .insert({
          name: String(name),
          description: description ? String(description) : null,
          grading_scale: grading_scale,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error creating grading system:', error);
    const msg = error?.message || 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PUT - Update a grading system by id (admin only via service role client)
export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing grading system id' }, { status: 400 });
    }

    const body = await request.json();
    const { name, description, grading_scale } = body || {};

    if (!name || !grading_scale) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const validation = validateGradingScale(grading_scale as GradingScale);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.message }, { status: 400 });
    }

    const result = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from('grading_systems')
        .update({
          name: String(name),
          description: description ? String(description) : null,
          grading_scale: grading_scale,
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error updating grading system:', error);
    const msg = error?.message || 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE - Delete a grading system by id (admin only via service role client)
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing grading system id' }, { status: 400 });
    }

    await adminOperationSimple(async (client) => {
      const { error } = await client
        .from('grading_systems')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return null;
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting grading system:', error);
    const code = error?.code || '';
    if (code === '23503') {
      return NextResponse.json({ error: 'Grading system is in use by one or more exams', code }, { status: 400 });
    }
    const msg = error?.message || 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
