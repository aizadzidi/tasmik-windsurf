-- Grants SELECT on user_profiles to authenticated so RLS policies can apply.
-- Run this in Supabase SQL editor (write access required).

grant select on table public.user_profiles to authenticated;
