export type FeeCategory = 'tuition' | 'club' | 'donation' | 'program' | 'other';

export type BillingCycle = 'monthly' | 'yearly' | 'one_time' | 'ad_hoc';

export interface FeeCustomAmount {
  userId: string;
  amountCents: number;
  note?: string | null;
}

export type FeeMetadata = {
  customAmounts?: FeeCustomAmount[];
} & Record<string, unknown>;

export type Fee = {
  id: string;
  name: string;
  amount_cents: number;
};

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
  metadata?: FeeMetadata;
}

export interface AdminParentUser {
  id: string;
  name: string | null;
  email: string | null;
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

export type BillplzCreateBody = {
  email?: string;
  name?: string;
  amount: number;
  description?: string;
  reference_1?: string;
  reference_2?: string;
  metadata?: Record<string, string | number | null>;
};

export type BillplzCreateResponse = {
  id: string;
  url: string;
  due_at?: string | null;
  reference_1?: string | null;
  amount?: number;
};

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

export interface AdminOutstandingSummary {
  totalOutstandingCents: number;
  totalDueCents: number;
  totalPaidAgainstDueCents: number;
  totalAdjustmentsCents: number;
  totalCollectedCents: number;
}

export interface ParentOutstandingRow {
  parentId: string;
  parent: { name: string | null; email: string | null } | null;
  outstandingCents: number;
  totalDueCents: number;
  totalPaidCents: number;
  totalAdjustmentCents: number;
}

export interface ParentBalanceAdjustment {
  id: string;
  parentId: string;
  childId?: string | null;
  feeId?: string | null;
  monthKey?: string | null;
  amountCents: number;
  reason: string;
  createdBy?: string | null;
  createdAt: string;
}

export interface ParentOutstandingBreakdown {
  totalOutstandingCents: number;
  totalDueCents: number;
  totalPaidCents: number;
  totalAdjustmentCents: number;
  childBreakdown: Array<{
    childId: string | null;
    childName: string;
    outstandingCents: number;
    totalDueCents: number;
    totalPaidCents: number;
    totalAdjustmentCents: number;
    dueMonths: string[];
  }>;
}

export function isBillplzCreateBody(x: unknown): x is BillplzCreateBody {
  if (!x || typeof x !== 'object') return false;
  const candidate = x as Record<string, unknown>;
  if (!('amount' in candidate) || typeof candidate.amount !== 'number') {
    return false;
  }
  if ('metadata' in candidate && candidate.metadata !== undefined) {
    if (
      candidate.metadata === null ||
      typeof candidate.metadata !== 'object' ||
      Array.isArray(candidate.metadata)
    ) {
      return false;
    }
  }
  return true;
}
