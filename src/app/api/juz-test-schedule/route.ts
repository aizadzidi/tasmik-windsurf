import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';
import { ok } from '@/types/http';

type TestSessionRow = {
  id: string;
  student_id: string;
  scheduled_date: string;
  slot_number: number | null;
  status: string | null;
  juz_number?: number | string | null;
  notes?: string | null;
  tenant_id?: string | null;
  students?: {
    name?: string | null;
    users?: {
      name?: string | null;
    } | null;
  } | null;
};

type BasicSessionRow = Pick<TestSessionRow, 'id' | 'student_id' | 'scheduled_date' | 'slot_number' | 'status'>;
type SessionUpdatePayload = Partial<Pick<TestSessionRow, 'scheduled_date' | 'slot_number' | 'status' | 'notes' | 'juz_number'>>;
type StudentLookupRow = { id: string; name: string | null; tenant_id?: string | null };
type TeacherLookupRow = { id: string; name: string | null; role: string | null };

const getPostgrestCode = (error: unknown) => {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: string }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
};

const isNotificationMetadataMissingSchema = (error: unknown) => {
  const code = getPostgrestCode(error);
  if (code === 'PGRST204') return true;
  if (!(error && typeof error === 'object' && 'message' in error)) return false;
  const message = String((error as { message?: unknown }).message || '');
  return /notification_type|session_id|scheduled_date|slot_number/i.test(message);
};

const toSuggestedJuz = (raw: unknown): number => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 1;
  const rounded = Math.round(parsed);
  if (rounded < 1) return 1;
  if (rounded > 30) return 30;
  return rounded;
};

const buildTeacherBookingNotes = (session: TestSessionRow) => {
  const bookedDate = session.scheduled_date;
  const slotText = typeof session.slot_number === 'number' ? `Slot ${session.slot_number}` : null;
  const summary = [bookedDate, slotText].filter(Boolean).join(' • ');
  const cleanNotes = typeof session.notes === 'string' ? session.notes.trim() : '';
  return cleanNotes ? `${summary}\n${cleanNotes}` : summary;
};

async function createTeacherBookingNotification(params: {
  client: SupabaseClient;
  requestedBy: string | null | undefined;
  tenantId: string;
  studentId: string;
  studentName: string;
  session: TestSessionRow;
}) {
  const { client, requestedBy, tenantId, studentId, studentName, session } = params;
  if (!requestedBy) return;

  const { data: teacherRaw, error: teacherError } = await client
    .from('users')
    .select('id, name, role')
    .eq('id', requestedBy)
    .maybeSingle();
  if (teacherError) {
    console.error('Teacher lookup error for schedule notification:', teacherError);
    return;
  }
  const teacher = teacherRaw as TeacherLookupRow | null;
  if (!teacher || teacher.role !== 'teacher') {
    return;
  }

  const payloadBase = {
    tenant_id: tenantId,
    teacher_id: teacher.id,
    teacher_name: teacher.name || 'Unknown Teacher',
    student_id: studentId,
    student_name: studentName || 'Unknown Student',
    suggested_juz: toSuggestedJuz(session.juz_number),
    status: 'pending' as const,
    teacher_notes: buildTeacherBookingNotes(session),
  };
  const payloadWithMetadata = {
    ...payloadBase,
    notification_type: 'teacher_booking' as const,
    session_id: session.id,
    scheduled_date: session.scheduled_date,
    slot_number: session.slot_number,
  };

  const { error: insertError } = await client
    .from('juz_test_notifications')
    .insert([payloadWithMetadata]);

  if (!insertError) return;

  if (!isNotificationMetadataMissingSchema(insertError)) {
    console.error('Teacher booking notification insert error:', insertError);
    return;
  }

  const { error: fallbackError } = await client
    .from('juz_test_notifications')
    .insert([payloadBase]);
  if (fallbackError) {
    console.error('Teacher booking notification fallback insert error:', fallbackError);
  }
}

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

