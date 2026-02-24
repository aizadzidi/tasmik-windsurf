BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_plan_catalog (
  plan_code TEXT PRIMARY KEY,
  student_staff_cap INTEGER NOT NULL CHECK (student_staff_cap > 0),
  trial_days INTEGER NOT NULL CHECK (trial_days > 0),
  grace_days INTEGER NOT NULL CHECK (grace_days >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_plan_catalog ENABLE ROW LEVEL SECURITY;

INSERT INTO public.tenant_plan_catalog (
  plan_code,
  student_staff_cap,
  trial_days,
  grace_days,
  is_active
)
VALUES
  ('starter', 300, 14, 7, true),
  ('growth', 1000, 14, 10, true),
  ('enterprise', 2000, 14, 14, true)
ON CONFLICT (plan_code) DO UPDATE
SET
  student_staff_cap = EXCLUDED.student_staff_cap,
  trial_days = EXCLUDED.trial_days,
  grace_days = EXCLUDED.grace_days,
  is_active = EXCLUDED.is_active,
  updated_at = now();

ALTER TABLE public.tenant_signup_requests
  ADD COLUMN IF NOT EXISTS billing_email_normalized TEXT,
  ADD COLUMN IF NOT EXISTS affiliate_code TEXT,
  ADD COLUMN IF NOT EXISTS estimated_students INTEGER,
  ADD COLUMN IF NOT EXISTS request_host TEXT,
  ADD COLUMN IF NOT EXISTS request_user_agent TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_signup_requests_billing_email_chk'
      AND conrelid = 'public.tenant_signup_requests'::regclass
  ) THEN
    ALTER TABLE public.tenant_signup_requests
      ADD CONSTRAINT tenant_signup_requests_billing_email_chk
      CHECK (
        billing_email_normalized IS NULL
        OR billing_email_normalized ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
      )
      NOT VALID;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_signup_requests_affiliate_code_chk'
      AND conrelid = 'public.tenant_signup_requests'::regclass
  ) THEN
    ALTER TABLE public.tenant_signup_requests
      ADD CONSTRAINT tenant_signup_requests_affiliate_code_chk
      CHECK (
        affiliate_code IS NULL
        OR affiliate_code ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
      )
      NOT VALID;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_signup_requests_estimated_students_chk'
      AND conrelid = 'public.tenant_signup_requests'::regclass
  ) THEN
    ALTER TABLE public.tenant_signup_requests
      ADD CONSTRAINT tenant_signup_requests_estimated_students_chk
      CHECK (
        estimated_students IS NULL
        OR (estimated_students >= 0 AND estimated_students <= 200000)
      )
      NOT VALID;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_reserved_tenant_slug(p_slug TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(COALESCE(p_slug, ''))) = ANY (
    ARRAY[
      'www',
      'app',
      'api',
      'admin',
      'auth',
      'billing',
      'dashboard',
      'help',
      'support',
      'status',
      'staging',
      'dev',
      'test'
    ]::TEXT[]
  );
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenants_slug_not_reserved_chk'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_slug_not_reserved_chk
      CHECK (NOT public.is_reserved_tenant_slug(slug))
      NOT VALID;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_signup_requests_slug_not_reserved_chk'
      AND conrelid = 'public.tenant_signup_requests'::regclass
  ) THEN
    ALTER TABLE public.tenant_signup_requests
      ADD CONSTRAINT tenant_signup_requests_slug_not_reserved_chk
      CHECK (NOT public.is_reserved_tenant_slug(tenant_slug))
      NOT VALID;
  END IF;
END;
$$;

UPDATE public.tenant_signup_requests
SET plan_code = lower(trim(COALESCE(plan_code, 'enterprise')))
WHERE plan_code IS DISTINCT FROM lower(trim(COALESCE(plan_code, 'enterprise')));

UPDATE public.tenant_subscription_states
SET plan_code = lower(trim(COALESCE(plan_code, 'enterprise')))
WHERE plan_code IS DISTINCT FROM lower(trim(COALESCE(plan_code, 'enterprise')));

UPDATE public.tenant_signup_requests r
SET
  plan_code = 'enterprise',
  updated_at = now()
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tenant_plan_catalog c
  WHERE c.plan_code = r.plan_code
);

