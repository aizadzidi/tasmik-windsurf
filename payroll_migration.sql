-- ═══════════════════════════════════════════════════════════════════
-- PAYROLL MANAGEMENT MIGRATION
-- Staff salary configuration + monthly payroll with atomic RPC functions
-- Per-object idempotent: safe to re-run
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════
-- Table 1: staff_salary_config
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.staff_salary_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  basic_salary NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (basic_salary >= 0),
  working_days_per_month INTEGER NOT NULL DEFAULT 22
    CHECK (working_days_per_month > 0 AND working_days_per_month <= 31),
  housing_allowance NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (housing_allowance >= 0),
  transport_allowance NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (transport_allowance >= 0),
  meal_allowance NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (meal_allowance >= 0),
  other_allowance NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (other_allowance >= 0),
  other_allowance_label TEXT DEFAULT '',
  epf_employee_rate NUMERIC(5,2) NOT NULL DEFAULT 11.00
    CHECK (epf_employee_rate >= 0 AND epf_employee_rate <= 100),
  epf_employer_rate NUMERIC(5,2) NOT NULL DEFAULT 13.00
    CHECK (epf_employer_rate >= 0 AND epf_employer_rate <= 100),
  socso_employee_rate NUMERIC(5,2) NOT NULL DEFAULT 0.50
    CHECK (socso_employee_rate >= 0 AND socso_employee_rate <= 100),
  socso_employer_rate NUMERIC(5,2) NOT NULL DEFAULT 1.75
    CHECK (socso_employer_rate >= 0 AND socso_employer_rate <= 100),
  eis_employee_rate NUMERIC(5,2) NOT NULL DEFAULT 0.20
    CHECK (eis_employee_rate >= 0 AND eis_employee_rate <= 100),
  eis_employer_rate NUMERIC(5,2) NOT NULL DEFAULT 0.20
    CHECK (eis_employer_rate >= 0 AND eis_employer_rate <= 100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_salary_config_tenant
  ON public.staff_salary_config(tenant_id);
CREATE INDEX IF NOT EXISTS idx_salary_config_tenant_user
  ON public.staff_salary_config(tenant_id, user_id);

-- ═══════════════════════════════════════════
-- Table 2: monthly_payroll
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.monthly_payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  payroll_month DATE NOT NULL,
  -- Staff identity snapshot
  staff_name TEXT NOT NULL DEFAULT '',
  staff_position TEXT NOT NULL DEFAULT '',
  -- Salary snapshot
  basic_salary NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (basic_salary >= 0),
  working_days INTEGER NOT NULL DEFAULT 22 CHECK (working_days > 0),
  daily_rate NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (daily_rate >= 0),
  -- Allowance snapshots
  housing_allowance NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (housing_allowance >= 0),
  transport_allowance NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (transport_allowance >= 0),
  meal_allowance NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (meal_allowance >= 0),
  other_allowance NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (other_allowance >= 0),
  other_allowance_label TEXT DEFAULT '',
  total_allowances NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- UPL deduction
  upl_days INTEGER NOT NULL DEFAULT 0 CHECK (upl_days >= 0),
  upl_deduction NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (upl_deduction >= 0),
  -- Statutory amounts
  epf_employee NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (epf_employee >= 0),
  epf_employer NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (epf_employer >= 0),
  socso_employee NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (socso_employee >= 0),
  socso_employer NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (socso_employer >= 0),
  eis_employee NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (eis_employee >= 0),
  eis_employer NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (eis_employer >= 0),
  -- Statutory rates snapshot
  epf_employee_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  epf_employer_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  socso_employee_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  socso_employer_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  eis_employee_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  eis_employer_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  -- Custom deduction
  custom_deduction_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (custom_deduction_amount >= 0),
  custom_deduction_note TEXT DEFAULT '',
  -- Computed totals
  gross_salary NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(10,2) NOT NULL DEFAULT 0,
  net_salary NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- Status & audit
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  finalized_at TIMESTAMPTZ,
  finalized_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id, payroll_month),
  CHECK (payroll_month = date_trunc('month', payroll_month)::date)
);

CREATE INDEX IF NOT EXISTS idx_payroll_tenant_month
  ON public.monthly_payroll(tenant_id, payroll_month);
CREATE INDEX IF NOT EXISTS idx_payroll_tenant_user
  ON public.monthly_payroll(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_payroll_tenant_month_status
  ON public.monthly_payroll(tenant_id, payroll_month, status);

-- ═══════════════════════════════════════════
-- RLS Policies
-- ═══════════════════════════════════════════

ALTER TABLE public.staff_salary_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_payroll ENABLE ROW LEVEL SECURITY;

-- staff_salary_config: restrictive tenant guard
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'staff_salary_config' AND policyname = 'tenant_guard_staff_salary_config') THEN
    CREATE POLICY tenant_guard_staff_salary_config ON public.staff_salary_config
      AS RESTRICTIVE FOR ALL
      USING (EXISTS (
        SELECT 1 FROM public.user_profiles up
        WHERE up.user_id = auth.uid() AND up.tenant_id = staff_salary_config.tenant_id
      ));
  END IF;
