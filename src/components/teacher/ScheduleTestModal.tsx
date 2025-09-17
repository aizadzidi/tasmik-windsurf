"use client";
import React from 'react';

interface ScheduleTestModalProps {
  student: { id: string; name: string };
  onClose: () => void;
  onScheduled?: (session: any) => void;
}

type CountsResponse = {
  capacityPerDay: number;
  countsByDate: Record<string, number>;
  sessions: Array<{ id: string; student_id: string; scheduled_date: string; slot_number: number; status: string; juz_number?: number; notes?: string }>;
};

export default function ScheduleTestModal({ student, onClose, onScheduled }: ScheduleTestModalProps) {
  const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [counts, setCounts] = React.useState<Record<string, number>>({});
  const [capacity, setCapacity] = React.useState(5);
const [selectedDate, setSelectedDate] = React.useState<string>('');
  const [juzNumber, setJuzNumber] = React.useState<number | ''>('');
  const [notes, setNotes] = React.useState('');
  const [activeSession, setActiveSession] = React.useState<any | null>(null);

// Month navigation state
  const [viewMonthStart, setViewMonthStart] = React.useState(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  });

function monthLabel(date: Date) {
    const months = [
      'January','February','March','April','May','June',
      'July','August','September','October','November','December'
    ];
    return `${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  }

  function monthRange(date: Date) {
    const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    return { from: fmt(first), to: fmt(last) };
  }

  async function loadMonth(date: Date) {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = monthRange(date);
      const res = await fetch(`/api/juz-test-schedule?from=${from}&to=${to}`);
      const raw = await res.json();
      if (!res.ok || (raw && (raw as any).error)) throw new Error((raw as any)?.error || 'Failed to load schedule');
      const json = raw as CountsResponse;
      setCounts(json.countsByDate || {});
      setCapacity(json.capacityPerDay || 5);

      // Check if student has active schedule
      const res2 = await fetch(`/api/juz-test-schedule?student_id=${student.id}&activeOnly=1`);
      const json2 = await res2.json();
      const existing = Array.isArray(json2.sessions) ? json2.sessions[0] : (Array.isArray(json2) ? json2[0] : null);
      if (existing) {
        setActiveSession(existing);
        setSelectedDate(existing.scheduled_date);
        setJuzNumber(existing.juz_number || '');
        setNotes(existing.notes || '');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    loadMonth(viewMonthStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id, viewMonthStart]);

  // Build days list for the next 28 days
const days = React.useMemo(() => {
    const start = new Date(Date.UTC(viewMonthStart.getUTCFullYear(), viewMonthStart.getUTCMonth(), 1));
    const end = new Date(Date.UTC(viewMonthStart.getUTCFullYear(), viewMonthStart.getUTCMonth() + 1, 0));
    const out: { key: string; display: string; booked: number }[] = [];
for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
      const day = d.getUTCDay();
      if (day === 0 || day === 6) continue; // weekends
      // Hide past dates (UTC)
      const todayUTC = new Date();
      const todayStart = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), todayUTC.getUTCDate()));
      if (d < todayStart) continue;
      const key = d.toISOString().split('T')[0];
      out.push({ key, display: `${weekdays[d.getUTCDay()]} ${d.getUTCDate()}`, booked: counts[key] || 0 });
    }
    return out;
  }, [viewMonthStart, counts]);

// No slot picking UI; slot will be auto-assigned server-side

  async function submit() {
if (!selectedDate) {
      alert('Please select a date.');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      let res: Response;
      if (activeSession) {
        res = await fetch(`/api/juz-test-schedule?id=${activeSession.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ scheduled_date: selectedDate, status: 'scheduled', notes, juz_number: juzNumber || null }),
        });
      } else {
        res = await fetch('/api/juz-test-schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ student_id: student.id, scheduled_date: selectedDate, juz_number: juzNumber || null, notes }),
        });
      }
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed');
      onScheduled?.(json.session || json);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to schedule');
    } finally {
      setLoading(false);
    }
  }

  async function cancelExisting() {
    if (!activeSession) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/juz-test-schedule?id=${activeSession.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed');
      onScheduled?.(json.session);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to cancel');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-xl">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">{activeSession ? 'Reschedule Juz Test' : 'Schedule Juz Test'}</h2>
          <p className="text-sm text-gray-600 mt-1">Student: <span className="font-medium">{student.name}</span></p>
          {activeSession && (
            <div className="mt-3 bg-purple-50 border border-purple-200 text-purple-800 text-sm rounded px-3 py-2">
              Scheduled on {activeSession.scheduled_date} • Slot {activeSession.slot_number}
            </div>
          )}
        </div>
        <div className="p-4 space-y-4">
          {error && <div className="text-red-600 text-sm">{error}</div>}
          {loading && <div className="text-gray-500 text-sm">Loading...</div>}

{/* Month navigation */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button type="button" className="px-2 py-1 border rounded text-sm" onClick={() => setViewMonthStart(prev => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() - 1, 1)))}>Prev</button>
              <div className="font-medium">{monthLabel(viewMonthStart)}</div>
              <button type="button" className="px-2 py-1 border rounded text-sm" onClick={() => setViewMonthStart(prev => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 1)))}>Next</button>
            </div>
            {/* Jump to month (next 6 months) */}
            <select
              className="border rounded text-sm px-2 py-1"
              value={`${viewMonthStart.getUTCFullYear()}-${viewMonthStart.getUTCMonth()}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split('-').map(Number);
                setViewMonthStart(new Date(Date.UTC(y, m, 1)));
              }}
            >
              {Array.from({ length: 6 }).map((_, i) => {
                const d = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + i, 1));
return (
                  <option key={i} value={`${d.getUTCFullYear()}-${d.getUTCMonth()}`}>{monthLabel(d)}</option>
                );
              })}
            </select>
          </div>

          {/* Find next available */}
          <div className="flex justify-end mt-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  setLoading(true);
                  // Search next 6 months for the first weekday with capacity
                  const start = new Date(viewMonthStart);
                  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 6, 0));
                  const fromStr = monthRange(start).from;
                  const toStr = end.toISOString().split('T')[0];
                  const res = await fetch(`/api/juz-test-schedule?from=${fromStr}&to=${toStr}`);
                  const json: CountsResponse = await res.json();
                  const cap = json.capacityPerDay || 5;
                  let found: string | null = null;
                  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
                    const day = d.getUTCDay();
                    if (day === 0 || day === 6) continue;
                    const key = d.toISOString().split('T')[0];
                    const booked = (json.countsByDate || {})[key] || 0;
                    if (booked < cap) { found = key; break; }
                  }
                  if (found) {
                    setSelectedDate(found);
                    const foundDate = new Date(found + 'T00:00:00Z');
                    setViewMonthStart(new Date(Date.UTC(foundDate.getUTCFullYear(), foundDate.getUTCMonth(), 1)));
                  } else {
                    alert('No available weekday slots found in the next 6 months.');
                  }
                } catch (e: any) {
                  setError(e.message || 'Failed to search availability');
                } finally {
                  setLoading(false);
                }
              }}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Find next available
            </button>
          </div>

          {/* Date grid */}
          <div>
            <label className="text-sm font-medium">Pick a date (capacity {capacity}/day)</label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {days.map(d => {
                const full = (d.booked || 0) >= capacity && !(activeSession && activeSession.scheduled_date === d.key);
                const isSelected = selectedDate === d.key;
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setSelectedDate(d.key)}
                    disabled={full}
className={`px-2 py-2 rounded border text-sm ${full ? 'bg-red-50 border-red-200 text-red-700 cursor-not-allowed' : (d.booked || 0) >= Math.max(1, capacity - 2) ? 'bg-amber-50 border-amber-200' : (d.booked || 0) > 0 ? 'bg-blue-50 border-blue-200' : 'bg-white hover:bg-blue-50'} ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
                    title={`${d.booked || 0}/${capacity} booked`}
                  >
                    <div className="font-medium">{d.display}</div>
                    <div className="text-xs opacity-80">{(d.booked || 0)}/{capacity}</div>
                  </button>
                );
              })}
            </div>
          </div>

{/* Optional fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Juz number (optional)</label>
              <input type="number" min={1} max={30} value={juzNumber} onChange={e => setJuzNumber(e.target.value === '' ? '' : Number(e.target.value))} className="mt-1 w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Notes (optional)</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} className="mt-1 w-full border rounded px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
        <div className="p-4 border-t flex items-center justify-between">
          <div className="flex gap-2">
            {activeSession && (
              <button onClick={cancelExisting} className="px-3 py-2 rounded bg-red-100 text-red-700 text-sm hover:bg-red-200">Cancel</button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-2 rounded bg-gray-100 text-gray-700 text-sm hover:bg-gray-200">Close</button>
<button onClick={submit} disabled={loading || !selectedDate} className="px-3 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-50">{activeSession ? 'Reschedule' : 'Schedule'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}