UPDATE public.tenant_subscription_states s
SET
  plan_code = 'enterprise',
  updated_at = now()
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tenant_plan_catalog c
  WHERE c.plan_code = s.plan_code
);

UPDATE public.tenant_subscription_states s
SET
  trial_days = c.trial_days,
  updated_at = now()
FROM public.tenant_plan_catalog c
WHERE c.plan_code = s.plan_code
  AND s.trial_days IS DISTINCT FROM c.trial_days;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_signup_requests_plan_code_fkey'
      AND conrelid = 'public.tenant_signup_requests'::regclass
  ) THEN
    ALTER TABLE public.tenant_signup_requests
      ADD CONSTRAINT tenant_signup_requests_plan_code_fkey
      FOREIGN KEY (plan_code)
      REFERENCES public.tenant_plan_catalog(plan_code)
      NOT VALID;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_subscription_states_plan_code_fkey'
      AND conrelid = 'public.tenant_subscription_states'::regclass
  ) THEN
    ALTER TABLE public.tenant_subscription_states
      ADD CONSTRAINT tenant_subscription_states_plan_code_fkey
      FOREIGN KEY (plan_code)
      REFERENCES public.tenant_plan_catalog(plan_code)
      NOT VALID;
  END IF;
END;
$$;

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
SELECT
  t.id,
  'enterprise',
  'billplz',
  c.trial_days,
  'trial_pending',
  now(),
  now(),
  now()
FROM public.tenants t
JOIN public.tenant_plan_catalog c
  ON c.plan_code = 'enterprise'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tenant_subscription_states s
  WHERE s.tenant_id = t.id
);

INSERT INTO public.tenant_plan_limit_states (
  tenant_id,
  student_staff_cap,
  grace_days,
  blocked_new_adds,
  created_at,
  updated_at
)
SELECT
  s.tenant_id,
  c.student_staff_cap,
  c.grace_days,
  false,
  now(),
  now()
FROM public.tenant_subscription_states s
JOIN public.tenant_plan_catalog c
  ON c.plan_code = s.plan_code
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tenant_plan_limit_states pls
  WHERE pls.tenant_id = s.tenant_id
);

UPDATE public.tenant_plan_limit_states pls
SET
  student_staff_cap = c.student_staff_cap,
  grace_days = c.grace_days,
  updated_at = now()
FROM public.tenant_subscription_states s
JOIN public.tenant_plan_catalog c
  ON c.plan_code = s.plan_code
WHERE s.tenant_id = pls.tenant_id
  AND (
    pls.student_staff_cap IS DISTINCT FROM c.student_staff_cap
    OR pls.grace_days IS DISTINCT FROM c.grace_days
  );

INSERT INTO public.tenant_signup_requests (
  tenant_slug,
  school_name,
  requested_domain,
  email_normalized,
  admin_name,
  billing_cycle,
  plan_code,
  payment_provider,
  idempotency_key,
  status,
  tenant_id,
  admin_user_id,
  created_at,
  updated_at
)
SELECT
  t.slug,
  COALESCE(NULLIF(trim(t.name), ''), t.slug),
  COALESCE(td.domain, t.slug || '.eclazz.com'),
  lower(
    COALESCE(
      NULLIF(trim(au.email), ''),
      'legacy+' || replace(t.id::TEXT, '-', '') || '@invalid.local'
    )
  ),
  NULLIF(trim(admin_profile.display_name), ''),
  'monthly',
  COALESCE(s.plan_code, 'enterprise'),
  'billplz',
  'legacy-backfill:' || t.id::TEXT,
  'provisioned',
  t.id,
  admin_profile.user_id,
  now(),
  now()
FROM public.tenants t
LEFT JOIN LATERAL (
  SELECT d.domain
  FROM public.tenant_domains d
  WHERE d.tenant_id = t.id
  ORDER BY d.is_primary DESC, d.created_at ASC, d.domain ASC
  LIMIT 1
) td ON true
LEFT JOIN LATERAL (
  SELECT up.user_id, up.display_name
  FROM public.user_profiles up
  WHERE up.tenant_id = t.id
    AND up.role = 'school_admin'
  ORDER BY up.created_at ASC, up.user_id ASC
  LIMIT 1
) admin_profile ON true
LEFT JOIN auth.users au
  ON au.id = admin_profile.user_id
