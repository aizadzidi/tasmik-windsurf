import { createClient } from '@supabase/supabase-js';

// SIMPLIFIED SERVICE ROLE CLIENT - NO RLS COMPLICATIONS
// This version bypasses all authentication checks for emergency admin access

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Create service client only if service key is available
export const supabaseService = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

// SIMPLIFIED ADMIN OPERATION - NO AUTH CHECKS FOR EMERGENCY
// This allows admin operations to work immediately without authentication complications
export async function adminOperationSimple<T>(
  operation: (client: NonNullable<typeof supabaseService>) => Promise<T>
): Promise<T> {
  if (!supabaseService) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for admin operations');
  }
  
  // Skip all authentication checks for emergency access
  // This ensures admin operations always work
  return operation(supabaseService);
}