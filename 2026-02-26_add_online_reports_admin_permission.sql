-- Add missing permission key for online hafazan reports sub-admin toggle.
-- Safe to run multiple times.

begin;

insert into public.permissions (key, description)
values
  ('admin:online-reports', 'Access online hafazan reports')
on conflict (key) do update
set description = excluded.description;

commit;
