-- Self-serve signup token storage for the pre-auth email verification flow.
-- Signup tokens are intentionally not tenant-scoped: they exist before a tenant
-- and owner user are provisioned, so access is guarded by token secrecy plus
-- route-level rate limiting.
create table if not exists signup_tokens (
  token text primary key,
  email text not null,
  payload jsonb not null,
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists idx_signup_tokens_expiry
  on signup_tokens(expires_at);

-- Supports rate-limit and duplicate-active-token checks by normalized email while
-- keeping consumed tokens out of the hot path.
create index if not exists idx_signup_tokens_email_active
  on signup_tokens(lower(email), expires_at)
  where consumed_at is null;

grant select, insert, update, delete on signup_tokens to app;
grant all on signup_tokens to app_admin;
