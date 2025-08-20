import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';

// GET - Fetch all classes (admin only)
export async function GET() {
  try {
    const data = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from('classes')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    });
    
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Admin classes fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch classes' },
      { status: error.message.includes('Admin access required') ? 403 : 500 }
    );
  }
}

// POST - Create new class (admin only)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Class name is required' },
        { status: 400 }
      );
    }

    const data = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from('classes')
        .insert([{ name }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    });
    
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Admin class creation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create class' },
      { status: error.message.includes('Admin access required') ? 403 : 500 }
    );
  }
}