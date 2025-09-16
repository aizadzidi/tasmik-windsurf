"use client";
import React from 'react';

interface AdminScheduleTestModalProps {
  date: string; // YYYY-MM-DD
  onClose: () => void;
  onScheduled?: (session: any) => void;
}

export default function AdminScheduleTestModal({ date, onClose, onScheduled }: AdminScheduleTestModalProps) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [students, setStudents] = React.useState<Array<{ id: string; name: string }>>([]);
  const [query, setQuery] = React.useState('');
  const [selectedId, setSelectedId] = React.useState<string>('');
  const [juzNumber, setJuzNumber] = React.useState<number | ''>('');
  const [notes, setNotes] = React.useState('');

  React.useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/students');
        const list = await res.json();
        setStudents(Array.isArray(list) ? list.map((s: any) => ({ id: s.id, name: s.name })) : []);
      } catch (e: any) {
        setError(e.message || 'Failed to load students');
      }
    }
    load();
  }, []);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students.slice(0, 20);
    return students.filter(s => s.name.toLowerCase().includes(q)).slice(0, 20);
  }, [students, query]);

  async function submit() {
    if (!selectedId) { setError('Please select a student'); return; }
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/juz-test-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: selectedId, scheduled_date: date, juz_number: juzNumber || null, notes })
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed to schedule');
      onScheduled?.(json.session);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to schedule');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Schedule Session • {date}</h2>
        </div>
        <div className="p-4 space-y-4">
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <div>
            <label className="text-sm font-medium">Search student</label>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Type a name..." className="mt-1 w-full border rounded px-3 py-2 text-sm" />
          </div>
          <div className="max-h-64 overflow-auto border rounded">
            {filtered.length === 0 ? (
              <div className="p-3 text-sm text-gray-500">No students found</div>
            ) : (
              <ul>
                {filtered.map(s => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(s.id)}
                      className={`w-full text-left px-3 py-2 text-sm ${selectedId === s.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    >
                      {s.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded bg-gray-100 text-gray-700 text-sm hover:bg-gray-200">Close</button>
          <button onClick={submit} disabled={loading || !selectedId} className="px-3 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-50">Schedule</button>
        </div>
      </div>
    </div>
  );
}
