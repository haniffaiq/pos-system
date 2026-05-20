-- Tenant-scoped users table protected by RLS. The shared-instance owner
-- provisions the database, role, and object ownership; this migration defines
-- only schema and policy. Platform queries bypass RLS via the app.platform_mode
-- session GUC (set as a connection option on the admin pool).
create table users (
  id            uuid primary key default uuid_v7(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  email         text not null,
  password_hash text not null,
  name          text not null,
  role          text not null check (role in ('owner','manager','cashier')),
  status        text not null default 'active' check (status in ('active','suspended')),
  created_at    timestamptz not null default now(),
  unique (tenant_id, email)
);

alter table users enable row level security;
alter table users force row level security;

create policy users_tenant_isolation on users
  using (
    current_setting('app.platform_mode', true) = 'on'
    or tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  with check (
    current_setting('app.platform_mode', true) = 'on'
    or tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );
