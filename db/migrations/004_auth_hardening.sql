-- P3 auth hardening schema for HTTP-only cookie sessions, MFA enrollment,
-- and durable refresh-token revocation on logout.

create table if not exists user_mfa (
  user_id uuid not null references users(id) on delete cascade,
  method text not null check (method in ('totp','email_otp')),
  secret_encrypted text,
  enabled boolean not null default false,
  enrolled_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, method),
  check (method = 'totp' or secret_encrypted is null)
);

alter table user_mfa enable row level security;
alter table user_mfa force row level security;

create policy user_mfa_self on user_mfa
  using (
    current_setting('app.platform_mode', true) = 'on'
    or user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  )
  with check (
    current_setting('app.platform_mode', true) = 'on'
    or user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  );

create table if not exists platform_admin_mfa (
  admin_id uuid not null references platform_admins(id) on delete cascade,
  method text not null check (method in ('totp','email_otp')),
  secret_encrypted text,
  enabled boolean not null default false,
  enrolled_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (admin_id, method),
  check (method = 'totp' or secret_encrypted is null)
);

alter table platform_admin_mfa enable row level security;
alter table platform_admin_mfa force row level security;

create policy platform_admin_mfa_self on platform_admin_mfa
  using (
    current_setting('app.platform_mode', true) = 'on'
    or admin_id = nullif(current_setting('app.current_admin_id', true), '')::uuid
  )
  with check (
    current_setting('app.platform_mode', true) = 'on'
    or admin_id = nullif(current_setting('app.current_admin_id', true), '')::uuid
  );

create table if not exists refresh_token_blacklist (
  jti text primary key,
  user_id uuid references users(id) on delete cascade,
  admin_id uuid references platform_admins(id) on delete cascade,
  revoked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  reason text not null default 'logout' check (reason in ('logout','rotation_reuse','admin_revoked','compromised')),
  metadata jsonb not null default '{}',
  check (expires_at > revoked_at),
  check ((user_id is not null)::int + (admin_id is not null)::int = 1)
);

create index if not exists idx_refresh_blacklist_expiry
  on refresh_token_blacklist(expires_at);
create index if not exists idx_refresh_blacklist_user
  on refresh_token_blacklist(user_id, expires_at)
  where user_id is not null;
create index if not exists idx_refresh_blacklist_admin
  on refresh_token_blacklist(admin_id, expires_at)
  where admin_id is not null;

