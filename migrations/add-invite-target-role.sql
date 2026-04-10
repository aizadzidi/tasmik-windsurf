-- Migration: Add target_role to tenant_invites
-- Purpose: Allow invite codes to carry role information (teacher or general_worker)
-- Backwards compatible: existing invites default to 'teacher'

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tenant_invites'
      AND column_name = 'target_role'
  ) THEN
    ALTER TABLE public.tenant_invites
      ADD COLUMN target_role TEXT NOT NULL DEFAULT 'teacher';

    ALTER TABLE public.tenant_invites
      ADD CONSTRAINT tenant_invites_target_role_check
      CHECK (target_role IN ('teacher', 'general_worker'));
  END IF;
END
$$;
