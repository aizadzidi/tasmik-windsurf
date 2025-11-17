-- Ledger views to unify outstanding balance computation between admin and parent UI
-- Run inside Supabase SQL editor or via psql
BEGIN;

-- Manual adjustments so admins can seed or waive balances
CREATE TABLE IF NOT EXISTS public.parent_balance_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  child_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  fee_id UUID REFERENCES public.payment_fee_catalog(id) ON DELETE SET NULL,
  month_key DATE,
  amount_cents INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parent_balance_adjustments_parent
  ON public.parent_balance_adjustments (parent_id);

ALTER TABLE public.parent_balance_adjustments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'parent_balance_adjustments'
      AND policyname = 'admin_manage_parent_balance_adjustments'
  ) THEN
    CREATE POLICY admin_manage_parent_balance_adjustments
      ON public.parent_balance_adjustments
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
END $$;

-- View of payment line items that have actually moved money (paid/refunded)
CREATE OR REPLACE VIEW public.paid_line_items AS
WITH line_months AS (
  SELECT
    li.id AS line_item_id,
    p.id AS payment_id,
    p.parent_id,
    li.child_id,
    li.fee_id,
    CASE
      WHEN month_txt ~ '^[0-9]{4}-[0-9]{2}$'
        THEN to_date(month_txt || '-01', 'YYYY-MM-DD')::date
      ELSE NULL
    END AS month_key,
    li.subtotal_cents,
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
    WHEN status = 'paid' THEN subtotal_cents
    WHEN status = 'refunded' THEN -subtotal_cents
    ELSE 0
  END AS signed_amount_cents
FROM line_months
WHERE status IN ('paid', 'refunded')
  AND month_key IS NOT NULL;

-- Normalize child fee assignments into per-month dues (monthly cycle only for now)
CREATE OR REPLACE VIEW public.due_fee_months AS
SELECT
  s.parent_id,
  cfa.child_id,
  cfa.fee_id,
  due_month.month_key,
  COALESCE(cfa.custom_amount_cents, fee.amount_cents, 0) AS amount_cents
FROM public.child_fee_assignments cfa
JOIN public.students s ON s.id = cfa.child_id
JOIN public.payment_fee_catalog fee ON fee.id = cfa.fee_id
CROSS JOIN LATERAL (
  SELECT
    CASE
      WHEN month_txt ~ '^[0-9]{4}-[0-9]{2}$'
        THEN to_date(month_txt || '-01', 'YYYY-MM-DD')::date
      ELSE NULL
    END AS month_key
  FROM unnest(COALESCE(cfa.effective_months, ARRAY[]::text[])) AS month_txt
) AS due_month
WHERE cfa.is_active = true
  AND fee.is_active = true
  AND fee.billing_cycle = 'monthly'
  AND fee.is_optional = false
  AND due_month.month_key IS NOT NULL
  AND due_month.month_key <= date_trunc('month', now());

-- Parent level outstanding summary
CREATE OR REPLACE VIEW public.parent_outstanding_summary AS
WITH due_totals AS (
  SELECT parent_id, SUM(amount_cents) AS due_cents
  FROM public.due_fee_months
  GROUP BY parent_id
),
paid_totals AS (
  SELECT parent_id, SUM(signed_amount_cents) AS paid_cents
  FROM public.paid_line_items
  GROUP BY parent_id
),
adjustment_totals AS (
  SELECT parent_id, SUM(amount_cents) AS adjustment_cents
  FROM public.parent_balance_adjustments
  GROUP BY parent_id
)
SELECT
  COALESCE(d.parent_id, p.parent_id, a.parent_id) AS parent_id,
  COALESCE(d.due_cents, 0)
    - COALESCE(p.paid_cents, 0)
    - COALESCE(a.adjustment_cents, 0) AS outstanding_cents,
  COALESCE(d.due_cents, 0) AS total_due_cents,
  COALESCE(p.paid_cents, 0) AS total_paid_cents,
  COALESCE(a.adjustment_cents, 0) AS total_adjustment_cents
FROM due_totals d
FULL OUTER JOIN paid_totals p
  ON p.parent_id = d.parent_id
FULL OUTER JOIN adjustment_totals a
  ON a.parent_id = COALESCE(d.parent_id, p.parent_id);

-- Child level breakdown
CREATE OR REPLACE VIEW public.parent_child_outstanding AS
WITH due_totals AS (
  SELECT parent_id, child_id, SUM(amount_cents) AS due_cents
  FROM public.due_fee_months
  GROUP BY parent_id, child_id
),
paid_totals AS (
  SELECT parent_id, child_id, SUM(signed_amount_cents) AS paid_cents
  FROM public.paid_line_items
  GROUP BY parent_id, child_id
),
adjustment_totals AS (
  SELECT parent_id,
         child_id,
         SUM(amount_cents) AS adjustment_cents
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
parent_child_keys AS (
  SELECT parent_id, child_id FROM due_totals
  UNION
  SELECT parent_id, child_id FROM paid_totals
  UNION
  SELECT parent_id, child_id FROM adjustment_totals
)
SELECT
  keys.parent_id,
  keys.child_id,
  COALESCE(d.due_cents, 0)
    - COALESCE(p.paid_cents, 0)
    - COALESCE(a.adjustment_cents, 0) AS outstanding_cents,
  COALESCE(d.due_cents, 0) AS total_due_cents,
  COALESCE(p.paid_cents, 0) AS total_paid_cents,
  COALESCE(a.adjustment_cents, 0) AS total_adjustment_cents,
  COALESCE(dm.months, ARRAY[]::text[]) AS due_months
FROM parent_child_keys keys
LEFT JOIN due_totals d
  ON d.parent_id = keys.parent_id AND d.child_id IS NOT DISTINCT FROM keys.child_id
LEFT JOIN paid_totals p
  ON p.parent_id = keys.parent_id AND p.child_id IS NOT DISTINCT FROM keys.child_id
LEFT JOIN adjustment_totals a
  ON a.parent_id = keys.parent_id AND a.child_id IS NOT DISTINCT FROM keys.child_id
LEFT JOIN due_months dm
  ON dm.parent_id = keys.parent_id AND dm.child_id IS NOT DISTINCT FROM keys.child_id;

COMMIT;
