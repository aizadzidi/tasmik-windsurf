-- Add admin page permissions for sub-admin access control.
-- Run via Supabase SQL editor or psql as coordinated.

begin;

insert into public.permissions (key, description)
values
  ('admin:dashboard', 'Access admin dashboard'),
  ('admin:crm', 'Access admin CRM'),
  ('admin:reports', 'Access admin reports'),
  ('admin:payments', 'Access admin payments'),
  ('admin:attendance', 'Access admin attendance'),
  ('admin:exam', 'Access admin exams'),
  ('admin:certificates', 'Access admin certificates'),
  ('admin:historical', 'Access admin historical entry'),
  ('admin:users', 'Access admin user roles')
on conflict (key) do nothing;

commit;
