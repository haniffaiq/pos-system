create extension if not exists pgcrypto;

-- UUID v7 helper (time-sortable). Stores the current millisecond timestamp in
-- the high 48 bits, then sets the RFC 9562 version and variant bits over
-- pgcrypto-provided randomness.
create or replace function uuid_v7() returns uuid as $$
  with bytes as (
    select overlay(
      uuid_send(gen_random_uuid())
      placing substring(
        int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint)
        from 3
      )
      from 1 for 6
    ) as b
  )
  select encode(
    set_byte(
      set_byte(b, 6, (get_byte(b, 6) & 15) | 112),
      8, (get_byte(b, 8) & 63) | 128
    ),
    'hex'
  )::uuid
  from bytes;
$$ language sql volatile;

create table platform_admins (
  id            uuid primary key default uuid_v7(),
  email         text unique not null,
  password_hash text not null,
  name          text not null,
  created_at    timestamptz not null default now()
);

create table tenants (
  id         uuid primary key default uuid_v7(),
  name       text not null,
  slug       text unique not null,
  sector     text not null check (sector in ('grosir','retail','fnb','jasa','apotek')),
  status     text not null default 'active' check (status in ('active','suspended')),
  settings   jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table platform_audit_log (
  id         uuid primary key default uuid_v7(),
  admin_id   uuid references platform_admins(id),
  action     text not null,
  target     text,
  meta       jsonb not null default '{}',
  created_at timestamptz not null default now()
);
