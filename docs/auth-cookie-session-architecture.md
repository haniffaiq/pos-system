# P3 Cookie / Session Auth Architecture

Status: design for BRS-P3-R1
Scope: P3 auth migration only. This document intentionally makes no runtime code changes.

## Goal

Move BroSolution browser authentication away from bearer tokens persisted in `localStorage` to HTTP-only secure cookie/session semantics during P3.

The current implementation returns access and refresh JWTs in JSON, stores them in `apps/web/src/lib/auth.ts` under `localStorage` key `owa.session`, attaches an Authorization bearer header in `apps/web/src/lib/api.ts`, and sends refresh tokens in JSON bodies. P3 must replace that browser dependency with:

- HTTP-only cookies for access/session and refresh material.
- `credentials: "include"` on browser API calls.
- CSRF validation on every state-changing browser request.
- Server-side refresh-token rotation and revocation.
- MFA challenge flow before cookies are minted for privileged users.
- Logout invalidation that clears cookies and revokes the current refresh jti.

Non-browser API clients can keep bearer-token support behind the existing `Authorization` header path if needed, but the Next.js app must stop reading/writing access or refresh tokens from `localStorage`.

## Constraints from current code

Current auth surface:

- API routes: `apps/api/src/routes/auth.routes.ts`
  - `POST /api/v1/auth/tenant-login`
  - `POST /api/v1/auth/admin-login`
  - `POST /api/v1/auth/refresh`
  - `POST /api/v1/auth/logout`
- Token issue/verify: `apps/api/src/lib/jwt.ts`
- Refresh jti allow-list in Redis: `apps/api/src/lib/refreshStore.ts`
- Auth middleware only reads bearer header: `apps/api/src/middleware/auth.ts`
- Web session storage: `apps/web/src/lib/auth.ts`
- Web API client: `apps/web/src/lib/api.ts`
- Login UI stores returned tokens: `apps/web/src/components/LoginForm.tsx`
- Route guards read localStorage role/tenant metadata: `apps/web/src/components/RequireRole.tsx`, app/admin and tenant layouts.

## Target cookie contract

Set three cookies for browser sessions:

| Cookie | HttpOnly | SameSite | Secure | Path | Contents | TTL |
|---|---:|---|---:|---|---|---|
| `brs_access` (or `SESSION_COOKIE_NAME`, default `brs_access`) | yes | `Lax` | yes in prod | `/` | short-lived access JWT | `ACCESS_TOKEN_TTL` |
| `brs_refresh` | yes | `Strict` or `Lax` | yes in prod | `/api/v1/auth` | refresh JWT with jti | `REFRESH_TOKEN_TTL` |
| `brs_csrf` | no | `Lax` | yes in prod | `/` | random CSRF token mirrored in header | session / access TTL |

Environment:

- `SESSION_COOKIE_NAME=brs_access`
- `SESSION_COOKIE_DOMAIN=` optional, unset for local dev.
- `SESSION_COOKIE_SECURE=true` in production, false only for local HTTP dev.
- Keep `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ACCESS_TOKEN_TTL`, and `REFRESH_TOKEN_TTL` as signing/TTL inputs.

Cookie attributes:

- `HttpOnly` on `brs_access` and `brs_refresh` so browser JavaScript cannot read tokens.
- `Secure` when `NODE_ENV=production` or `SESSION_COOKIE_SECURE=true`.
- `SameSite=Lax` for the access cookie to allow normal top-level navigation but block cross-site subrequest credentials in modern browsers.
- Prefer `SameSite=Strict` for the refresh cookie if same-site deployments allow it; otherwise `Lax` is acceptable.
- `brs_refresh` path should be limited to `/api/v1/auth` so it is not sent to every API endpoint.

## CSRF strategy

Use a signed double-submit design:

1. On successful login/MFA/refresh, generate a random CSRF secret with `crypto.randomBytes(32)`.
2. Set a readable `brs_csrf` cookie with the random value.
3. Also include a signed/hash binding of the CSRF value to the refresh jti in the server-side refresh session record in Redis.
4. Browser API helper reads `brs_csrf` and sends `x-csrf-token: <cookie value>` on state-changing requests.
5. API CSRF middleware enforces header/cookie equality and server-side binding to the refresh/session jti for unsafe methods: `POST`, `PUT`, `PATCH`, `DELETE`.
6. Exempt only authentication bootstrap endpoints that do not yet have a session: `POST /auth/tenant-login`, `POST /auth/admin-login`, `POST /auth/mfa/challenge/send-email`, and `POST /auth/mfa/challenge/verify`. Do not exempt `/auth/refresh` or `/auth/logout` once cookies exist.

