import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';

// Helper: parse YYYY-MM-DD safely
function toDateOnlyString(d: Date) {
  return d.toISOString().split('T')[0];
}

function isWeekend(dateStr: string) {
  // Force UTC to avoid tz drift
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0=Sun,6=Sat
  return day === 0 || day === 6;
}

async function pickFirstAvailableSlot(client: any, dateStr: string, excludeSessionId?: string) {
  const { data: existing, error } = await client
    .from('test_sessions')
    .select('id, slot_number')
    .eq('scheduled_date', dateStr)
    .neq('status', 'cancelled');
  if (error) throw error;
  const used = new Set<number>();
  for (const row of existing || []) {
    if (excludeSessionId && row.id === excludeSessionId) continue;
    used.add(row.slot_number);
  }
  for (let slot = 1; slot <= 5; slot++) {
    if (!used.has(slot)) return slot;
  }
  return null; // full
}

// GET
// - ?from=YYYY-MM-DD&to=YYYY-MM-DD to fetch sessions window
// - ?student_id=... to fetch a student's sessions (optionally activeOnly=1)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const studentId = searchParams.get('student_id');
    const activeOnly = searchParams.get('activeOnly') === '1';
    const studentIdsCsv = searchParams.get('student_ids');

    const result = await adminOperationSimple(async (client) => {
      if (studentId) {
        let query = client
          .from('test_sessions')
.select('id, student_id, scheduled_date, slot_number, status, juz_number, notes, students(name, users!assigned_teacher_id(name))')
          .eq('student_id', studentId)
          .order('scheduled_date', { ascending: true })
          .order('slot_number', { ascending: true });
        if (activeOnly) {
          query = query.in('status', ['scheduled', 'reschedule_requested']);
        }
        const { data, error } = await query;
        if (error) throw error;
        return { sessions: data, countsByDate: {}, capacityPerDay: 5 };
      }

      // Bulk active schedule lookup by student IDs
      if (studentIdsCsv) {
        const ids = studentIdsCsv.split(',').map(s => s.trim()).filter(Boolean);
        if (ids.length === 0) return { sessions: [], countsByDate: {}, capacityPerDay: 5, activeByStudent: {} };
        let query = client
          .from('test_sessions')
          .select('student_id, scheduled_date, slot_number, status')
          .in('student_id', ids)
          .in('status', ['scheduled','reschedule_requested'])
          .order('scheduled_date', { ascending: true })
          .order('slot_number', { ascending: true });
        const { data, error } = await query;
        if (error) throw error;
        const map: Record<string, any> = {};
        for (const row of data || []) {
          // Keep earliest upcoming by default
          if (!map[row.student_id]) map[row.student_id] = row;
        }
        return { sessions: data, countsByDate: {}, capacityPerDay: 5, activeByStudent: map };
      }

      // Default: date range view
      const fromDate = from ? new Date(from) : new Date();
      const toDate = to ? new Date(to) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const { data, error } = await client
        .from('test_sessions')
        .select('id, student_id, scheduled_date, slot_number, status, juz_number, notes, students(name, users!assigned_teacher_id(name))')
        .gte('scheduled_date', toDateOnlyString(fromDate))
        .lte('scheduled_date', toDateOnlyString(toDate))
        .neq('status', 'cancelled')
        .order('scheduled_date', { ascending: true })
        .order('slot_number', { ascending: true });
      if (error) throw error;

      // Build counts per day
      const counts: Record<string, number> = {};
      for (const row of data || []) {
        const key = row.scheduled_date as string;
        counts[key] = (counts[key] || 0) + 1;
      }

      return { sessions: data, countsByDate: counts, capacityPerDay: 5 };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Schedule GET error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch schedule' }, { status: 500 });
  }
}

// POST - create a session
// Body: { student_id, scheduled_date(YYYY-MM-DD), slot_number(1..5), juz_number?, notes?, requested_by? }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { student_id, scheduled_date, slot_number, juz_number, notes, requested_by } = body || {};

