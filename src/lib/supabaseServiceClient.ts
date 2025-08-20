import { createClient } from '@supabase/supabase-js';

// SERVICE ROLE CLIENT - BYPASSES RLS FOR ADMIN OPERATIONS
// This client has full database access and is used for:
// - Admin dashboard operations  
// - Data management that requires cross-user access
// - System operations that need to bypass security policies

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // You'll need to add this

if (!supabaseServiceKey) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY is required for admin operations. ' +
    'Get it from Supabase Dashboard > Settings > API > service_role secret'
  );
}

export const supabaseService = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// SMART CLIENT SELECTOR
// Automatically chooses the right client based on user role and operation type
export async function getSupabaseClient(requiresAdminAccess = false) {
  if (requiresAdminAccess) {
    return supabaseService;
  }
  
  // For regular operations, use the auth client
  const { supabase } = await import('./supabaseClient');
  return supabase;
}

// ADMIN OPERATION WRAPPER
// Use this for any operation that needs admin-level access
export async function adminOperation<T>(
  operation: (client: typeof supabaseService) => Promise<T>
): Promise<T> {
  // Verify the current user is actually an admin
  const { supabase } = await import('./supabaseClient');
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Must be authenticated to perform admin operations');
  }
  
  // Check if user is admin using the service client (bypasses RLS)
  const { data: userProfile } = await supabaseService
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
    
  if (userProfile?.role !== 'admin') {
    throw new Error('Admin access required for this operation');
  }
  
  // Perform the operation with service role client
  return operation(supabaseService);
}