Recommended middleware order for protected/state-changing routes:

1. Request logging / metrics.
2. Cookie-aware auth middleware.
3. CSRF middleware for unsafe methods.
4. Route handler.

Response on CSRF failure:

```json
{ "error": { "code": "csrf_invalid", "message": "Invalid CSRF token" } }
```

Use HTTP 403.

## Session / refresh lifecycle

### Login without MFA

1. Client posts email/password to `/api/v1/auth/tenant-login` or `/api/v1/auth/admin-login` with `credentials: "include"`.
2. API validates credentials exactly as current `loginTenantUser` / `loginPlatformAdmin` do.
3. If MFA is not required, API issues access and refresh JWTs via existing signing helpers.
4. API persists the refresh jti in Redis with metadata:
   - `user_id`
   - `tenant_id`
   - `role`
   - `refresh_jti`
   - `csrf_hash`
   - `expires_at`
   - optional `mfa_level` (`none` or `totp` / `email_otp`)
5. API sets `brs_access`, `brs_refresh`, and `brs_csrf` cookies.
6. JSON response returns only safe identity metadata, not tokens:

```json
{
  "user": { "id": "...", "tenantId": "...", "email": "...", "name": "...", "role": "cashier" }
}
```

For platform admin, use `admin` metadata as today but no token fields.

### Accessing protected routes

1. Browser uses `apiFetch(path, { credentials: "include" })`.
2. `authMiddleware` first attempts to read `brs_access` from cookies.
3. If absent, it may fall back to current bearer header support for non-browser clients.
4. API verifies JWT as today and sets `c.set("auth", payload)`.
5. State-changing requests additionally pass CSRF middleware.

### Refresh

1. Client calls `POST /api/v1/auth/refresh` with `credentials: "include"` and `x-csrf-token`.
2. API reads refresh JWT from `brs_refresh` cookie; do not accept browser refresh tokens in JSON after migration.
3. API verifies JWT and checks Redis jti exists and is not revoked.
4. API revokes old jti atomically and creates a new refresh JWT/jti.
5. API rotates CSRF token together with refresh token.
6. API updates `Set-Cookie` for all three cookies.
7. Response returns safe identity/session metadata only, not access/refresh tokens.

Race handling:

- Use Redis transaction/Lua or `GETDEL`-style logic so a refresh jti can only be rotated once.
- If two browser tabs refresh simultaneously, one succeeds and one receives 401; the web client should then call `/auth/session` or retry the original request once after the winning tab updates cookies.

### Session metadata endpoint

Add `GET /api/v1/auth/session`.

- Reads `brs_access` cookie through auth middleware.
- Returns `{ user|admin, authenticated: true }`.
- Returns 401 for anonymous.
- Used by route guards instead of `localStorage` role checks.

### Logout

1. Client calls `POST /api/v1/auth/logout` with `credentials: "include"` and `x-csrf-token`.
2. API reads refresh JWT from cookie.
3. API verifies it if possible.
4. API deletes the Redis refresh jti and inserts the jti into `refresh_token_blacklist` (Postgres) for durable revocation until `exp`.
5. API clears `brs_access`, `brs_refresh`, and `brs_csrf` cookies with matching path/domain attributes.
6. API returns `{ "ok": true }` even if the refresh cookie was already invalid.

Logout-all-devices:

- Add follow-up endpoint `POST /api/v1/auth/logout-all` for owner/platform_admin only.
- Delete all `refresh:<user_id>:*` keys or use a per-user `session_version` claim to invalidate all sessions.
- Not required for first P3 PR, but design should not preclude it.

## MFA challenge flow

P3 requires TOTP plus Email OTP fallback, mandatory for `owner` and `platform_admin`.

### Enrollment

- Authenticated users enroll TOTP at `POST /api/v1/auth/mfa/enroll`.
- Secret generated with `otplib`, encrypted by AES-256-GCM using `MFA_KMS_KEY`, and stored in `user_mfa.secret_encrypted`.
- Enrollment response returns QR data or otpauth URI only during enrollment.
- `POST /api/v1/auth/mfa/enroll/verify` verifies first TOTP and flips `enabled=true`.
- Email OTP fallback stores only SHA-256 hashed OTP in Redis key `mfa:otp:{user_id}` with 5-minute TTL and max 3 attempts.

### Login challenge