if (!student_id || !scheduled_date) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const data = await adminOperationSimple(async (client) => {
// Block weekends
      if (isWeekend(scheduled_date)) {
        throw new Error('Scheduling is only allowed Monday–Friday.');
      }

      // optional guard: prevent multiple active bookings for same student
      const { data: existing, error: exErr } = await client
        .from('test_sessions')
        .select('id')
        .eq('student_id', student_id)
        .in('status', ['scheduled', 'reschedule_requested']);
      if (exErr) throw exErr;
      if (existing && existing.length > 0) {
        throw new Error('Student already has an active scheduled session. Please reschedule or cancel it first.');
      }

// Auto-pick earliest available slot if none provided
      let finalSlot = slot_number;
      if (!finalSlot) {
        const picked = await pickFirstAvailableSlot(client, scheduled_date);
        if (!picked) {
          throw new Error('Selected day is full. Please choose another day.');
        }
        finalSlot = picked;
      }

      const { data, error } = await client
        .from('test_sessions')
        .insert([{ student_id, scheduled_date, slot_number: finalSlot, juz_number, notes, scheduled_by: requested_by }])
        .select();
      if (error) {
        if ((error as any)?.code === '23505') {
          throw new Error('That slot is already booked for the selected day. Please choose another slot.');
        }
        throw error;
      }
      return data?.[0];
    });

    return NextResponse.json({ success: true, session: data }, { status: 201 });
  } catch (error: any) {
    console.error('Schedule POST error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create session' }, { status: 500 });
  }
}

// PATCH - update a session (reschedule, cancel, mark completed)
// Query: ?id=...  Body allows: { scheduled_date?, slot_number?, status?, notes? }
export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const body = await request.json();
    const allowed: any = {};
    if (body.scheduled_date) allowed.scheduled_date = body.scheduled_date;
    if (body.slot_number) allowed.slot_number = body.slot_number;
    if (body.status) allowed.status = body.status;
    if (body.notes !== undefined) allowed.notes = body.notes;

    const data = await adminOperationSimple(async (client) => {
// Fetch current session
      const { data: current, error: currentErr } = await client
        .from('test_sessions')
        .select('id, scheduled_date, slot_number')
        .eq('id', id)
        .single();
      if (currentErr) throw currentErr;

      // Weekend guard on date change
      const nextDate = (allowed as any).scheduled_date || (current as any)?.scheduled_date;
      if (nextDate && isWeekend(nextDate)) {
        throw new Error('Scheduling is only allowed Monday–Friday.');
      }

      // If changing date and slot not provided, pick first available
      if (!allowed.slot_number && allowed.scheduled_date && allowed.scheduled_date !== (current as any)?.scheduled_date) {
        const picked = await pickFirstAvailableSlot(client, allowed.scheduled_date, id as string);
        if (!picked) throw new Error('Selected day is full. Please choose another day.');
        allowed.slot_number = picked;
      }

      const { data, error } = await client
        .from('test_sessions')
        .update(allowed)
        .eq('id', id)
        .select();
      if (error) {
        if ((error as any)?.code === '23505') {
          throw new Error('Selected slot is no longer available. Please choose another.');
        }
        throw error;
      }
      return data?.[0];
    });

    return NextResponse.json({ success: true, session: data });
  } catch (error: any) {
    console.error('Schedule PATCH error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update session' }, { status: 500 });
  }
}

// DELETE - cancel a session (alias of setting status=cancelled)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const data = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from('test_sessions')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .select();
      if (error) throw error;
      return data?.[0];
    });

    return NextResponse.json({ success: true, session: data });
  } catch (error: any) {
    console.error('Schedule DELETE error:', error);
    return NextResponse.json({ error: error.message || 'Failed to cancel session' }, { status: 500 });
  }
}