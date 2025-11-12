export type FeeCategory = 'tuition' | 'club' | 'donation' | 'program' | 'other';

export type BillingCycle = 'monthly' | 'yearly' | 'one_time' | 'ad_hoc';

export interface FeeCatalogItem {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  category: FeeCategory;
  billing_cycle: BillingCycle;
  amount_cents: number;
  is_optional: boolean;
  is_active: boolean;
  sort_order: number;
  metadata?: Record<string, unknown>;
}

export interface ChildFeeAssignment {
  id: string;
  child_id: string;
  fee_id: string;
  custom_amount_cents?: number | null;
  effective_months?: string[] | null;
  notes?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  child?: {
    id: string;
    name: string;
  };
  fee?: FeeCatalogItem;
}

export type PaymentStatus =
  | 'draft'
  | 'initiated'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'refunded';

export interface PaymentLineItem {
  id: string;
  payment_id: string;
  child_id?: string | null;
  fee_id?: string | null;
  label: string;
  quantity: number;
  unit_amount_cents: number;
  subtotal_cents: number;
  metadata?: Record<string, unknown>;
}

export interface PaymentRecord {
  id: string;
  parent_id: string;
  status: PaymentStatus;
  total_amount_cents: number;
  merchant_fee_cents: number;
  currency: string;
  payable_months?: string[] | null;
  redirect_url?: string | null;
  billplz_id?: string | null;
  paid_at?: string | null;
  expires_at?: string | null;
  created_at?: string;
  updated_at?: string;
  line_items?: PaymentLineItem[];
}

export interface BillplzBill {
  id: string;
  collection_id: string;
  paid: boolean;
  state: 'pending' | 'paid' | 'overdue';
  url: string;
  reference_1?: string;
  amount: number; // in cents
  due_at?: string;
  paid_at?: string;
}

export interface BillplzCreateResponse {
  id: string;
  url: string;
  due_at: string | null;
  reference_1: string | null;
  amount: number;
}

export interface BillplzCallbackPayload {
  id: string;
  collection_id: string;
  paid: string;
  state: string;
  amount: string;
  paid_at: string | null;
  due_at: string | null;
  url: string;
  x_signature?: string;
  [key: string]: string | null | undefined;
}

export interface PaymentCartItem {
  childId: string;
  childName: string;
  feeId: string;
  feeName: string;
  months: string[];
  quantity: number;
  unitAmountCents: number;
  subtotalCents: number;
}

export interface PaymentPreview {
  items: PaymentCartItem[];
  totalCents: number;
  merchantFeeCents: number;
  payableMonths: string[];
}