1. Password validation succeeds.
2. API evaluates MFA requirement:
   - Always required for `role in ('owner', 'platform_admin')`.
   - Required for any user with enabled TOTP.
   - During initial rollout grace period, owner/platform_admin without enrolled TOTP may use Email OTP fallback but should be directed to enroll.
3. Instead of cookies, API returns HTTP 401 or 202 with an MFA-required body. Prefer 401 to match existing spec error code:

```json
{
  "error": {
    "code": "MFA_REQUIRED",
    "message": "Multi-factor authentication is required",
    "details": { "challengeToken": "uuid", "methods": ["totp", "email_otp"] }
  }
}
```

4. Store `mfa:challenge:{challengeToken}` in Redis for 5 minutes with user id, tenant id, role, and allowed methods. Do not set auth cookies yet.
5. Client renders MFA form and submits:

```json
{ "challengeToken": "uuid", "method": "totp", "code": "123456" }
```

to `POST /api/v1/auth/mfa/challenge/verify`.

6. API verifies challenge token, validates TOTP or Email OTP, deletes challenge key, then issues normal auth cookies and CSRF cookie.
7. Response returns safe identity metadata only.

Security notes:

- Rate-limit MFA verification by user/challenge: 5 attempts/min and max attempts per challenge.
- Challenge token must never be accepted after use.
- Email OTP send endpoint should be tied to a valid challenge token, not a logged-in session, for pre-login fallback.

## Web migration plan

Replace `localStorage` token helpers with session metadata helpers.

Target `apps/web/src/lib/auth.ts`:

- Remove accessToken/refreshToken fields from client-persisted state.
- Either remove localStorage entirely or store only non-sensitive display metadata in memory/sessionStorage.
- Add `getCsrfToken()` helper that reads `document.cookie` for `brs_csrf`.
- Add `fetchSession()` using `GET /api/v1/auth/session` with credentials.

Target `apps/web/src/lib/api.ts`:

- Always call `fetch(apiUrl(path), { ...init, credentials: "include", headers })`.
- Stop attaching `Authorization` header from localStorage.
- For unsafe methods, attach `x-csrf-token` from `brs_csrf` cookie.
- On 401 from non-auth route, call `/auth/refresh` with credentials + CSRF header once, then retry original request.
- If refresh fails, clear safe local metadata and redirect/login as current guards do.

Target `apps/web/src/components/LoginForm.tsx`:

- On login success, do not call `setSession` with tokens.
- Persist only safe metadata if needed for display, or immediately navigate after server-set cookies.
- On `MFA_REQUIRED`, render MFA challenge form instead of generic bad-credentials error.

Target route guards:

- Replace `getSession()` localStorage role checks with `GET /auth/session`.
- Cache session metadata in React state/context, not localStorage tokens.
- Render loading state while session is fetched.

Tests to update:

- `apps/web/src/lib/api.test.ts`: no Authorization header; `credentials: "include"`; CSRF header on unsafe methods; refresh call uses cookies.
- `apps/web/src/lib/auth.test.ts`: no token localStorage behavior.
- `apps/web/src/components/LoginForm.test.tsx`: login no longer receives/stores tokens; MFA challenge renders.
- `apps/web/src/components/RequireRole.test.tsx`: session endpoint metadata controls access.

## API migration plan

Add cookie utilities:

- `apps/api/src/lib/cookies.ts`
  - `setAuthCookies(c, { accessToken, refreshToken, csrfToken })`
  - `clearAuthCookies(c)`
  - `readAccessCookie(c)`
  - `readRefreshCookie(c)`
  - centralizes name/domain/path/secure/sameSite config.

Add CSRF utilities:

- `apps/api/src/lib/csrf.ts`
  - `generateCsrfToken()`
  - `hashCsrfToken(token)`
  - `verifyCsrfToken(token, expectedHash)`

Update refresh store:

- Store JSON metadata rather than plain `"1"`:

```json
{
  "userId": "...",
  "tenantId": "...",
  "role": "owner",
  "csrfHash": "sha256-or-hmac",
  "createdAt": "...",
  "expiresAt": "..."
}
```

- Add `rotateRefresh(oldUserId, oldJti, nextJti, metadata, ttl)` atomic helper.
- Keep Redis as primary allow-list and Postgres `refresh_token_blacklist` as durable revocation/audit for logout/incident response.

Update auth service:

- Split pure credential validation from cookie response handling.
- `loginTenantUser` / `loginPlatformAdmin` should return an auth result union:
  - `{ type: "authenticated", payload, user/admin }`
  - `{ type: "mfa_required", challengeToken, methods }`
