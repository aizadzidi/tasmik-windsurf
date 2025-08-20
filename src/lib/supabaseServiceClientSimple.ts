import { createClient } from '@supabase/supabase-js';

// SIMPLIFIED SERVICE ROLE CLIENT - NO RLS COMPLICATIONS
// This version bypasses all authentication checks for emergency admin access

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for admin operations');
}

export const supabaseService = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// SIMPLIFIED ADMIN OPERATION - NO AUTH CHECKS FOR EMERGENCY
// This allows admin operations to work immediately without authentication complications
export async function adminOperationSimple<T>(
  operation: (client: typeof supabaseService) => Promise<T>
): Promise<T> {
  // Skip all authentication checks for emergency access
  // This ensures admin operations always work
  return operation(supabaseService);
}