-- Add release flags to exams so admins can control parent visibility
-- Run this in Supabase SQL editor or psql

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS released boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS released_at timestamptz NULL;

-- Helpful index when filtering by released state
CREATE INDEX IF NOT EXISTS idx_exams_released ON public.exams (released);

