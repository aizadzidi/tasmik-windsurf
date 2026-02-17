-- Payment hardening:
-- 1) tenant-aware gateway keys with rotation support
-- 2) atomic webhook idempotency and payment update in DB

BEGIN;

-- ---------------------------------------------------------------------------
-- Tenant gateway runtime keys (supports rotation windows)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_payment_gateway_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.payment_providers(id) ON DELETE CASCADE,
  key_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'rotating', 'disabled', 'retired')),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  allow_webhook_verification BOOLEAN NOT NULL DEFAULT true,
  api_base TEXT NOT NULL DEFAULT 'https://www.billplz.com/api/v3',
  api_key TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  webhook_secret TEXT NOT NULL,
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider_id, key_version)
);

CREATE INDEX IF NOT EXISTS idx_tenant_payment_gateway_keys_lookup
  ON public.tenant_payment_gateway_keys (tenant_id, provider_id, status, is_primary DESC, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_payment_gateway_keys_single_primary
  ON public.tenant_payment_gateway_keys (tenant_id, provider_id)
  WHERE is_primary = true AND status IN ('active', 'rotating');

ALTER TABLE public.tenant_payment_gateway_keys ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tenant_payment_gateway_keys'
      AND policyname = 'tenant_payment_gateway_keys_manage_admin'
  ) THEN
    CREATE POLICY tenant_payment_gateway_keys_manage_admin
      ON public.tenant_payment_gateway_keys
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = auth.uid() AND u.role = 'admin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = auth.uid() AND u.role = 'admin'
        )
      );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Webhook idempotency keys
