-- Provider-neutral billing schema shared by Midtrans and Xendit integrations.
-- Monetary values are integer Rupiah stored as bigint. Plan rows are global;
-- subscriptions, invoices, and usage counters are tenant-owned and protected by RLS.

create table plans (
  id uuid primary key default uuid_v7(),
  code text unique not null,
  name text not null,
  price_idr bigint not null check (price_idr >= 0),
  quota jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  plan_id uuid not null references plans(id),
  status text not null check (status in ('trialing','active','past_due','suspended','canceled')),
  trial_ends_at timestamptz,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  psp_provider text,
  psp_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (psp_provider, psp_subscription_id),
  check ((psp_provider is null and psp_subscription_id is null) or (psp_provider is not null and psp_subscription_id is not null)),
  check (psp_provider is null or psp_provider in ('midtrans','xendit'))
);

create table invoices (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  subscription_id uuid not null,
  amount_idr bigint not null check (amount_idr >= 0),
  status text not null check (status in ('pending','paid','failed','expired','refunded')),
  psp_provider text not null check (psp_provider in ('midtrans','xendit')),
  psp_order_id text unique not null,
  psp_transaction_id text,
  payment_method text,
  due_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, subscription_id) references subscriptions(tenant_id, id) on delete cascade,
  check (paid_at is null or status = 'paid')
);

create table usage_counters (
  tenant_id uuid not null references tenants(id) on delete cascade,
  period_start date not null,
  metric text not null,
  value bigint not null default 0 check (value >= 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, period_start, metric)
);

select apply_tenant_rls('subscriptions');
select apply_tenant_rls('invoices');
select apply_tenant_rls('usage_counters');

create index subscriptions_tenant_active_idx on subscriptions (tenant_id) where status in ('trialing','active');
create index subscriptions_plan_status_idx on subscriptions (plan_id, status);
create index invoices_tenant_pending_idx on invoices (tenant_id, status, due_at);
create index invoices_subscription_created_idx on invoices (tenant_id, subscription_id, created_at);
create index invoices_psp_provider_order_idx on invoices (psp_provider, psp_order_id);
create index usage_counters_tenant_period_idx on usage_counters (tenant_id, period_start);