LEFT JOIN public.tenant_subscription_states s
  ON s.tenant_id = t.id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tenant_signup_requests r
  WHERE r.tenant_id = t.id
)
ON CONFLICT (idempotency_key) DO NOTHING;

UPDATE public.tenant_signup_requests r
SET
  tenant_id = t.id,
  status = CASE
    WHEN r.status IN ('pending', 'provisioning', 'failed') THEN 'provisioned'
    ELSE r.status
  END,
  updated_at = now()
FROM public.tenants t
WHERE r.tenant_id IS NULL
  AND r.tenant_slug = t.slug;

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
  v_plan_code TEXT := lower(trim(COALESCE(p_plan_code, '')));
  v_billing_cycle TEXT := CASE WHEN p_billing_cycle = 'annual' THEN 'annual' ELSE 'monthly' END;
  v_signup_id UUID;
  v_tenant_id UUID;
  v_existing_domain_tenant UUID;
  v_existing_tenant_id UUID;
  v_existing_status TEXT;
  v_signup_tenant_id UUID;
  v_signup_slug TEXT;
  v_signup_domain TEXT;
  v_signup_email TEXT;
  v_signup_plan TEXT;
  v_signup_billing_cycle TEXT;
  v_plan_cap INTEGER;
  v_plan_trial_days INTEGER;
  v_plan_grace_days INTEGER;
  v_created_new BOOLEAN := false;
