BEGIN;
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
#variable_conflict use_column
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

    IF v_existing_tenant_id IS NULL THEN
      RAISE EXCEPTION 'Tenant slug already assigned to another tenant'
        USING ERRCODE = '23505';
    END IF;

    IF v_signup_tenant_id IS NULL THEN
      v_signup_tenant_id := v_existing_tenant_id;
    ELSIF v_existing_tenant_id <> v_signup_tenant_id THEN
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

  UPDATE public.tenant_domains AS td
  SET is_primary = (td.domain = v_domain)
  WHERE td.tenant_id = v_tenant_id;

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

COMMIT;
