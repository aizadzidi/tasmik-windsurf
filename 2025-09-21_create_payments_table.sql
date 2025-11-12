-- Payment data model for parent-facing Billplz checkout
-- Run inside Supabase SQL editor or psql

BEGIN;

-- Catalog of billable items (tuition, club fees, donations, etc.)
CREATE TABLE IF NOT EXISTS public.payment_fee_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'tuition',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly', -- monthly | yearly | one_time | ad_hoc
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  is_optional BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_fee_catalog_active
  ON public.payment_fee_catalog (is_active, category, billing_cycle);

-- Assignment of catalog items to students (children)
CREATE TABLE IF NOT EXISTS public.child_fee_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  fee_id UUID NOT NULL REFERENCES public.payment_fee_catalog(id) ON DELETE CASCADE,
  custom_amount_cents INTEGER CHECK (custom_amount_cents >= 0),
  effective_months TEXT[] DEFAULT ARRAY[]::TEXT[], -- e.g. {'2025-01','2025-02'}
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(child_id, fee_id)
);

CREATE INDEX IF NOT EXISTS idx_child_fee_assignments_child
  ON public.child_fee_assignments (child_id)
  WHERE is_active = true;

-- Parent payment records
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  billplz_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft','initiated','pending','paid','failed','expired','refunded')
  ),
  total_amount_cents INTEGER NOT NULL DEFAULT 0,
  merchant_fee_cents INTEGER NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'MYR',
  payable_months TEXT[] DEFAULT ARRAY[]::TEXT[],
  redirect_url TEXT,
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_parent_status
  ON public.payments (parent_id, status, created_at DESC);

-- Line items captured when a payment is created
CREATE TABLE IF NOT EXISTS public.payment_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  child_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  fee_id UUID REFERENCES public.payment_fee_catalog(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount_cents INTEGER NOT NULL CHECK (unit_amount_cents >= 0),
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_payment_line_items_payment
  ON public.payment_line_items (payment_id);

-- Status/history log for auditing Billplz callbacks
CREATE TABLE IF NOT EXISTS public.payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  source TEXT NOT NULL, -- e.g. 'app', 'billplz-callback'
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_payment
  ON public.payment_events (payment_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.payment_fee_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_fee_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- Policies -------------------------------------------------------------------

-- Fee catalog: allow admins full access, authenticated users read-only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public'
      AND tablename = 'payment_fee_catalog'
      AND policyname = 'admin_can_manage_fee_catalog'
  ) THEN
    CREATE POLICY admin_can_manage_fee_catalog ON public.payment_fee_catalog
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

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public'
      AND tablename = 'payment_fee_catalog'
      AND policyname = 'authenticated_can_read_fee_catalog'
  ) THEN
    CREATE POLICY authenticated_can_read_fee_catalog ON public.payment_fee_catalog
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- Fee assignments: admin manage, parents read their children
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public'
      AND tablename = 'child_fee_assignments'
      AND policyname = 'admin_can_manage_child_fee_assignments'
  ) THEN
    CREATE POLICY admin_can_manage_child_fee_assignments ON public.child_fee_assignments
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

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public'
      AND tablename = 'child_fee_assignments'
      AND policyname = 'parents_read_child_fee_assignments'
  ) THEN
    CREATE POLICY parents_read_child_fee_assignments ON public.child_fee_assignments
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.students s
          WHERE s.id = child_fee_assignments.child_id
            AND s.parent_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Payments: parents manage their own rows, admins full access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public'
      AND tablename = 'payments'
      AND policyname = 'admin_can_manage_payments'
  ) THEN
    CREATE POLICY admin_can_manage_payments ON public.payments
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

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public'
      AND tablename = 'payments'
      AND policyname = 'parents_manage_own_payments'
  ) THEN
    CREATE POLICY parents_manage_own_payments ON public.payments
      USING (parent_id = auth.uid())
      WITH CHECK (parent_id = auth.uid());
  END IF;
END $$;

-- Payment line items: parents read their own via payment relationship
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public'
      AND tablename = 'payment_line_items'
      AND policyname = 'admin_can_manage_payment_line_items'
  ) THEN
    CREATE POLICY admin_can_manage_payment_line_items ON public.payment_line_items
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

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public'
      AND tablename = 'payment_line_items'
      AND policyname = 'parents_read_own_payment_line_items'
  ) THEN
    CREATE POLICY parents_read_own_payment_line_items ON public.payment_line_items
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.payments p
          WHERE p.id = payment_line_items.payment_id
            AND p.parent_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Payment events: admins full access, parents read own payment history
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public'
      AND tablename = 'payment_events'
      AND policyname = 'admin_can_manage_payment_events'
  ) THEN
    CREATE POLICY admin_can_manage_payment_events ON public.payment_events
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

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public'
      AND tablename = 'payment_events'
      AND policyname = 'parents_read_payment_events'
  ) THEN
    CREATE POLICY parents_read_payment_events ON public.payment_events
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.payments p
          WHERE p.id = payment_events.payment_id
            AND p.parent_id = auth.uid()
        )
      );
  END IF;
END $$;

COMMIT;
