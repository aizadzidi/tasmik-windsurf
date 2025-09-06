import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Fetch all conduct criteria for teachers
export async function GET() {
  try {
    const { data: criterias, error } = await supabase
      .from('conduct_criterias')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching conduct criteria:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, criterias: criterias || [] });
  } catch (error) {
    console.error('Unexpected error fetching conduct criteria:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}