END $$;

-- staff_salary_config: admin-only manage
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'staff_salary_config' AND policyname = 'salary_config_admin_manage') THEN
    CREATE POLICY salary_config_admin_manage ON public.staff_salary_config
      FOR ALL
      USING (
        EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
        OR EXISTS (SELECT 1 FROM public.user_profiles up
          WHERE up.user_id = auth.uid() AND up.tenant_id = staff_salary_config.tenant_id
          AND up.role = 'school_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
        OR EXISTS (SELECT 1 FROM public.user_profiles up
          WHERE up.user_id = auth.uid() AND up.tenant_id = staff_salary_config.tenant_id
          AND up.role = 'school_admin')
      );
  END IF;
END $$;

-- monthly_payroll: restrictive tenant guard
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'monthly_payroll' AND policyname = 'tenant_guard_monthly_payroll') THEN
    CREATE POLICY tenant_guard_monthly_payroll ON public.monthly_payroll
      AS RESTRICTIVE FOR ALL
      USING (EXISTS (
        SELECT 1 FROM public.user_profiles up
        WHERE up.user_id = auth.uid() AND up.tenant_id = monthly_payroll.tenant_id
      ));
  END IF;
END $$;

-- monthly_payroll: admin-only manage
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'monthly_payroll' AND policyname = 'monthly_payroll_admin_manage') THEN
    CREATE POLICY monthly_payroll_admin_manage ON public.monthly_payroll
      FOR ALL
      USING (
        EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
        OR EXISTS (SELECT 1 FROM public.user_profiles up
          WHERE up.user_id = auth.uid() AND up.tenant_id = monthly_payroll.tenant_id
          AND up.role = 'school_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
        OR EXISTS (SELECT 1 FROM public.user_profiles up
          WHERE up.user_id = auth.uid() AND up.tenant_id = monthly_payroll.tenant_id
          AND up.role = 'school_admin')
      );
  END IF;
END $$;

-- monthly_payroll: staff can read own finalized records
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'monthly_payroll' AND policyname = 'monthly_payroll_staff_read_own') THEN
    CREATE POLICY monthly_payroll_staff_read_own ON public.monthly_payroll
      FOR SELECT
      USING (user_id = auth.uid() AND status = 'finalized');
  END IF;
END $$;

-- ═══════════════════════════════════════════
-- Triggers
-- ═══════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_payroll_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_staff_salary_config_updated_at') THEN
    CREATE TRIGGER trg_staff_salary_config_updated_at
      BEFORE UPDATE ON public.staff_salary_config
      FOR EACH ROW EXECUTE FUNCTION public.set_payroll_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_monthly_payroll_updated_at') THEN
    CREATE TRIGGER trg_monthly_payroll_updated_at
      BEFORE UPDATE ON public.monthly_payroll
      FOR EACH ROW EXECUTE FUNCTION public.set_payroll_updated_at();
  END IF;
END $$;

-- ═══════════════════════════════════════════
-- Permission seed
-- ═══════════════════════════════════════════