BEGIN
  IF v_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$' THEN
    RAISE EXCEPTION 'Invalid tenant slug'
      USING ERRCODE = '22023';
  END IF;

  IF public.is_reserved_tenant_slug(v_slug) THEN
    RAISE EXCEPTION 'Reserved tenant slug'
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

  IF v_plan_code = '' THEN
    v_plan_code := 'enterprise';
  END IF;

  SELECT
    c.student_staff_cap,
    c.trial_days,
    c.grace_days
  INTO
    v_plan_cap,
    v_plan_trial_days,
    v_plan_grace_days
  FROM public.tenant_plan_catalog c
  WHERE c.plan_code = v_plan_code
    AND c.is_active = true
  LIMIT 1;

  IF v_plan_cap IS NULL THEN
    RAISE EXCEPTION 'Invalid plan code'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    r.id,
    r.tenant_id,
    r.status,
    r.tenant_slug,
    r.requested_domain,
    r.email_normalized,
    r.plan_code,
    r.billing_cycle
  INTO
    v_signup_id,
    v_signup_tenant_id,
    v_existing_status,
    v_signup_slug,
    v_signup_domain,
    v_signup_email,
    v_signup_plan,
    v_signup_billing_cycle
  FROM public.tenant_signup_requests r
  WHERE r.idempotency_key = v_idempotency_key
  FOR UPDATE;

  IF v_signup_id IS NOT NULL THEN
    IF v_signup_slug IS DISTINCT FROM v_slug
      OR v_signup_domain IS DISTINCT FROM v_domain
      OR v_signup_email IS DISTINCT FROM v_email
      OR lower(trim(COALESCE(v_signup_plan, ''))) IS DISTINCT FROM v_plan_code
      OR COALESCE(v_signup_billing_cycle, 'monthly') IS DISTINCT FROM v_billing_cycle
    THEN
      RAISE EXCEPTION 'Idempotency key replay mismatch'
        USING ERRCODE = '23505';
    END IF;

    IF v_signup_tenant_id IS NOT NULL THEN
      SELECT t.id
      INTO v_tenant_id
      FROM public.tenants t
      WHERE t.id = v_signup_tenant_id
        AND t.slug = v_slug
      LIMIT 1;

      IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Idempotent signup tenant linkage mismatch'
          USING ERRCODE = '23505';
      END IF;

      RETURN QUERY
      SELECT
        v_signup_id,
        v_tenant_id,
        v_domain,
        COALESCE(v_existing_status, 'provisioned'),
        false;
      RETURN;
    END IF;

    UPDATE public.tenant_signup_requests
    SET
      school_name = trim(COALESCE(p_school_name, '')),
      admin_name = NULLIF(trim(COALESCE(p_admin_name, '')), ''),
      admin_phone = NULLIF(trim(COALESCE(p_admin_phone, '')), ''),
      country = NULLIF(trim(COALESCE(p_country, '')), ''),
      timezone = NULLIF(trim(COALESCE(p_timezone, '')), ''),
      billing_cycle = v_billing_cycle,
      plan_code = v_plan_code,
      status = 'provisioning',
      error_code = NULL,
      error_message = NULL,
      updated_at = v_now
    WHERE id = v_signup_id;
  ELSE
    SELECT t.id
    INTO v_existing_tenant_id
    FROM public.tenants t
    WHERE t.slug = v_slug
    LIMIT 1;

    IF v_existing_tenant_id IS NOT NULL THEN
      RAISE EXCEPTION 'Tenant slug already assigned to another tenant'
        USING ERRCODE = '23505';
    END IF;

    SELECT d.tenant_id
    INTO v_existing_domain_tenant
    FROM public.tenant_domains d
    WHERE d.domain = v_domain
    LIMIT 1;

    IF v_existing_domain_tenant IS NOT NULL THEN
      RAISE EXCEPTION 'Domain already assigned to another tenant'
        USING ERRCODE = '23505';
    END IF;

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
      v_billing_cycle,
      v_plan_code,
      'billplz',
      v_idempotency_key,
      'provisioning',
      v_now,
      v_now
    )
    RETURNING id
    INTO v_signup_id;

    v_created_new := true;
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
  ON CONFLICT (slug) DO NOTHING
  RETURNING id
  INTO v_tenant_id;

  IF v_tenant_id IS NULL THEN
    SELECT t.id
    INTO v_existing_tenant_id
    FROM public.tenants t
    WHERE t.slug = v_slug
    LIMIT 1;

    IF v_existing_tenant_id IS NULL
      OR v_signup_tenant_id IS NULL
      OR v_existing_tenant_id <> v_signup_tenant_id
    THEN
      RAISE EXCEPTION 'Tenant slug already assigned to another tenant'
        USING ERRCODE = '23505';
    END IF;

    v_tenant_id := v_existing_tenant_id;
  END IF;

  SELECT d.tenant_id
  INTO v_existing_domain_tenant
  FROM public.tenant_domains d
  WHERE d.domain = v_domain
  LIMIT 1;

  IF v_existing_domain_tenant IS NOT NULL
    AND v_existing_domain_tenant <> v_tenant_id
  THEN
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
    v_plan_code,
    'billplz',
    v_plan_trial_days,
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
      trial_days = EXCLUDED.trial_days,
      updated_at = v_now;

  INSERT INTO public.tenant_plan_limit_states (
    tenant_id,
    student_staff_cap,
    grace_days,
    blocked_new_adds,
    created_at,
    updated_at
  )
  VALUES (
    v_tenant_id,
    v_plan_cap,
    v_plan_grace_days,
    false,
    v_now,
    v_now
  )
  ON CONFLICT (tenant_id)
  DO UPDATE
    SET
      student_staff_cap = EXCLUDED.student_staff_cap,
      grace_days = EXCLUDED.grace_days,
      updated_at = v_now;

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
    IF v_signup_id IS NOT NULL THEN
      UPDATE public.tenant_signup_requests
      SET
        status = 'failed',
        error_code = SQLSTATE,
        error_message = left(SQLERRM, 250),
        updated_at = now()
      WHERE id = v_signup_id;
    END IF;
    RAISE;
