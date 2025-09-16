import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';

function formatDateTime(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) + 'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) + 'Z'
  );
}

export async function GET(request: NextRequest) {
  try {
// Next 180 days
    const from = new Date();
const to = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
    const toISO = (d: Date) => d.toISOString().split('T')[0];

    const data = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from('test_sessions')
        .select('id, scheduled_date, slot_number, status, juz_number, students(name)')
        .gte('scheduled_date', toISO(from))
        .lte('scheduled_date', toISO(to))
        .neq('status', 'cancelled')
        .order('scheduled_date', { ascending: true })
        .order('slot_number', { ascending: true });
      if (error) throw error;
      return data || [];
    });

    // Map slot to a time for nicer calendar display
    const slotToTime = (slot: number) => {
      const base = new Date(Date.UTC(1970, 0, 1, 9, 0, 0)); // 09:00Z
      base.setUTCHours(9 + (slot - 1)); // 9..13 for slot 1..5
      return base;
    };

    let ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Tasmik Windsurf//Juz Test Schedule//EN\nCALSCALE:GREGORIAN\nMETHOD:PUBLISH\n';
    for (const row of data) {
      const [y, m, d] = (row.scheduled_date as string).split('-').map((x: string) => parseInt(x, 10));
      const start = new Date(Date.UTC(y, (m - 1), d, 0, 0, 0));
      const time = slotToTime((row.slot_number as number) || 1);
      // Combine date and slot time (UTC)
      start.setUTCHours(time.getUTCHours(), 0, 0, 0);
      const end = new Date(start.getTime() + 45 * 60 * 1000); // 45 min slot
      const title = `Juz Test - ${(row as any).students?.name || 'Student'} (Slot ${row.slot_number})`;
      const desc = `Status: ${row.status}${row.juz_number ? `\\nJuz: ${row.juz_number}` : ''}`;

      ics += 'BEGIN:VEVENT\n';
      ics += `UID:${row.id}@tasmik-windsurf\n`;
      ics += `DTSTAMP:${formatDateTime(new Date())}\n`;
      ics += `DTSTART:${formatDateTime(start)}\n`;
      ics += `DTEND:${formatDateTime(end)}\n`;
      ics += `SUMMARY:${title}\n`;
      ics += `DESCRIPTION:${desc}\n`;
      ics += 'END:VEVENT\n';
    }
    ics += 'END:VCALENDAR\n';

    return new NextResponse(ics, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="juz-tests.ics"'
      }
    });
  } catch (error: any) {
    console.error('ICS error:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate ICS' }, { status: 500 });
  }
}