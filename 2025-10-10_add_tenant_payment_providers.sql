-- Adds tenant-aware payment provider tables and fields for multi-gateway support.
-- Run this in Supabase SQL editor (write access required).

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'suspended')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_providers (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  capabilities jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.payment_providers (key, name, capabilities)
values
  ('billplz', 'Billplz', '{"webhooks": true, "recurring": false}'::jsonb),
  ('stripe', 'Stripe', '{"webhooks": true, "recurring": true, "oauth": true}'::jsonb)
on conflict (key) do nothing;

create table if not exists public.tenant_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_id uuid not null references public.payment_providers(id),
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled', 'error')),
  credentials_encrypted bytea,
  credentials_masked jsonb not null default '{}'::jsonb,
  webhook_secret_encrypted bytea,
  is_default boolean not null default false,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_id)
);

create unique index if not exists tenant_payment_accounts_one_default
  on public.tenant_payment_accounts (tenant_id)
  where is_default;

create table if not exists public.tenant_payment_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  currency text not null default 'MYR',
  invoice_prefix text not null default 'INV',
  payment_grace_days integer not null default 7 check (payment_grace_days >= 0),
  allow_manual_payments boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payments
  add column if not exists tenant_id uuid references public.tenants(id),
  add column if not exists provider_id uuid references public.payment_providers(id),
  add column if not exists provider_payment_id text,
  add column if not exists provider_status text,
  add column if not exists provider_metadata jsonb default '{}'::jsonb,
  add column if not exists provider_error text;

alter table public.payment_events
  add column if not exists tenant_id uuid references public.tenants(id),
  add column if not exists provider_id uuid references public.payment_providers(id),
  add column if not exists provider_event_id text;

alter table public.tenants enable row level security;
alter table public.payment_providers enable row level security;
alter table public.tenant_payment_accounts enable row level security;
alter table public.tenant_payment_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tenants'
      and policyname = 'admin_manage_tenants'
  ) then
    create policy admin_manage_tenants
      on public.tenants
      for all
      using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
      with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payment_providers'
      and policyname = 'payment_providers_read_auth'
  ) then
    create policy payment_providers_read_auth
      on public.payment_providers
      for select
      using (auth.uid() is not null);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payment_providers'
      and policyname = 'payment_providers_manage_admin'
  ) then
    create policy payment_providers_manage_admin
      on public.payment_providers
      for all
      using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
      with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tenant_payment_accounts'
      and policyname = 'tenant_payment_accounts_manage_admin'
  ) then
    create policy tenant_payment_accounts_manage_admin
      on public.tenant_payment_accounts
      for all
      using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
      with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tenant_payment_settings'
      and policyname = 'tenant_payment_settings_manage_admin'
  ) then
    create policy tenant_payment_settings_manage_admin
      on public.tenant_payment_settings
      for all
      using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
      with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
  end if;
end;
$$;
