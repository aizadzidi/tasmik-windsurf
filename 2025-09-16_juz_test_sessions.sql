-- Juz Test Sessions Scheduling
-- Run this in Supabase SQL editor or via your migration process

-- 1) Status enum
DO $$ BEGIN
  CREATE TYPE test_session_status AS ENUM (
    'scheduled',
    'completed',
    'reschedule_requested',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2) Table
CREATE TABLE IF NOT EXISTS test_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  slot_number smallint NOT NULL CHECK (slot_number BETWEEN 1 AND 5),
  status test_session_status NOT NULL DEFAULT 'scheduled',
  scheduled_by uuid REFERENCES users(id),
  juz_number smallint,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Indexes & constraints
-- One booking per day/slot
CREATE UNIQUE INDEX IF NOT EXISTS uniq_day_slot ON test_sessions (scheduled_date, slot_number) WHERE status <> 'cancelled';

-- One active schedule per student (scheduled or reschedule_requested)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_sched_per_student
  ON test_sessions(student_id)
  WHERE status IN ('scheduled','reschedule_requested');

-- Helpful lookup
CREATE INDEX IF NOT EXISTS idx_test_sessions_date ON test_sessions (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_test_sessions_student ON test_sessions (student_id);

-- 4) Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at ON test_sessions;
CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON test_sessions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();