async function pickFirstAvailableSlot(
  client: SupabaseClient,
  dateStr: string,
  tenantId: string,
  excludeSessionId?: string
) {
  const { data: existing, error } = await client
    .from('test_sessions')
    .select('id, slot_number')
    .eq('scheduled_date', dateStr)
    .eq('tenant_id', tenantId)
    .neq('status', 'cancelled');
  if (error) throw error;
  const used = new Set<number>();
  const existingRows = (existing ?? []) as Array<Pick<TestSessionRow, 'id' | 'slot_number'>>;
  for (const row of existingRows) {
    if (excludeSessionId && row.id === excludeSessionId) continue;
    if (typeof row.slot_number === 'number') {
      used.add(row.slot_number);
    }
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
        const rows = (data ?? []) as TestSessionRow[];
        return { sessions: rows, countsByDate: {}, capacityPerDay: 5 };
      }

      // Bulk active schedule lookup by student IDs
      if (studentIdsCsv) {
        const ids = studentIdsCsv.split(',').map(s => s.trim()).filter(Boolean);
        if (ids.length === 0) return { sessions: [], countsByDate: {}, capacityPerDay: 5, activeByStudent: {} };
        const query = client
          .from('test_sessions')
          .select('student_id, scheduled_date, slot_number, status')
          .in('student_id', ids)
          .in('status', ['scheduled','reschedule_requested'])
          .order('scheduled_date', { ascending: true })
          .order('slot_number', { ascending: true });
        const { data, error } = await query;
        if (error) throw error;
        const rows = (data ?? []) as BasicSessionRow[];
        const map: Record<string, BasicSessionRow> = {};
        for (const row of rows) {
          // Keep earliest upcoming by default
          if (!map[row.student_id]) map[row.student_id] = row;
        }
        return { sessions: rows, countsByDate: {}, capacityPerDay: 5, activeByStudent: map };
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
      const rows = (data ?? []) as TestSessionRow[];
      const counts: Record<string, number> = {};
      for (const row of rows) {
        const key = row.scheduled_date as string;
        counts[key] = (counts[key] || 0) + 1;
      }

      return { sessions: rows, countsByDate: counts, capacityPerDay: 5 };
    });

    const payload = ok(result);
    return NextResponse.json(payload.data);
  } catch (error: unknown) {
    console.error('Schedule GET error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch schedule';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST - create a session
// Body: { student_id, scheduled_date(YYYY-MM-DD), slot_number(1..5), juz_number?, notes?, requested_by? }
type SessionRequestBody = {
  student_id?: string;
  scheduled_date?: string;
  slot_number?: number | null;
  juz_number?: number | null;
  notes?: string | null;
  requested_by?: string | null;
};

type SessionPatchBody = {
  scheduled_date?: string;
  slot_number?: number | null;
  status?: string;
  notes?: string | null;
  juz_number?: number | null;
  requested_by?: string | null;
};

function isSessionPatchBody(value: unknown): value is SessionPatchBody {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (
    record.scheduled_date !== undefined &&
    typeof record.scheduled_date !== 'string'
  ) {
    return false;
  }
  if (
    record.slot_number !== undefined &&
    record.slot_number !== null &&
    typeof record.slot_number !== 'number'
  ) {
    return false;
  }
  if (record.status !== undefined && typeof record.status !== 'string') {
    return false;
  }
  if (
    record.notes !== undefined &&
    record.notes !== null &&
    typeof record.notes !== 'string'
  ) {
    return false;
  }
  if (
    record.juz_number !== undefined &&
    record.juz_number !== null &&
    typeof record.juz_number !== 'number'
  ) {
    return false;
  }
  if (
    record.requested_by !== undefined &&
    record.requested_by !== null &&
    typeof record.requested_by !== 'string'
  ) {
    return false;
  }
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SessionRequestBody;
    const { student_id, scheduled_date, slot_number, juz_number, notes, requested_by } = body || {};

if (!student_id || !scheduled_date) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const data = await adminOperationSimple(async (client) => {
      const { data: studentRowRaw, error: studentErr } = await client
        .from('students')
        .select('id, name, tenant_id')
        .eq('id', student_id)
        .single();
      if (studentErr) throw studentErr;
      const studentRow = studentRowRaw as StudentLookupRow | null;
      const tenantId = studentRow?.tenant_id;
      if (!tenantId) {
        throw new Error('Student tenant not found.');
      }

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
        const picked = await pickFirstAvailableSlot(client, scheduled_date, tenantId);
        if (!picked) {
          throw new Error('Selected day is full. Please choose another day.');
        }
        finalSlot = picked;
      }

      const { data, error } = await client
        .from('test_sessions')
        .insert([{
          student_id,
          scheduled_date,
          slot_number: finalSlot,
          juz_number,
          notes,
          scheduled_by: requested_by,
          tenant_id: tenantId
        }])
        .select();
      if (error) {
        if (getPostgrestCode(error) === '23505') {
          throw new Error('That slot is already booked for the selected day. Please choose another slot.');
        }
        throw error;
      }
      const createdSession = (data ?? [])[0] as TestSessionRow | undefined;
      if (createdSession) {
        await createTeacherBookingNotification({
          client,
          requestedBy: requested_by,
          tenantId,
          studentId: student_id,
          studentName: studentRow?.name || 'Unknown Student',
          session: createdSession,
        });
      }
      return createdSession;
    });

    return NextResponse.json({ success: true, session: data }, { status: 201 });
  } catch (error: unknown) {
    console.error('Schedule POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create session';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH - update a session (reschedule, cancel, mark completed)
// Query: ?id=...  Body allows: { scheduled_date?, slot_number?, status?, notes? }
export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const rawBody = await request.json();
    if (!isSessionPatchBody(rawBody)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const body = rawBody;
    const requestedBy = body.requested_by ?? null;
    const allowed: SessionUpdatePayload = {};
    if (body.scheduled_date) allowed.scheduled_date = body.scheduled_date;
    if (body.slot_number !== undefined) allowed.slot_number = body.slot_number;
    if (body.status) allowed.status = body.status;
    if (body.notes !== undefined) allowed.notes = body.notes;
    if (body.juz_number !== undefined) allowed.juz_number = body.juz_number;

    const data = await adminOperationSimple(async (client) => {
// Fetch current session
      const { data: current, error: currentErr } = await client
        .from('test_sessions')
        .select('id, student_id, scheduled_date, slot_number, tenant_id')
        .eq('id', id)
        .single();
      if (currentErr) throw currentErr;
      const currentSession = current as (BasicSessionRow & { tenant_id?: string | null }) | null;

      // Weekend guard on date change
      const nextDate = allowed.scheduled_date || currentSession?.scheduled_date;
      if (nextDate && isWeekend(nextDate)) {
        throw new Error('Scheduling is only allowed Monday–Friday.');
      }

      // If changing date and slot not provided, pick first available
      if (!allowed.slot_number && allowed.scheduled_date && allowed.scheduled_date !== currentSession?.scheduled_date) {
        const tenantId = currentSession?.tenant_id;
        if (!tenantId) {
          throw new Error('Session tenant not found.');
        }
        const picked = await pickFirstAvailableSlot(client, allowed.scheduled_date, tenantId, id as string);
        if (!picked) throw new Error('Selected day is full. Please choose another day.');
        allowed.slot_number = picked;
      }

      const { data, error } = await client
        .from('test_sessions')
        .update(allowed)
        .eq('id', id)
        .select();
      if (error) {
        if (getPostgrestCode(error) === '23505') {
          throw new Error('Selected slot is no longer available. Please choose another.');
        }
        throw error;
      }
      const updatedSession = (data ?? [])[0] as TestSessionRow | undefined;
      if (updatedSession && requestedBy) {
        const shouldNotify =
          updatedSession.status === 'scheduled' ||
          updatedSession.status === 'reschedule_requested';
        if (shouldNotify) {
          const studentId = updatedSession.student_id || currentSession?.student_id;
          const tenantId = updatedSession.tenant_id || currentSession?.tenant_id;
          if (studentId && tenantId) {
            const { data: studentRaw, error: studentError } = await client
              .from('students')
              .select('name')
              .eq('id', studentId)
              .maybeSingle();
            if (studentError) {
              console.error('Student lookup error for schedule notification:', studentError);
            }
            const studentName = ((studentRaw as { name?: string | null } | null)?.name) || 'Unknown Student';
            await createTeacherBookingNotification({
              client,
              requestedBy,
              tenantId,
              studentId,
              studentName,
              session: updatedSession,
            });
          }
        }
      }
      return updatedSession;
    });

    return NextResponse.json({ success: true, session: data });
  } catch (error: unknown) {
    console.error('Schedule PATCH error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update session';
    return NextResponse.json({ error: message }, { status: 500 });
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
  } catch (error: unknown) {
    console.error('Schedule DELETE error:', error);
    const message = error instanceof Error ? error.message : 'Failed to cancel session';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
