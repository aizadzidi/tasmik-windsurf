-- Attendance V2 (session-based, mobile-first)
-- Run in Supabase SQL editor / psql as coordinated.

BEGIN;

-- -----------------------------------------------------------------------------
-- Tenant feature flags
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_feature_flags_tenant_feature
  ON public.tenant_feature_flags (tenant_id, feature_key);

-- -----------------------------------------------------------------------------
-- Campus schedule templates
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campus_session_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  teacher_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (start_time < end_time),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_campus_session_templates_tenant_day
  ON public.campus_session_templates (tenant_id, day_of_week, is_active);

CREATE INDEX IF NOT EXISTS idx_campus_session_templates_class
  ON public.campus_session_templates (tenant_id, class_id);

CREATE INDEX IF NOT EXISTS idx_campus_session_templates_teacher
  ON public.campus_session_templates (tenant_id, teacher_id);

-- -----------------------------------------------------------------------------
-- Campus session instances
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campus_session_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.campus_session_templates(id) ON DELETE SET NULL,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  teacher_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  session_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  state TEXT NOT NULL DEFAULT 'planned' CHECK (state IN ('planned', 'in_progress', 'finalized', 'cancelled', 'holiday')),
  generation_source TEXT NOT NULL DEFAULT 'auto' CHECK (generation_source IN ('auto', 'manual', 'legacy_migration')),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at TIMESTAMPTZ,
  finalized_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  finalize_note TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (start_time < end_time),
  UNIQUE (tenant_id, template_id, session_date)
);

CREATE INDEX IF NOT EXISTS idx_campus_session_instances_tenant_date
  ON public.campus_session_instances (tenant_id, session_date, state);

CREATE INDEX IF NOT EXISTS idx_campus_session_instances_teacher_date
  ON public.campus_session_instances (tenant_id, teacher_id, session_date);

CREATE INDEX IF NOT EXISTS idx_campus_session_instances_class_date
  ON public.campus_session_instances (tenant_id, class_id, session_date);

-- -----------------------------------------------------------------------------
-- Session roster snapshots
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campus_session_roster_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_instance_id UUID NOT NULL REFERENCES public.campus_session_instances(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'manual')),
  added_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, session_instance_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_campus_roster_tenant_session
  ON public.campus_session_roster_snapshots (tenant_id, session_instance_id);

CREATE INDEX IF NOT EXISTS idx_campus_roster_student
  ON public.campus_session_roster_snapshots (tenant_id, student_id);

-- -----------------------------------------------------------------------------
-- Attendance marks
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campus_attendance_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_instance_id UUID NOT NULL REFERENCES public.campus_session_instances(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late')),
  reason_code TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'teacher' CHECK (source IN ('teacher', 'admin_override', 'legacy_migration')),
  marked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, session_instance_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_campus_attendance_marks_session
  ON public.campus_attendance_marks (tenant_id, session_instance_id);

CREATE INDEX IF NOT EXISTS idx_campus_attendance_marks_student_date
  ON public.campus_attendance_marks (tenant_id, student_id, marked_at DESC);

CREATE INDEX IF NOT EXISTS idx_campus_attendance_marks_status
  ON public.campus_attendance_marks (tenant_id, status);

-- -----------------------------------------------------------------------------
-- Attendance audit logs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campus_attendance_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  mark_id UUID REFERENCES public.campus_attendance_marks(id) ON DELETE CASCADE,
  session_instance_id UUID REFERENCES public.campus_session_instances(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'override', 'finalize', 'reopen', 'add_roster_student')),
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reason TEXT,
  before_json JSONB,
  after_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campus_attendance_audit_tenant_created
  ON public.campus_attendance_audit_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_campus_attendance_audit_mark
  ON public.campus_attendance_audit_logs (tenant_id, mark_id);