-- ---------------------------------------------------------------------------
ALTER TABLE public.payment_events
  ADD COLUMN IF NOT EXISTS provider_event_fingerprint TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS payment_events_provider_event_uidx
  ON public.payment_events (tenant_id, provider_id, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payment_events_provider_fingerprint_uidx
  ON public.payment_events (tenant_id, provider_id, provider_event_fingerprint)
  WHERE provider_event_fingerprint IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Atomic Billplz webhook processor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_billplz_webhook_event(
  p_tenant_id UUID,
  p_billplz_id TEXT,
  p_provider_event_id TEXT,
  p_webhook_fingerprint TEXT,
  p_received_amount_cents INTEGER,
  p_paid BOOLEAN,
  p_state TEXT,
  p_due_at TIMESTAMPTZ,
  p_paid_at TIMESTAMPTZ,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  outcome TEXT,
  payment_id UUID,
  current_status TEXT,
  next_status TEXT
)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_provider_id UUID;
  v_payment public.payments%ROWTYPE;
  v_event_id UUID;
  v_effective_provider_id UUID;
  v_provider_event_id TEXT := NULLIF(trim(COALESCE(p_provider_event_id, '')), '');
  v_fingerprint TEXT := NULLIF(trim(COALESCE(p_webhook_fingerprint, '')), '');
  v_expected_amount INTEGER;
  v_next_status TEXT;
  v_transition_allowed BOOLEAN := FALSE;
  v_resolved_paid_at TIMESTAMPTZ;
  v_should_update BOOLEAN := FALSE;
BEGIN
  IF p_tenant_id IS NULL OR p_billplz_id IS NULL OR length(trim(p_billplz_id)) = 0 THEN
    RETURN QUERY SELECT 'rejected'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF v_provider_event_id IS NULL THEN
    v_provider_event_id := v_fingerprint;
  END IF;

  SELECT id
  INTO v_provider_id
  FROM public.payment_providers
  WHERE key = 'billplz'
  LIMIT 1;

  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE tenant_id = p_tenant_id
    AND billplz_id = p_billplz_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  v_effective_provider_id := COALESCE(v_payment.provider_id, v_provider_id);

  INSERT INTO public.payment_events (
    tenant_id,
    provider_id,
    provider_event_id,
    provider_event_fingerprint,
    payment_id,
    source,
    event_type,
    payload
  )
  VALUES (
    v_payment.tenant_id,
    v_effective_provider_id,
    v_provider_event_id,
    v_fingerprint,
    v_payment.id,
    'billplz',
    'webhook_received',
    COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object(
      'billId', p_billplz_id,
      'fingerprint', v_fingerprint
    )
  )
  ON CONFLICT (tenant_id, provider_id, provider_event_id)
  WHERE provider_event_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN QUERY SELECT 'replay'::TEXT, v_payment.id, v_payment.status, NULL::TEXT;
    RETURN;
  END IF;

  v_expected_amount :=
    GREATEST(COALESCE(v_payment.total_amount_cents, 0), 0) +
    GREATEST(COALESCE(v_payment.merchant_fee_cents, 0), 0);

  IF p_received_amount_cents IS NULL OR p_received_amount_cents <> v_expected_amount THEN
    UPDATE public.payment_events
    SET
      event_type = 'webhook_rejected_amount_mismatch',
      payload = COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object(
        'billId', p_billplz_id,
        'fingerprint', v_fingerprint,
        'expectedAmountCents', v_expected_amount,
        'receivedAmountCents', p_received_amount_cents
      )
    WHERE id = v_event_id;

    RETURN QUERY SELECT 'rejected'::TEXT, v_payment.id, v_payment.status, NULL::TEXT;
    RETURN;
  END IF;

  IF COALESCE(p_paid, false) THEN
    v_next_status := 'paid';
  ELSIF p_state = 'pending' THEN
    v_next_status := 'pending';
  ELSIF p_state IN ('overdue', 'expired') THEN
    v_next_status := 'expired';
  ELSE
    v_next_status := 'failed';
  END IF;

  IF v_payment.status = v_next_status THEN
    v_transition_allowed := TRUE;
  ELSE
    CASE v_payment.status
      WHEN 'draft' THEN
        v_transition_allowed := v_next_status IN ('initiated');
      WHEN 'initiated' THEN
        v_transition_allowed := v_next_status IN ('pending', 'paid', 'failed', 'expired');
      WHEN 'pending' THEN
        v_transition_allowed := v_next_status IN ('paid', 'failed', 'expired');
      WHEN 'failed' THEN
        v_transition_allowed := v_next_status IN ('pending', 'paid', 'expired');
      WHEN 'expired' THEN
        v_transition_allowed := v_next_status IN ('pending', 'paid', 'failed');
      WHEN 'paid' THEN
        v_transition_allowed := v_next_status IN ('refunded');
      WHEN 'refunded' THEN
        v_transition_allowed := FALSE;
      ELSE
        v_transition_allowed := FALSE;
    END CASE;
  END IF;

  IF NOT v_transition_allowed THEN
    UPDATE public.payment_events
    SET
      event_type = 'webhook_ignored_invalid_transition',
      payload = COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object(
        'billId', p_billplz_id,
        'fingerprint', v_fingerprint,
        'fromStatus', v_payment.status,
        'toStatus', v_next_status
      )
    WHERE id = v_event_id;

    RETURN QUERY SELECT 'ignored'::TEXT, v_payment.id, v_payment.status, v_next_status;
    RETURN;
  END IF;

  v_resolved_paid_at :=
    CASE
      WHEN v_next_status = 'paid' THEN COALESCE(v_payment.paid_at, p_paid_at, now())
      ELSE v_payment.paid_at
    END;

  v_should_update :=
    v_payment.status IS DISTINCT FROM v_next_status OR
    (v_next_status = 'paid' AND v_payment.paid_at IS NULL AND v_resolved_paid_at IS NOT NULL) OR
    (p_due_at IS NOT NULL AND v_payment.expires_at IS DISTINCT FROM p_due_at);

  IF v_should_update THEN
    UPDATE public.payments
    SET
      status = v_next_status,
      paid_at = v_resolved_paid_at,
      expires_at = COALESCE(p_due_at, v_payment.expires_at),
      updated_at = now()
    WHERE id = v_payment.id;
  END IF;

  UPDATE public.payment_events
  SET
    event_type = 'webhook_processed',
    payload = COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object(
      'billId', p_billplz_id,
      'fingerprint', v_fingerprint,
      'currentStatus', v_payment.status,
      'nextStatus', v_next_status,
      'receivedAmountCents', p_received_amount_cents,
      'paid', p_paid,
      'state', p_state,
      'paidAt', p_paid_at,
      'dueAt', p_due_at
    )
  WHERE id = v_event_id;

  RETURN QUERY SELECT 'processed'::TEXT, v_payment.id, v_payment.status, v_next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.process_billplz_webhook_event(
  UUID, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_billplz_webhook_event(
  UUID, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, JSONB
) TO service_role;

COMMIT;