- Route layer sets cookies only for `authenticated`.
- `refresh()` should accept refresh token from cookie and return new cookie material.
- `logout()` should accept optional refresh cookie and be idempotent.

Update auth middleware:

- Prefer cookie access token.
- Fall back to bearer header only when no access cookie is present.
- Error text should say missing credentials, not only missing bearer token.

## Database additions

Use the planned P3 migration, with one important addition: include refresh session audit fields if the team wants durable revocation beyond Redis.

Minimum tables:

```sql
CREATE TABLE IF NOT EXISTS user_mfa (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('totp','email_otp')),
  secret_encrypted text,
  enabled boolean NOT NULL DEFAULT false,
  enrolled_at timestamptz,
  PRIMARY KEY (user_id, method)
);

CREATE TABLE IF NOT EXISTS refresh_token_blacklist (
  jti text PRIMARY KEY,
  user_id uuid NOT NULL,
  revoked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  reason text NOT NULL DEFAULT 'logout'
);

CREATE INDEX IF NOT EXISTS idx_refresh_blacklist_expiry
  ON refresh_token_blacklist(expires_at);
```

Purge expired blacklist rows daily with a worker job.

## Endpoint contract summary

| Method | Path | Input | Cookie behavior | Response |
|---|---|---|---|---|
| POST | `/api/v1/auth/tenant-login` | email/password/slug | sets auth cookies unless MFA required | safe user metadata or `MFA_REQUIRED` |
| POST | `/api/v1/auth/admin-login` | email/password | sets auth cookies unless MFA required | safe admin metadata or `MFA_REQUIRED` |
| POST | `/api/v1/auth/mfa/challenge/send-email` | challengeToken | no auth cookies | `{ sent: true }` |
| POST | `/api/v1/auth/mfa/challenge/verify` | challengeToken/method/code | sets auth cookies | safe identity metadata |
| GET | `/api/v1/auth/session` | cookies | none | current identity metadata |
| POST | `/api/v1/auth/refresh` | cookies + CSRF | rotates auth cookies | safe identity metadata |
| POST | `/api/v1/auth/logout` | cookies + CSRF | clears auth cookies | `{ ok: true }` |
| POST | `/api/v1/auth/mfa/enroll` | auth cookies + CSRF | none | QR/otpauth |
| POST | `/api/v1/auth/mfa/enroll/verify` | auth cookies + CSRF + code | none | `{ enabled: true }` |

## Rollout / PR split proposal

Keep each PR small (~<=500 changed LOC). Recommended P3 split:

1. P3-A schema + crypto helpers
   - `db/migrations/004_auth_hardening.sql`
   - AES-GCM helper tests
   - no route behavior change

2. P3-B cookie utilities + cookie-aware auth middleware
   - `apps/api/src/lib/cookies.ts`
   - `apps/api/src/middleware/auth.ts`
   - tests proving cookie first and bearer fallback

3. P3-C CSRF middleware + API client credentials mode
   - `apps/api/src/lib/csrf.ts`
   - `apps/api/src/middleware/csrf.ts`
   - `apps/web/src/lib/api.ts`
   - tests for CSRF headers and `credentials: "include"`

4. P3-D login/refresh/logout cookie lifecycle
   - routes set/rotate/clear cookies
   - responses remove token fields
   - Redis refresh rotation made atomic

5. P3-E session endpoint + web route guard migration
   - `/auth/session`
   - `RequireRole` and layouts stop depending on token localStorage

6. P3-F MFA services and challenge flow
   - TOTP enrollment/verify
   - Email OTP fallback
   - pre-cookie challenge verify endpoint

7. P3-G localStorage removal cleanup + E2E
   - remove token storage behavior and update tests
   - Playwright coverage for login, refresh, logout, MFA challenge

## Acceptance checklist for P3 implementation

- No browser code stores access or refresh tokens in `localStorage`.
- `apiFetch` sends `credentials: "include"` and no bearer header from browser storage.
- Access and refresh tokens are HTTP-only cookies.
- Unsafe methods require `x-csrf-token` matching the CSRF cookie/server session binding.
- Refresh rotates refresh jti and CSRF token.
- Logout deletes refresh jti, blacklists it until expiry, and clears cookies.
- Owner and platform_admin login requires MFA before auth cookies are set.
- Email OTP fallback works without exposing OTP hashes/secrets.
- Existing bearer header tests continue to pass for non-browser clients or are explicitly moved to API-client-only tests.
- Billing requirements remain unchanged: P5 must support Midtrans + Xendit with `BILLING_ACTIVE_PSP` and runtime fallback when the active provider config is incomplete.