END;
$$;

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
  v_plan_code TEXT := 'enterprise';
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
  SELECT
    p_tenant_id,
    'enterprise',
    'billplz',
    c.trial_days,
    'trial_pending',
    v_now,
    v_now,
    v_now
  FROM public.tenant_plan_catalog c
  WHERE c.plan_code = 'enterprise'
  ON CONFLICT (tenant_id) DO NOTHING;

  SELECT
    COALESCE(NULLIF(lower(trim(s.plan_code)), ''), 'enterprise'),
    s.trial_starts_at,
    s.trial_ends_at,
    s.subscription_status
  INTO
    v_plan_code,
    v_starts_at,
    v_ends_at,
    v_status
  FROM public.tenant_subscription_states s
  WHERE s.tenant_id = p_tenant_id
  FOR UPDATE;

  SELECT c.trial_days
  INTO v_trial_days
  FROM public.tenant_plan_catalog c
  WHERE c.plan_code = v_plan_code
    AND c.is_active = true
  LIMIT 1;

  IF v_trial_days IS NULL THEN
    v_plan_code := 'enterprise';
    SELECT c.trial_days
    INTO v_trial_days
    FROM public.tenant_plan_catalog c
    WHERE c.plan_code = 'enterprise'
    LIMIT 1;
  END IF;

  UPDATE public.tenant_subscription_states
  SET
    plan_code = v_plan_code,
    trial_days = GREATEST(COALESCE(v_trial_days, 14), 1),
    updated_at = v_now
  WHERE tenant_id = p_tenant_id;

  IF v_starts_at IS NULL THEN
    v_started := true;
    v_starts_at := v_now;
    v_ends_at := v_now + make_interval(days => GREATEST(COALESCE(v_trial_days, 14), 1));
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
  v_plan_code TEXT := 'enterprise';
  v_trial_days INTEGER;
  v_cap INTEGER;
  v_grace_days INTEGER;
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
  SELECT
    p_tenant_id,
    'enterprise',
    'billplz',
    c.trial_days,
    'trial_pending',
    v_now,
    v_now,
    v_now
  FROM public.tenant_plan_catalog c
  WHERE c.plan_code = 'enterprise'
  ON CONFLICT (tenant_id) DO NOTHING;

  SELECT COALESCE(NULLIF(lower(trim(s.plan_code)), ''), 'enterprise')
  INTO v_plan_code
  FROM public.tenant_subscription_states s
  WHERE s.tenant_id = p_tenant_id
  FOR UPDATE;

  SELECT
    c.student_staff_cap,
    c.grace_days,
    c.trial_days
  INTO
    v_cap,
    v_grace_days,
    v_trial_days
  FROM public.tenant_plan_catalog c
  WHERE c.plan_code = v_plan_code
    AND c.is_active = true
  LIMIT 1;

  IF v_cap IS NULL THEN
    v_plan_code := 'enterprise';
    SELECT
      c.student_staff_cap,
      c.grace_days,
      c.trial_days
    INTO
      v_cap,
      v_grace_days,
      v_trial_days
    FROM public.tenant_plan_catalog c
    WHERE c.plan_code = 'enterprise'
    LIMIT 1;

    IF v_cap IS NULL THEN
      RAISE EXCEPTION 'No active enterprise plan is configured'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.tenant_subscription_states
    SET
      plan_code = v_plan_code,
      trial_days = v_trial_days,
      updated_at = v_now
    WHERE tenant_id = p_tenant_id;
  END IF;

  INSERT INTO public.tenant_plan_limit_states (
    tenant_id,
    student_staff_cap,
    grace_days,
    blocked_new_adds,
    created_at,
    updated_at
  )
  VALUES (
    p_tenant_id,
    v_cap,
    v_grace_days,
    false,
    v_now,
    v_now
  )
  ON CONFLICT (tenant_id)
  DO UPDATE
    SET
      student_staff_cap = v_cap,
      grace_days = v_grace_days,
      updated_at = v_now;

  SELECT
    pls.grace_started_at,
    pls.grace_ends_at,
    pls.blocked_new_adds
  INTO
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

REVOKE ALL ON FUNCTION public.find_auth_user_id_by_email(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_auth_user_id_by_email(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.find_auth_user_id_by_email(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.find_auth_user_id_by_email(TEXT) TO service_role;

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
) FROM anon;
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
) FROM authenticated;
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

REVOKE ALL ON FUNCTION public.start_tenant_trial_on_first_admin_login(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_tenant_trial_on_first_admin_login(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.start_tenant_trial_on_first_admin_login(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.start_tenant_trial_on_first_admin_login(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.check_tenant_plan_limit(UUID, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_tenant_plan_limit(UUID, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.check_tenant_plan_limit(UUID, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_tenant_plan_limit(UUID, INTEGER, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

COMMIT;
