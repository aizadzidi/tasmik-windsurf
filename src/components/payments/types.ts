import type { BillingCycle, FeeCategory, PaymentCartItem } from '@/types/payments';

export interface FamilyFeeItem {
  assignmentId: string;
  childId: string;
  childName: string;
  feeId: string;
  feeName: string;
  description?: string | null;
  amountCents: number;
  billingCycle: BillingCycle;
  category: FeeCategory;
  isOptional: boolean;
}

export interface FeeSelectionState {
  include: boolean;
  months: string[];
  quantity: number;
}

export interface MonthOption {
  key: string;
  label: string;
}

export interface PaymentBreakdownProps {
  cartItems: PaymentCartItem[];
  totalCents: number;
  merchantFeeCents: number;
  isSubmitting: boolean;
  onCheckout: () => void;
}

export type OutstandingStatus = 'past_due' | 'due_now' | 'upcoming';

export interface OutstandingChildSummary {
  childId: string;
  childName: string;
  amountCents: number;
  months: string[];
  status: OutstandingStatus;
}