INSERT INTO public.permissions (key, description)
VALUES ('admin:payroll', 'Access admin payroll management')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════
-- RPC: Atomic batch upsert for payroll generation
-- JS calculates all values; SQL writes atomically with advisory lock
-- ═══════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.upsert_monthly_payroll_batch(
  p_tenant_id UUID,
  p_payroll_month DATE,
  p_records JSONB
)
RETURNS TABLE(upserted_count INT, skipped_finalized INT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rec JSONB;
  v_upserted INT := 0;
  v_skipped INT := 0;
  v_rows_affected INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || p_payroll_month::text));

  FOR rec IN SELECT jsonb_array_elements(p_records) LOOP
    -- INSERT ... ON CONFLICT DO UPDATE WHERE status='draft' handles finalized skip.
    -- GET DIAGNOSTICS after tells us if the row was actually written.
    INSERT INTO monthly_payroll (
      tenant_id, user_id, payroll_month, staff_name, staff_position,
      basic_salary, working_days, daily_rate,
      housing_allowance, transport_allowance, meal_allowance, other_allowance,
      other_allowance_label, total_allowances, upl_days, upl_deduction,
      epf_employee, epf_employer, socso_employee, socso_employer,
      eis_employee, eis_employer,
      epf_employee_rate, epf_employer_rate, socso_employee_rate, socso_employer_rate,
      eis_employee_rate, eis_employer_rate,
      custom_deduction_amount, custom_deduction_note,
      gross_salary, total_deductions, net_salary, status
    ) VALUES (
      p_tenant_id, (rec->>'user_id')::UUID, p_payroll_month,
      rec->>'staff_name', rec->>'staff_position',
      (rec->>'basic_salary')::NUMERIC, (rec->>'working_days')::INT, (rec->>'daily_rate')::NUMERIC,
      (rec->>'housing_allowance')::NUMERIC, (rec->>'transport_allowance')::NUMERIC,
      (rec->>'meal_allowance')::NUMERIC, (rec->>'other_allowance')::NUMERIC,
      rec->>'other_allowance_label', (rec->>'total_allowances')::NUMERIC,
      (rec->>'upl_days')::INT, (rec->>'upl_deduction')::NUMERIC,
      (rec->>'epf_employee')::NUMERIC, (rec->>'epf_employer')::NUMERIC,
      (rec->>'socso_employee')::NUMERIC, (rec->>'socso_employer')::NUMERIC,
      (rec->>'eis_employee')::NUMERIC, (rec->>'eis_employer')::NUMERIC,
      (rec->>'epf_employee_rate')::NUMERIC, (rec->>'epf_employer_rate')::NUMERIC,
      (rec->>'socso_employee_rate')::NUMERIC, (rec->>'socso_employer_rate')::NUMERIC,
      (rec->>'eis_employee_rate')::NUMERIC, (rec->>'eis_employer_rate')::NUMERIC,
      (rec->>'custom_deduction_amount')::NUMERIC,
      COALESCE(rec->>'custom_deduction_note', ''),
      (rec->>'gross_salary')::NUMERIC, (rec->>'total_deductions')::NUMERIC,
      (rec->>'net_salary')::NUMERIC, 'draft'
    )
    ON CONFLICT (tenant_id, user_id, payroll_month) DO UPDATE SET
      staff_name = EXCLUDED.staff_name, staff_position = EXCLUDED.staff_position,
      basic_salary = EXCLUDED.basic_salary, working_days = EXCLUDED.working_days,
      daily_rate = EXCLUDED.daily_rate,
      housing_allowance = EXCLUDED.housing_allowance,
      transport_allowance = EXCLUDED.transport_allowance,
      meal_allowance = EXCLUDED.meal_allowance,
      other_allowance = EXCLUDED.other_allowance,
      other_allowance_label = EXCLUDED.other_allowance_label,
      total_allowances = EXCLUDED.total_allowances,
      upl_days = EXCLUDED.upl_days, upl_deduction = EXCLUDED.upl_deduction,
      epf_employee = EXCLUDED.epf_employee, epf_employer = EXCLUDED.epf_employer,
      socso_employee = EXCLUDED.socso_employee, socso_employer = EXCLUDED.socso_employer,
      eis_employee = EXCLUDED.eis_employee, eis_employer = EXCLUDED.eis_employer,
      epf_employee_rate = EXCLUDED.epf_employee_rate, epf_employer_rate = EXCLUDED.epf_employer_rate,
      socso_employee_rate = EXCLUDED.socso_employee_rate, socso_employer_rate = EXCLUDED.socso_employer_rate,
      eis_employee_rate = EXCLUDED.eis_employee_rate, eis_employer_rate = EXCLUDED.eis_employer_rate,
      custom_deduction_amount = EXCLUDED.custom_deduction_amount,
      custom_deduction_note = EXCLUDED.custom_deduction_note,
      gross_salary = EXCLUDED.gross_salary,
      total_deductions = EXCLUDED.total_deductions,
      net_salary = EXCLUDED.net_salary,
      updated_at = now()
    WHERE monthly_payroll.status = 'draft';

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    IF v_rows_affected > 0 THEN
      v_upserted := v_upserted + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_upserted, v_skipped;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_monthly_payroll_batch(UUID, DATE, JSONB) FROM public;
GRANT EXECUTE ON FUNCTION public.upsert_monthly_payroll_batch(UUID, DATE, JSONB) TO service_role;

-- ═══════════════════════════════════════════
-- RPC: Atomic finalize
-- ═══════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.finalize_monthly_payroll(
  p_tenant_id UUID,
  p_payroll_month DATE,
  p_finalized_by UUID,
  p_single_id UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || p_payroll_month::text));

  UPDATE monthly_payroll
  SET status = 'finalized',
      finalized_at = now(),
      finalized_by = p_finalized_by,
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND payroll_month = p_payroll_month
    AND status = 'draft'
    AND (p_single_id IS NULL OR id = p_single_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_monthly_payroll(UUID, DATE, UUID, UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.finalize_monthly_payroll(UUID, DATE, UUID, UUID) TO service_role;

-- ═══════════════════════════════════════════
-- RPC: Atomic unfinalize (revert to draft for recalculation)
-- ═══════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.unfinalize_monthly_payroll(
  p_tenant_id UUID,
  p_payroll_month DATE,
  p_single_id UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || p_payroll_month::text));

  UPDATE monthly_payroll
  SET status = 'draft',
      finalized_at = NULL,
      finalized_by = NULL,
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND payroll_month = p_payroll_month
    AND status = 'finalized'
    AND (p_single_id IS NULL OR id = p_single_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.unfinalize_monthly_payroll(UUID, DATE, UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.unfinalize_monthly_payroll(UUID, DATE, UUID) TO service_role;
