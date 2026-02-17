-- Enterprise-grade hardening for payment workflow
-- Apply in Supabase SQL editor (staging first, then production)

BEGIN;

-- 1) Persist idempotency key on payments for DB-level duplicate protection
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

UPDATE public.payments
SET idempotency_key = NULL
WHERE idempotency_key IS NOT NULL
  AND idempotency_key !~ '^[A-Za-z0-9:_-]{12,120}$';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_idempotency_key_format_check'
      AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_idempotency_key_format_check
      CHECK (
        idempotency_key IS NULL
        OR idempotency_key ~ '^[A-Za-z0-9:_-]{12,120}$'
      );
  END IF;
END $$;

-- Backfill keys from line item metadata if available
WITH line_item_keys AS (
  SELECT
    li.payment_id,
    MAX(li.metadata ->> 'idempotencyKey') AS idempotency_key
  FROM public.payment_line_items li
  WHERE li.metadata ? 'idempotencyKey'
  GROUP BY li.payment_id
)
UPDATE public.payments p
SET idempotency_key = line_item_keys.idempotency_key
FROM line_item_keys
WHERE p.id = line_item_keys.payment_id
  AND p.idempotency_key IS NULL
  AND line_item_keys.idempotency_key IS NOT NULL
  AND line_item_keys.idempotency_key ~ '^[A-Za-z0-9:_-]{12,120}$';

WITH duplicate_keys AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, parent_id, idempotency_key
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.payments
  WHERE idempotency_key IS NOT NULL
)
UPDATE public.payments p
SET idempotency_key = NULL
FROM duplicate_keys d
WHERE p.id = d.id
  AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS payments_tenant_parent_idempotency_key_uidx
  ON public.payments (tenant_id, parent_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 2) Enforce allowed status transitions at DB-level
CREATE OR REPLACE FUNCTION public.enforce_payment_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  is_allowed BOOLEAN := FALSE;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    CASE OLD.status
      WHEN 'draft' THEN
        is_allowed := NEW.status IN ('initiated');
      WHEN 'initiated' THEN
        is_allowed := NEW.status IN ('pending', 'paid', 'failed', 'expired');
      WHEN 'pending' THEN
        is_allowed := NEW.status IN ('paid', 'failed', 'expired');
      WHEN 'failed' THEN
        is_allowed := NEW.status IN ('pending', 'paid', 'expired');
      WHEN 'expired' THEN
        is_allowed := NEW.status IN ('pending', 'paid', 'failed');
      WHEN 'paid' THEN
        is_allowed := NEW.status IN ('paid', 'refunded');
      WHEN 'refunded' THEN
        is_allowed := NEW.status = 'refunded';
      ELSE
        is_allowed := FALSE;
    END CASE;

    IF NOT is_allowed THEN
      RAISE EXCEPTION
        'Invalid payment status transition: % -> %',
        OLD.status,
        NEW.status
      USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.status = 'paid' AND NEW.paid_at IS NULL THEN
    NEW.paid_at := COALESCE(OLD.paid_at, now());
  END IF;

  IF NEW.status <> 'paid' AND OLD.status = 'paid' THEN
    NEW.paid_at := OLD.paid_at;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_payment_status_transition ON public.payments;
CREATE TRIGGER trg_enforce_payment_status_transition
BEFORE UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_payment_status_transition();

COMMIT;
