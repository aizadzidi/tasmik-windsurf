-- Payment hardening:
-- 1) strict fee-month reconciliation in outstanding ledger views
-- 2) DB-backed rate limiting primitive for multi-instance deployments

BEGIN;

-- ---------------------------------------------------------------------------
-- DB-backed rate limiting
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_updated_at
  ON public.api_rate_limits (updated_at);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining INTEGER,
  retry_after_seconds INTEGER
)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_window_seconds INTEGER := GREATEST(COALESCE(p_window_seconds, 1), 1);
  v_window INTERVAL := make_interval(secs => v_window_seconds);
  v_count INTEGER := 0;
  v_reset_at TIMESTAMPTZ := v_now + v_window;
BEGIN
  IF p_key IS NULL OR length(trim(p_key)) = 0 THEN
    RAISE EXCEPTION 'p_key is required';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 THEN
    RAISE EXCEPTION 'p_limit must be >= 1';
  END IF;

  DELETE FROM public.api_rate_limits
  WHERE updated_at < (v_now - INTERVAL '1 day');

  INSERT INTO public.api_rate_limits AS rl (key, window_start, count, updated_at)
  VALUES (p_key, v_now, 1, v_now)
  ON CONFLICT (key)
  DO UPDATE
    SET count = CASE
        WHEN (v_now - rl.window_start) >= v_window THEN 1
        ELSE rl.count + 1
      END,
      window_start = CASE
        WHEN (v_now - rl.window_start) >= v_window THEN v_now
        ELSE rl.window_start
      END,
      updated_at = v_now
  RETURNING count, (window_start + v_window)
  INTO v_count, v_reset_at;

  RETURN QUERY
  SELECT
    (v_count <= p_limit) AS allowed,
    GREATEST(p_limit - v_count, 0) AS remaining,
    GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_reset_at - v_now)))::INTEGER) AS retry_after_seconds;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- Reconciliation hardening: strict matching by parent + child + fee + month
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.paid_line_items AS
WITH line_months AS (
  SELECT
    p.id AS payment_id,
    p.parent_id,
    li.child_id,
    li.fee_id,
    CASE
      WHEN month_txt ~ '^[0-9]{4}-[0-9]{2}$'
        THEN to_date(month_txt || '-01', 'YYYY-MM-DD')::date
      ELSE NULL
    END AS month_key,
    li.unit_amount_cents,
    p.status
  FROM public.payment_line_items li
  JOIN public.payments p ON p.id = li.payment_id
  LEFT JOIN LATERAL jsonb_array_elements_text(li.metadata -> 'months') AS months(month_txt) ON true
)
SELECT
  payment_id,
  parent_id,
  child_id,
  fee_id,
  month_key,
  CASE
    WHEN status = 'paid' THEN GREATEST(unit_amount_cents, 0)
    WHEN status = 'refunded' THEN -GREATEST(unit_amount_cents, 0)
    ELSE 0
  END AS signed_amount_cents
FROM line_months
WHERE status IN ('paid', 'refunded')
  AND month_key IS NOT NULL;

CREATE OR REPLACE VIEW public.parent_fee_month_balances AS
WITH due_totals AS (
  SELECT
    parent_id,
    child_id,
    fee_id,
    month_key,
    SUM(amount_cents)::bigint AS due_cents
  FROM public.due_fee_months
  GROUP BY parent_id, child_id, fee_id, month_key
),
paid_totals AS (
  SELECT
    parent_id,
    child_id,
    fee_id,
    month_key,
    SUM(signed_amount_cents)::bigint AS paid_cents
  FROM public.paid_line_items
  GROUP BY parent_id, child_id, fee_id, month_key
)
SELECT
  COALESCE(d.parent_id, p.parent_id) AS parent_id,
  COALESCE(d.child_id, p.child_id) AS child_id,
  COALESCE(d.fee_id, p.fee_id) AS fee_id,
  COALESCE(d.month_key, p.month_key) AS month_key,
  COALESCE(d.due_cents, 0::bigint) AS due_cents,
  GREATEST(COALESCE(p.paid_cents, 0::bigint), 0::bigint) AS paid_cents,
  LEAST(
    GREATEST(COALESCE(p.paid_cents, 0::bigint), 0::bigint),
    COALESCE(d.due_cents, 0::bigint)
  ) AS paid_against_due_cents,
  GREATEST(
    COALESCE(d.due_cents, 0::bigint) - LEAST(
      GREATEST(COALESCE(p.paid_cents, 0::bigint), 0::bigint),
      COALESCE(d.due_cents, 0::bigint)
    ),
    0::bigint
  ) AS outstanding_cents
