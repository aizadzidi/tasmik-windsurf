BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_signup_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug TEXT NOT NULL,
  school_name TEXT NOT NULL,
  requested_domain TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  admin_name TEXT,
  admin_phone TEXT,
  country TEXT,
  timezone TEXT,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
  plan_code TEXT NOT NULL DEFAULT 'enterprise',
  payment_provider TEXT NOT NULL DEFAULT 'billplz' CHECK (payment_provider = 'billplz'),
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'provisioning', 'provisioned', 'failed')),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_signup_requests_idempotency_uidx
  ON public.tenant_signup_requests (idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_signup_requests_slug_active_uidx
  ON public.tenant_signup_requests (tenant_slug)
  WHERE status IN ('pending', 'provisioning', 'provisioned');

CREATE INDEX IF NOT EXISTS tenant_signup_requests_email_idx
  ON public.tenant_signup_requests (email_normalized, created_at DESC);

ALTER TABLE public.tenant_signup_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.tenant_subscription_states (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL DEFAULT 'enterprise',
  payment_provider TEXT NOT NULL DEFAULT 'billplz' CHECK (payment_provider = 'billplz'),
  trial_days INTEGER NOT NULL DEFAULT 14 CHECK (trial_days > 0),
  trial_starts_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  trial_started_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subscription_status TEXT NOT NULL DEFAULT 'trial_pending'
    CHECK (subscription_status IN ('trial_pending', 'trial_active', 'active', 'past_due', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_subscription_states ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.tenant_plan_limit_states (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_staff_cap INTEGER NOT NULL DEFAULT 2000 CHECK (student_staff_cap > 0),
  grace_days INTEGER NOT NULL DEFAULT 14 CHECK (grace_days >= 0),
  grace_started_at TIMESTAMPTZ,
  grace_ends_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  last_known_students INTEGER NOT NULL DEFAULT 0 CHECK (last_known_students >= 0),
  last_known_staff INTEGER NOT NULL DEFAULT 0 CHECK (last_known_staff >= 0),
  blocked_new_adds BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_plan_limit_states ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.find_auth_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT u.id
  FROM auth.users u
  WHERE lower(trim(u.email)) = lower(trim(p_email))
  ORDER BY u.created_at ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_auth_user_id_by_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_auth_user_id_by_email(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.bootstrap_tenant_self_serve(
  p_school_name TEXT,
  p_tenant_slug TEXT,
  p_primary_domain TEXT,
  p_admin_email TEXT,
  p_admin_name TEXT DEFAULT NULL,
  p_admin_phone TEXT DEFAULT NULL,
  p_country TEXT DEFAULT NULL,
  p_timezone TEXT DEFAULT NULL,
  p_plan_code TEXT DEFAULT 'enterprise',
  p_billing_cycle TEXT DEFAULT 'monthly',
  p_payment_provider TEXT DEFAULT 'billplz',
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (
  signup_request_id UUID,
  tenant_id UUID,
  primary_domain TEXT,
  signup_status TEXT,
  created_new BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_slug TEXT := lower(trim(COALESCE(p_tenant_slug, '')));
  v_domain TEXT := lower(trim(COALESCE(p_primary_domain, '')));
  v_email TEXT := lower(trim(COALESCE(p_admin_email, '')));
  v_idempotency_key TEXT := trim(COALESCE(p_idempotency_key, ''));
  v_signup_id UUID;
  v_tenant_id UUID;
  v_existing_domain_tenant UUID;
  v_existing_tenant_id UUID;
  v_existing_status TEXT;
  v_created_new BOOLEAN := false;
BEGIN
  IF v_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$' THEN
    RAISE EXCEPTION 'Invalid tenant slug'
      USING ERRCODE = '22023';
  END IF;

  IF v_domain !~ '^[a-z0-9.-]+\.[a-z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid primary domain'
      USING ERRCODE = '22023';
  END IF;

  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid admin email'
      USING ERRCODE = '22023';
  END IF;

  IF p_payment_provider IS DISTINCT FROM 'billplz' THEN
    RAISE EXCEPTION 'Only billplz is supported for this registration flow'
      USING ERRCODE = '22023';
  END IF;

  IF v_idempotency_key = '' THEN
    RAISE EXCEPTION 'idempotency key is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT r.id, r.tenant_id, r.status
  INTO v_signup_id, v_existing_tenant_id, v_existing_status
  FROM public.tenant_signup_requests r
  WHERE r.idempotency_key = v_idempotency_key
  FOR UPDATE;

  IF v_signup_id IS NOT NULL AND v_existing_tenant_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      v_signup_id,
      v_existing_tenant_id,
      v_domain,
      COALESCE(v_existing_status, 'provisioned'),
      false;
    RETURN;
  END IF;

  IF v_signup_id IS NULL THEN
    INSERT INTO public.tenant_signup_requests (
      tenant_slug,
      school_name,
      requested_domain,
      email_normalized,
      admin_name,
      admin_phone,
      country,
      timezone,
      billing_cycle,
      plan_code,
      payment_provider,
      idempotency_key,
      status,
      created_at,
      updated_at
    )
    VALUES (
      v_slug,
      trim(COALESCE(p_school_name, '')),
      v_domain,
      v_email,
      NULLIF(trim(COALESCE(p_admin_name, '')), ''),
      NULLIF(trim(COALESCE(p_admin_phone, '')), ''),
      NULLIF(trim(COALESCE(p_country, '')), ''),
      NULLIF(trim(COALESCE(p_timezone, '')), ''),
      CASE WHEN p_billing_cycle = 'annual' THEN 'annual' ELSE 'monthly' END,
      COALESCE(NULLIF(trim(COALESCE(p_plan_code, '')), ''), 'enterprise'),
      'billplz',
      v_idempotency_key,
      'provisioning',
      v_now,
      v_now
    )
    RETURNING id
    INTO v_signup_id;
    v_created_new := true;
  ELSE
    UPDATE public.tenant_signup_requests
    SET
      status = 'provisioning',
      error_code = NULL,
      error_message = NULL,
      updated_at = v_now
    WHERE id = v_signup_id;
  END IF;

  INSERT INTO public.tenants (name, slug, status, metadata)
  VALUES (
    trim(COALESCE(p_school_name, '')),
    v_slug,
    'active',
    jsonb_build_object(
      'onboarding_model', 'self_serve_auto',
      'registration_source', 'public_api'
    )
  )
  ON CONFLICT (slug)
  DO UPDATE
    SET name = EXCLUDED.name
  RETURNING id
  INTO v_tenant_id;

  SELECT d.tenant_id
  INTO v_existing_domain_tenant
  FROM public.tenant_domains d
  WHERE d.domain = v_domain
  LIMIT 1;

  IF v_existing_domain_tenant IS NOT NULL AND v_existing_domain_tenant <> v_tenant_id THEN
    RAISE EXCEPTION 'Domain already assigned to another tenant'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.tenant_domains (tenant_id, domain, is_primary)
  VALUES (v_tenant_id, v_domain, true)
  ON CONFLICT (domain) DO NOTHING;

  UPDATE public.tenant_domains
  SET is_primary = (domain = v_domain)
  WHERE tenant_id = v_tenant_id;

  INSERT INTO public.tenant_subscription_states (
    tenant_id,
    plan_code,
    payment_provider,
    trial_days,
    subscription_status,
    started_at,
    created_at,
    updated_at
  )
  VALUES (
    v_tenant_id,
    COALESCE(NULLIF(trim(COALESCE(p_plan_code, '')), ''), 'enterprise'),
    'billplz',
    14,
    'trial_pending',
    v_now,
    v_now,
    v_now
  )
  ON CONFLICT (tenant_id)
  DO UPDATE
    SET
      plan_code = EXCLUDED.plan_code,
      payment_provider = 'billplz',
      trial_days = 14,
      updated_at = v_now;

  INSERT INTO public.tenant_plan_limit_states (
    tenant_id,
    student_staff_cap,
    grace_days,
    blocked_new_adds,
    created_at,
    updated_at
  )
  VALUES (v_tenant_id, 2000, 14, false, v_now, v_now)
  ON CONFLICT (tenant_id) DO NOTHING;

  UPDATE public.tenant_signup_requests
  SET
    tenant_id = v_tenant_id,
    status = 'provisioned',
    error_code = NULL,
    error_message = NULL,
    updated_at = v_now
  WHERE id = v_signup_id;

  RETURN QUERY
  SELECT
    v_signup_id,
    v_tenant_id,
    v_domain,
    'provisioned',
    v_created_new;
EXCEPTION
  WHEN OTHERS THEN
    UPDATE public.tenant_signup_requests
    SET
      status = 'failed',
      error_code = SQLSTATE,
      error_message = left(SQLERRM, 250),
      updated_at = now()
    WHERE id = v_signup_id;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_tenant_self_serve(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_tenant_self_serve(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) TO service_role;

CREATE OR REPLACE FUNCTION public.start_tenant_trial_on_first_admin_login(
  p_tenant_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  trial_started BOOLEAN,
  trial_starts_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  subscription_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_started BOOLEAN := false;
  v_starts_at TIMESTAMPTZ;
  v_ends_at TIMESTAMPTZ;
  v_status TEXT;
  v_trial_days INTEGER;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tenant_subscription_states (
    tenant_id,
    plan_code,
    payment_provider,
    trial_days,
    subscription_status,
    started_at,
    created_at,
    updated_at
  )
  VALUES (
    p_tenant_id,
    'enterprise',
    'billplz',
    14,
    'trial_pending',
    v_now,
    v_now,
    v_now
  )
  ON CONFLICT (tenant_id) DO NOTHING;

  SELECT s.trial_starts_at, s.trial_ends_at, s.subscription_status, s.trial_days
  INTO v_starts_at, v_ends_at, v_status, v_trial_days
  FROM public.tenant_subscription_states s
  WHERE s.tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_starts_at IS NULL THEN
    v_started := true;
    v_starts_at := v_now;
    v_ends_at := v_now + make_interval(days => GREATEST(v_trial_days, 1));
    v_status := 'trial_active';

    UPDATE public.tenant_subscription_states
    SET
      trial_starts_at = v_starts_at,
      trial_ends_at = v_ends_at,
      trial_started_by = COALESCE(trial_started_by, p_user_id),
      subscription_status = 'trial_active',
      updated_at = v_now
    WHERE tenant_id = p_tenant_id;
  END IF;

  RETURN QUERY
  SELECT v_started, v_starts_at, v_ends_at, v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.start_tenant_trial_on_first_admin_login(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_tenant_trial_on_first_admin_login(UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.check_tenant_plan_limit(
  p_tenant_id UUID,
  p_add_students INTEGER DEFAULT 0,
  p_add_staff INTEGER DEFAULT 0
)
RETURNS TABLE (
  allowed BOOLEAN,
  limit_code TEXT,
  cap INTEGER,
  active_students INTEGER,
  active_staff INTEGER,
  projected_total INTEGER,
  overage INTEGER,
  grace_started_at TIMESTAMPTZ,
  grace_ends_at TIMESTAMPTZ,
  blocked_new_adds BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_cap INTEGER := 2000;
  v_grace_days INTEGER := 14;
  v_add_students INTEGER := GREATEST(COALESCE(p_add_students, 0), 0);
  v_add_staff INTEGER := GREATEST(COALESCE(p_add_staff, 0), 0);
  v_active_students INTEGER := 0;
  v_active_staff INTEGER := 0;
  v_projected_total INTEGER := 0;
  v_overage INTEGER := 0;
  v_grace_started_at TIMESTAMPTZ;
  v_grace_ends_at TIMESTAMPTZ;
  v_blocked_new_adds BOOLEAN := false;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tenant_plan_limit_states (
    tenant_id,
    student_staff_cap,
    grace_days,
    blocked_new_adds,
    created_at,
    updated_at
  )
  VALUES (p_tenant_id, 2000, 14, false, v_now, v_now)
  ON CONFLICT (tenant_id) DO NOTHING;

  SELECT
    pls.student_staff_cap,
    pls.grace_days,
    pls.grace_started_at,
    pls.grace_ends_at,
    pls.blocked_new_adds
  INTO
    v_cap,
    v_grace_days,
    v_grace_started_at,
    v_grace_ends_at,
    v_blocked_new_adds
  FROM public.tenant_plan_limit_states pls
  WHERE pls.tenant_id = p_tenant_id
  FOR UPDATE;

  SELECT COUNT(*)::INTEGER
  INTO v_active_students
  FROM public.students s
  WHERE s.tenant_id = p_tenant_id
    AND COALESCE(s.record_type, 'student') = 'student'
    AND COALESCE(s.crm_stage, 'active') <> 'discontinued';

  SELECT COUNT(*)::INTEGER
  INTO v_active_staff
  FROM public.user_profiles up
  WHERE up.tenant_id = p_tenant_id
    AND up.role IN ('school_admin', 'teacher', 'student_support');

  v_projected_total := v_active_students + v_active_staff + v_add_students + v_add_staff;
  v_overage := GREATEST(v_projected_total - v_cap, 0);

  IF v_projected_total > v_cap THEN
    v_blocked_new_adds := true;
    IF v_grace_started_at IS NULL THEN
      v_grace_started_at := v_now;
      v_grace_ends_at := v_now + make_interval(days => GREATEST(v_grace_days, 0));
    END IF;
  ELSE
    v_blocked_new_adds := false;
    v_grace_started_at := NULL;
    v_grace_ends_at := NULL;
  END IF;

  UPDATE public.tenant_plan_limit_states
  SET
    grace_started_at = v_grace_started_at,
    grace_ends_at = v_grace_ends_at,
    last_checked_at = v_now,
    last_known_students = v_active_students,
    last_known_staff = v_active_staff,
    blocked_new_adds = v_blocked_new_adds,
    updated_at = v_now
  WHERE tenant_id = p_tenant_id;

  RETURN QUERY
  SELECT
    (v_projected_total <= v_cap) AS allowed,
    CASE
      WHEN v_projected_total <= v_cap THEN 'OK'
      ELSE 'TENANT_CAP_EXCEEDED'
    END AS limit_code,
    v_cap,
    v_active_students,
    v_active_staff,
    v_projected_total,
    v_overage,
    v_grace_started_at,
    v_grace_ends_at,
    v_blocked_new_adds;
END;
$$;

REVOKE ALL ON FUNCTION public.check_tenant_plan_limit(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_tenant_plan_limit(UUID, INTEGER, INTEGER) TO service_role;

COMMIT;

