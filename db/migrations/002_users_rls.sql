-- DB roles. app_admin bypasses RLS for platform queries.
do $$ begin
  if not exists (select from pg_roles where rolname = 'app_admin') then
    create role app_admin login password 'admin_dev_pw' bypassrls;
  end if;
end $$;

alter role app_admin with login password 'admin_dev_pw' bypassrls;

grant all on all tables in schema public to app_admin;
alter default privileges in schema public grant all on tables to app_admin;

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

create policy users_tenant_isolation on users
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

grant select, insert, update, delete on users to app;