FROM due_totals d
FULL OUTER JOIN paid_totals p
  ON p.parent_id = d.parent_id
  AND p.child_id IS NOT DISTINCT FROM d.child_id
  AND p.fee_id IS NOT DISTINCT FROM d.fee_id
  AND p.month_key IS NOT DISTINCT FROM d.month_key;

CREATE OR REPLACE VIEW public.parent_outstanding_summary AS
WITH due_paid_totals AS (
  SELECT
    parent_id,
    SUM(due_cents)::bigint AS due_cents,
    SUM(paid_against_due_cents)::bigint AS paid_against_due_cents,
    SUM(outstanding_cents)::bigint AS due_outstanding_cents
  FROM public.parent_fee_month_balances
  GROUP BY parent_id
),
adjustment_totals AS (
  SELECT parent_id, SUM(amount_cents)::bigint AS adjustment_cents
  FROM public.parent_balance_adjustments
  GROUP BY parent_id
)
SELECT
  COALESCE(dp.parent_id, a.parent_id) AS parent_id,
  (COALESCE(dp.due_outstanding_cents, 0::bigint) + COALESCE(a.adjustment_cents, 0::bigint))::bigint AS outstanding_cents,
  COALESCE(dp.due_cents, 0::bigint)::bigint AS total_due_cents,
  COALESCE(dp.paid_against_due_cents, 0::bigint)::bigint AS total_paid_cents,
  COALESCE(a.adjustment_cents, 0::bigint)::bigint AS total_adjustment_cents
FROM due_paid_totals dp
FULL OUTER JOIN adjustment_totals a
  ON a.parent_id = dp.parent_id;

CREATE OR REPLACE VIEW public.parent_child_outstanding AS
WITH due_paid_totals AS (
  SELECT
    parent_id,
    child_id,
    SUM(due_cents)::bigint AS due_cents,
    SUM(paid_against_due_cents)::bigint AS paid_against_due_cents,
    SUM(outstanding_cents)::bigint AS due_outstanding_cents
  FROM public.parent_fee_month_balances
  GROUP BY parent_id, child_id
),
adjustment_totals AS (
  SELECT parent_id, child_id, SUM(amount_cents)::bigint AS adjustment_cents
  FROM public.parent_balance_adjustments
  GROUP BY parent_id, child_id
),
due_months AS (
  SELECT
    parent_id,
    child_id,
    ARRAY_AGG(DISTINCT to_char(month_key, 'YYYY-MM') ORDER BY to_char(month_key, 'YYYY-MM')) AS months
  FROM public.due_fee_months
  GROUP BY parent_id, child_id
),
adjustment_months AS (
  SELECT
    parent_id,
    child_id,
    ARRAY_AGG(DISTINCT to_char(month_key, 'YYYY-MM') ORDER BY to_char(month_key, 'YYYY-MM')) AS months
  FROM public.parent_balance_adjustments
  WHERE month_key IS NOT NULL
  GROUP BY parent_id, child_id
),
parent_child_keys AS (
  SELECT parent_id, child_id FROM due_paid_totals
  UNION
  SELECT parent_id, child_id FROM adjustment_totals
)
SELECT
  keys.parent_id,
  keys.child_id,
  (COALESCE(dp.due_outstanding_cents, 0::bigint) + COALESCE(a.adjustment_cents, 0::bigint))::bigint AS outstanding_cents,
  COALESCE(dp.due_cents, 0::bigint)::bigint AS total_due_cents,
  COALESCE(dp.paid_against_due_cents, 0::bigint)::bigint AS total_paid_cents,
  COALESCE(a.adjustment_cents, 0::bigint)::bigint AS total_adjustment_cents,
  (
    SELECT array(
      SELECT DISTINCT m
      FROM unnest(COALESCE(dm.months, ARRAY[]::text[]) || COALESCE(am.months, ARRAY[]::text[])) AS t(m)
      ORDER BY m
    )
  ) AS due_months
FROM parent_child_keys keys
LEFT JOIN due_paid_totals dp
  ON dp.parent_id = keys.parent_id AND dp.child_id IS NOT DISTINCT FROM keys.child_id
LEFT JOIN adjustment_totals a
  ON a.parent_id = keys.parent_id AND a.child_id IS NOT DISTINCT FROM keys.child_id
LEFT JOIN due_months dm
  ON dm.parent_id = keys.parent_id AND dm.child_id IS NOT DISTINCT FROM keys.child_id
LEFT JOIN adjustment_months am
  ON am.parent_id = keys.parent_id AND am.child_id IS NOT DISTINCT FROM keys.child_id;

COMMIT;
