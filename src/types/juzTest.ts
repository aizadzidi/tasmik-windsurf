export type JuzTestStatus = 'scheduled' | 'reschedule_requested' | 'completed' | 'cancelled';

export type JuzTestSession = {
  id: string;
  slot_number: number;
  scheduled_date: string;
  status: JuzTestStatus;
  juz_number?: number | null;
  notes?: string | null;
  students?: {
    name?: string | null;
    users?: { name?: string | null } | null;
  } | null;
};
