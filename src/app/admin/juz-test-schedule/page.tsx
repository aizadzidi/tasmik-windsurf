"use client";
import React from 'react';
import AdminNavbar from '@/components/admin/AdminNavbar';
import AdminScheduleTestModal from '@/components/admin/AdminScheduleTestModal';
import { Card } from '@/components/ui/Card';

export default function AdminJuzTestSchedulePage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [counts, setCounts] = React.useState<Record<string, number>>({});
  const [capacity, setCapacity] = React.useState(5);
  const [sessions, setSessions] = React.useState<any[]>([]);
  const [selectedDate, setSelectedDate] = React.useState<string>('');
  const [showScheduleModal, setShowScheduleModal] = React.useState(false);
  const [toast, setToast] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

// Month navigation
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
    const { from, to } = monthRange(date);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/juz-test-schedule?from=${from}&to=${to}`);
      const raw = await res.json();
      if (!res.ok || (raw && (raw as any).error)) throw new Error((raw as any)?.error || 'Failed to load');
      const json = raw as { countsByDate?: Record<string, number>; capacityPerDay?: number; sessions?: any[] };
      setCounts(json.countsByDate || {});
      setCapacity(json.capacityPerDay || 5);
      setSessions(json.sessions || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { loadMonth(viewMonthStart); }, [viewMonthStart]);

  const days = React.useMemo(() => {
    const start = new Date(Date.UTC(viewMonthStart.getUTCFullYear(), viewMonthStart.getUTCMonth(), 1));
    const end = new Date(Date.UTC(viewMonthStart.getUTCFullYear(), viewMonthStart.getUTCMonth() + 1, 0));
    const out: { key: string; display: string; booked: number }[] = [];
    for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
      const day = d.getUTCDay();
      if (day === 0 || day === 6) continue;
      const key = d.toISOString().split('T')[0];
const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    out.push({ key, display: `${weekdays[d.getUTCDay()]} ${d.getUTCDate()}`, booked: counts[key] || 0 });
    }
    return out;
  }, [viewMonthStart, counts]);

  const listForDay = React.useMemo(() => sessions.filter((s: any) => s.scheduled_date === selectedDate), [sessions, selectedDate]);

  async function updateStatus(id: string, status: 'completed' | 'reschedule_requested' | 'cancelled') {
    try {
      const res = await fetch(`/api/juz-test-schedule?id=${id}`, { method: status === 'cancelled' ? 'DELETE' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: status === 'cancelled' ? undefined : JSON.stringify({ status }) });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed');
      await loadMonth(viewMonthStart);
      setToast({ type: 'success', message: 'Updated successfully' });
    } catch (e) {
      setToast({ type: 'error', message: (e as any).message || 'Update failed' });
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9]">
      <AdminNavbar />
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Juz Test Schedule</h1>
          <a href="/api/juz-test-schedule/ics" className="text-blue-600 hover:text-blue-800 text-sm font-medium">Subscribe (ICS)</a>
        </div>

        {error && <div className="text-red-600 mb-4">{error}</div>}
        {loading && <div className="text-gray-600 mb-4">Loading...</div>}

<Card className="p-4 mb-6">
          {/* Month Controls */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button className="px-2 py-1 border rounded text-sm" onClick={() => setViewMonthStart(prev => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() - 1, 1)))}>Prev</button>
              <div className="font-medium">{monthLabel(viewMonthStart)}</div>
              <button className="px-2 py-1 border rounded text-sm" onClick={() => setViewMonthStart(prev => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 1)))}>Next</button>
            </div>
            <div className="flex items-center gap-2">
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
              <button
                className="text-xs text-blue-600 hover:text-blue-800"
                onClick={async () => {
                  try {
                    setLoading(true);
                    const start = new Date(viewMonthStart);
                    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 6, 0));
                    const res = await fetch(`/api/juz-test-schedule?from=${monthRange(start).from}&to=${end.toISOString().split('T')[0]}`);
                    const json = await res.json();
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
                      const f = new Date(found + 'T00:00:00Z');
                      setViewMonthStart(new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), 1)));
                    } else {
                      alert('No available weekday slots in the next 6 months.');
                    }
                  } catch (e) {
                    alert('Failed to search availability');
                  } finally {
                    setLoading(false);
                  }
                }}
              >Find next available</button>
            </div>
          </div>

          <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
            {days.map(d => {
              const full = (d.booked || 0) >= capacity;
              const dense = (d.booked || 0) >= Math.max(1, capacity - 2) && !full;
              const some = (d.booked || 0) > 0 && !dense && !full;
              const isSelected = selectedDate === d.key;
              return (
                <button key={d.key} onClick={() => setSelectedDate(d.key)} className={`px-3 py-3 rounded border text-sm ${isSelected ? 'ring-2 ring-blue-500' : ''} ${full ? 'bg-red-50 border-red-200 text-red-700' : dense ? 'bg-amber-50 border-amber-200' : some ? 'bg-blue-50 border-blue-200' : 'bg-white hover:bg-blue-50'}`}>
                  <div className="font-medium">{d.display}</div>
                  <div className="text-xs opacity-80">{(d.booked || 0)}/{capacity}</div>
                </button>
              );
            })}
          </div>
        </Card>

        {selectedDate && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Sessions on {selectedDate}</h2>
              <button
                onClick={() => setShowScheduleModal(true)}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
              >
                Schedule Session
              </button>
            </div>
            {listForDay.length === 0 ? (
              <div className="text-gray-600">No sessions scheduled.</div>
            ) : (
              <div className="space-y-2">
                {listForDay.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between border rounded p-2">
                    <div>
                      <div className="font-medium">Slot {s.slot_number} • {s.students?.name || 'Student'}</div>
                      {s.students?.users?.name && (
                        <div className="text-xs text-gray-500">Teacher: {s.students.users.name}</div>
                      )}
                      <div className="text-xs text-gray-600">Status: {s.status}{s.juz_number ? ` • Juz ${s.juz_number}` : ''}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => updateStatus(s.id, 'completed')} className="px-2 py-1 text-xs rounded bg-green-100 text-green-700 hover:bg-green-200">Mark Completed</button>
                      <button onClick={() => updateStatus(s.id, 'reschedule_requested')} className="px-2 py-1 text-xs rounded bg-amber-100 text-amber-700 hover:bg-amber-200">Request Reschedule</button>
                      <button onClick={() => updateStatus(s.id, 'cancelled')} className="px-2 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200">Cancel</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-2 rounded shadow-md text-sm ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.message}
        </div>
      )}

      {showScheduleModal && selectedDate && (
        <AdminScheduleTestModal
          date={selectedDate}
          onClose={() => setShowScheduleModal(false)}
          onScheduled={async () => { setToast({ type: 'success', message: 'Scheduled successfully' }); await loadMonth(viewMonthStart); }}
        />
      )}
    </div>
  );
}
