import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { examId, released } = await request.json();
    if (!examId || typeof released !== 'boolean') {
      return NextResponse.json({ error: 'examId and released are required' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { error } = await supabaseAdmin
      .from('exams')
      .update({ released, released_at: released ? new Date().toISOString() : null })
      .eq('id', examId);

    if (error) {
      console.error('Failed to toggle exam release:', error);
      return NextResponse.json({ error: 'Failed to toggle release' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Error in exam-release API:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