CREATE INDEX IF NOT EXISTS idx_campus_attendance_audit_session
  ON public.campus_attendance_audit_logs (tenant_id, session_instance_id);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_campus_attendance_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_campus_session_templates_set_updated_at') THEN
    CREATE TRIGGER trg_campus_session_templates_set_updated_at
    BEFORE UPDATE ON public.campus_session_templates
    FOR EACH ROW
    EXECUTE FUNCTION public.set_campus_attendance_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_campus_session_instances_set_updated_at') THEN
    CREATE TRIGGER trg_campus_session_instances_set_updated_at
    BEFORE UPDATE ON public.campus_session_instances
    FOR EACH ROW
    EXECUTE FUNCTION public.set_campus_attendance_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_campus_attendance_marks_set_updated_at') THEN
    CREATE TRIGGER trg_campus_attendance_marks_set_updated_at
    BEFORE UPDATE ON public.campus_attendance_marks
    FOR EACH ROW
    EXECUTE FUNCTION public.set_campus_attendance_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tenant_feature_flags_set_updated_at') THEN
    CREATE TRIGGER trg_tenant_feature_flags_set_updated_at
    BEFORE UPDATE ON public.tenant_feature_flags
    FOR EACH ROW
    EXECUTE FUNCTION public.set_campus_attendance_updated_at();
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Audit trigger for marks create/update
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_campus_attendance_mark_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  actor uuid;
  action_name text;
BEGIN
  actor := auth.uid();

  IF TG_OP = 'INSERT' THEN
    action_name := 'create';
    INSERT INTO public.campus_attendance_audit_logs (
      tenant_id,
      mark_id,
      session_instance_id,
      action,
      actor_id,
      after_json
    ) VALUES (
      NEW.tenant_id,
      NEW.id,
      NEW.session_instance_id,
      action_name,
      COALESCE(actor, NEW.marked_by),
      to_jsonb(NEW)
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    action_name := CASE
      WHEN NEW.source = 'admin_override' THEN 'override'
      ELSE 'update'
    END;

    INSERT INTO public.campus_attendance_audit_logs (
      tenant_id,
      mark_id,
      session_instance_id,
      action,
      actor_id,
      before_json,
      after_json
    ) VALUES (
      NEW.tenant_id,
      NEW.id,
      NEW.session_instance_id,
      action_name,
      COALESCE(actor, NEW.marked_by),
      to_jsonb(OLD),
      to_jsonb(NEW)
    );

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_campus_attendance_marks_audit') THEN
    CREATE TRIGGER trg_campus_attendance_marks_audit
    AFTER INSERT OR UPDATE ON public.campus_attendance_marks
    FOR EACH ROW
    EXECUTE FUNCTION public.log_campus_attendance_mark_changes();
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.tenant_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_session_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_session_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_session_roster_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_attendance_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_attendance_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tenant_feature_flags' AND policyname = 'tenant_feature_flags_tenant_guard'
  ) THEN
    CREATE POLICY tenant_feature_flags_tenant_guard
      ON public.tenant_feature_flags
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.user_id = auth.uid() AND up.tenant_id = tenant_feature_flags.tenant_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.user_id = auth.uid() AND up.tenant_id = tenant_feature_flags.tenant_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'campus_session_templates' AND policyname = 'campus_session_templates_tenant_guard'
  ) THEN
    CREATE POLICY campus_session_templates_tenant_guard
      ON public.campus_session_templates
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.user_id = auth.uid() AND up.tenant_id = campus_session_templates.tenant_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.user_id = auth.uid() AND up.tenant_id = campus_session_templates.tenant_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'campus_session_instances' AND policyname = 'campus_session_instances_tenant_guard'
  ) THEN
    CREATE POLICY campus_session_instances_tenant_guard
      ON public.campus_session_instances
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.user_id = auth.uid() AND up.tenant_id = campus_session_instances.tenant_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.user_id = auth.uid() AND up.tenant_id = campus_session_instances.tenant_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'campus_session_roster_snapshots' AND policyname = 'campus_session_roster_snapshots_tenant_guard'
  ) THEN
    CREATE POLICY campus_session_roster_snapshots_tenant_guard
      ON public.campus_session_roster_snapshots
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.user_id = auth.uid() AND up.tenant_id = campus_session_roster_snapshots.tenant_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.user_id = auth.uid() AND up.tenant_id = campus_session_roster_snapshots.tenant_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'campus_attendance_marks' AND policyname = 'campus_attendance_marks_tenant_guard'
  ) THEN
    CREATE POLICY campus_attendance_marks_tenant_guard
      ON public.campus_attendance_marks
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.user_id = auth.uid() AND up.tenant_id = campus_attendance_marks.tenant_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.user_id = auth.uid() AND up.tenant_id = campus_attendance_marks.tenant_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'campus_attendance_audit_logs' AND policyname = 'campus_attendance_audit_logs_tenant_guard'
  ) THEN
    CREATE POLICY campus_attendance_audit_logs_tenant_guard
      ON public.campus_attendance_audit_logs
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.user_id = auth.uid() AND up.tenant_id = campus_attendance_audit_logs.tenant_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.user_id = auth.uid() AND up.tenant_id = campus_attendance_audit_logs.tenant_id
        )
      );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Compatibility view for legacy daily analytics
-- absent if any absent in the day, else late if any late, else present
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.campus_attendance_daily_compat AS
WITH ranked AS (
  SELECT
    i.tenant_id,
    i.class_id,
    i.session_date AS attendance_date,
    m.student_id,
    CASE
      WHEN bool_or(m.status = 'absent') THEN 'absent'
      WHEN bool_or(m.status = 'late') THEN 'late'
      ELSE 'present'
    END AS status,
    max(m.marked_at) AS marked_at
  FROM public.campus_session_instances i
  JOIN public.campus_attendance_marks m
    ON m.session_instance_id = i.id
  GROUP BY i.tenant_id, i.class_id, i.session_date, m.student_id
)
SELECT
  gen_random_uuid() AS id,
  tenant_id,
  class_id,
  attendance_date,
  student_id,
  status,
  NULL::uuid AS recorded_by,
  NULL::text AS notes,
  marked_at AS created_at,
  marked_at AS updated_at
FROM ranked;

-- -----------------------------------------------------------------------------
-- Best-effort backfill from legacy attendance_records
-- -----------------------------------------------------------------------------
WITH legacy_groups AS (
  SELECT DISTINCT
    ar.tenant_id,
    ar.class_id,
    ar.attendance_date
  FROM public.attendance_records ar
), created_instances AS (
  INSERT INTO public.campus_session_instances (
    tenant_id,
    template_id,
    class_id,
    subject_id,
    teacher_id,
    session_date,
    start_time,
    end_time,
    state,
    generation_source,
    generated_at,
    finalized_at,
    finalize_note,
    created_by
  )
  SELECT
    lg.tenant_id,
    NULL,
    lg.class_id,
    NULL,
    NULL,
    lg.attendance_date,
    TIME '08:00',
    TIME '09:00',
    'finalized',
    'legacy_migration',
    now(),
    now(),
    'Backfilled from attendance_records',
    NULL
  FROM legacy_groups lg
  ON CONFLICT DO NOTHING
  RETURNING id, tenant_id, class_id, session_date
), all_instances AS (
  SELECT i.id, i.tenant_id, i.class_id, i.session_date
  FROM public.campus_session_instances i
  WHERE i.generation_source = 'legacy_migration'
)
INSERT INTO public.campus_session_roster_snapshots (
  tenant_id,
  session_instance_id,
  class_id,
  student_id,
  source,
  added_by,
  added_at
)
SELECT
  ar.tenant_id,
  ai.id,
  ar.class_id,
  ar.student_id,
  'auto',
  ar.recorded_by,
  COALESCE(ar.created_at, now())
FROM public.attendance_records ar
JOIN all_instances ai
  ON ai.tenant_id = ar.tenant_id
 AND ai.class_id = ar.class_id
 AND ai.session_date = ar.attendance_date
ON CONFLICT (tenant_id, session_instance_id, student_id) DO NOTHING;

INSERT INTO public.campus_attendance_marks (
  tenant_id,
  session_instance_id,
  student_id,
  status,
  reason_code,
  notes,
  source,
  marked_by,
  marked_at,
  created_at,
  updated_at
)
SELECT
  ar.tenant_id,
  ai.id,
  ar.student_id,
  CASE
    WHEN ar.status = 'absent' THEN 'absent'
    ELSE 'present'
  END,
  NULL,
  ar.notes,
  'legacy_migration',
  ar.recorded_by,
  COALESCE(ar.updated_at, ar.created_at, now()),
  COALESCE(ar.created_at, now()),
  COALESCE(ar.updated_at, ar.created_at, now())
FROM public.attendance_records ar
JOIN public.campus_session_instances ai
  ON ai.tenant_id = ar.tenant_id
 AND ai.class_id = ar.class_id
 AND ai.session_date = ar.attendance_date
 AND ai.generation_source = 'legacy_migration'
ON CONFLICT (tenant_id, session_instance_id, student_id) DO NOTHING;

COMMIT;
