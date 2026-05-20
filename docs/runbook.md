# Ops Runbook

This runbook is the operator-facing stub for BroSolution / Operational Grosir production operations. It is intentionally procedure-first and will be expanded as P1-P8 ship concrete observability, billing, backup, and deploy automation.

## Scope and production assumptions

- App stack: Next.js web, Hono API, worker, Postgres, Redis.
- Deploy target: single-region VPS using Docker Compose and Caddy.
- Observability target: structured logs, Loki, Grafana, Prometheus, and Sentry.
- Billing target: Midtrans and Xendit must both be supported. An admin-selected active PSP is attempted first; if that provider is configured incompletely or fails provider readiness checks, runtime billing must fall back to the other configured provider.
- Auth hardening target: HTTP-only cookie/session storage. Do not continue expanding localStorage token patterns in P3+ work.

## Shared infrastructure

PostgreSQL, Redis, and MinIO are **not** bundled in this repo's Docker Compose files. They are provisioned externally by the instance owner and shared across multiple apps. This repo only consumes them via `.env`.

The instance owner is responsible for:
- The PostgreSQL database and the single owning DB role (referenced by `DATABASE_URL`).
- The Redis instance and the ACL that restricts this app's keys to the `<APP_NAMESPACE>:*` prefix (referenced by `REDIS_URL` and `APP_NAMESPACE`).
- The MinIO bucket for backups (referenced by `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, and `MINIO_BUCKET`).
- The external Docker network named by `SHARED_NETWORK`, which must be pre-created before `docker compose up`.

Because `api` and `worker` no longer have a `depends_on` on bundled Postgres/Redis services, they may start before the shared services are reachable. The application relies on connection-layer retry (pool reconnect, BullMQ backoff). Operators should verify shared-instance health independently before deploying app containers.

## Secrets rotation

### Rotation rules

1. Never commit `.env`, production secret dumps, provider keys, backup credentials, or generated one-time recovery artifacts.
2. Rotate in staging first when a staging environment exists.
3. Record the rotation window, affected keys, operator, and validation result in the incident/change log.
4. Restart only the services that read the changed secret unless the section below says otherwise.
5. After rotation, verify `/healthz`, `/readyz`, login, one tenant-scoped API request, and billing provider readiness when billing secrets changed.

### JWT and session secrets

Use this for current runtime secrets `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`, plus future session-signing secrets.

1. Generate new values:

   ```bash
   openssl rand -base64 48
   ```

2. Update the production secret store or VPS environment file.
3. Restart API and worker services:

   ```bash
   docker compose -f docker-compose.prod.yml up -d api worker
   ```

4. Expect current access tokens to become invalid immediately. If refresh-token signing changes, existing refresh tokens are invalid too and users must log in again.
5. Validate that login issues a new HTTP-only secure session cookie once P3 is implemented.

### MFA KMS key

Use this for `MFA_KMS_KEY`.

1. Generate a 32-byte key:

   ```bash
   openssl rand -base64 32
   ```

2. Treat this as destructive unless key-versioned re-encryption has been implemented. Existing TOTP secrets may become undecryptable.
3. Notify affected owners and platform admins before rotation.
4. Update `MFA_KMS_KEY` and restart API.
5. Force privileged users through TOTP re-enrollment.
6. Validate enrollment and verification for one test owner account.

### Database password

1. Put the app into a maintenance window if production traffic cannot tolerate reconnect errors.
2. Connect to the shared Postgres instance directly (coordinate with the instance owner for superuser access):

   ```bash
   psql "$DATABASE_URL"
   ```

3. Rotate the app user password:

   ```sql
   ALTER USER app WITH PASSWORD 'new-password';
   ```

4. Update `DATABASE_URL` in the production environment with the new credentials.
5. Restart API and worker services.
6. Validate `/readyz` and run a read/write smoke test against a non-critical tenant record.

### Redis password or URL

1. Update Redis credentials or endpoint according to the VPS/managed Redis procedure.
2. Update `REDIS_URL` in the production environment.
3. Restart API and worker services.
4. Validate `/readyz`, login rate limit state, queue processing, and any session storage that uses Redis.

### SMTP secrets

1. Rotate credentials in the mail provider console.
2. Update `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` if needed.
3. Restart worker and API if both send email.
4. Send test emails for signup verification, MFA OTP fallback, and billing reminders.

### Billing provider secrets: Midtrans and Xendit

Billing must support both PSPs. The admin-selected active PSP is the preferred provider, but runtime code must fall back to the other configured provider if the active provider env/config is incomplete.

Rotate one provider at a time.

1. In the provider dashboard, create the new key pair without deleting the old key yet.
2. Update the relevant environment values:
   - Midtrans: `MIDTRANS_ENV`, `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_MERCHANT_ID`.
   - Xendit: `XENDIT_ENV`, `XENDIT_SECRET_KEY`, `XENDIT_PUBLIC_KEY` if used, and `XENDIT_WEBHOOK_TOKEN`.
   - Shared billing controls: `BILLING_ENABLED` and `BILLING_ACTIVE_PSP` (`midtrans` or `xendit`). Runtime must validate the active PSP and fall back to the other configured provider if active PSP config is incomplete.
3. Restart API and worker.
4. Run provider readiness checks for both providers. The active provider must pass before it is selected as active in admin config.
5. Send a sandbox checkout and webhook replay for the rotated provider.
6. Confirm fallback behavior by marking the active provider incomplete in staging and verifying the other configured provider is selected.
7. Remove or revoke the old provider key only after production validation succeeds.

### Backup object storage secrets

Use this for `MINIO_ENDPOINT`, `MINIO_BUCKET`, `MINIO_ACCESS_KEY`, and `MINIO_SECRET_KEY`. The backup script reads these vars and falls back to legacy `BACKUP_S3_*` aliases for any existing overrides.

1. Create a new MinIO access key with least privilege for the backup bucket (coordinate with the instance owner as MinIO is shared).
2. Update `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` (and `MINIO_ENDPOINT`/`MINIO_BUCKET` if those changed) in the production environment.
3. Run a backup dry-run and restore dry-run before revoking the old key.
4. Confirm the new object has expected encryption, retention, and lifecycle policy.

## Deploy

The GitHub Actions deploy workflow is the preferred path. It runs `pnpm test`, builds API/web, validates compose config, validates billing PSP readiness/fallback, runs additive migrations, restarts the compose stack, and performs `/`, `/healthz`, and `/readyz` smoke checks when a smoke URL is configured.

### Required GitHub environment secrets

Configure these in the `staging` and `prod` GitHub environments:

- `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`; optional `DEPLOY_PORT`.
- Optional deploy path/file overrides: `DEPLOY_PATH` (default `/opt/brosolution`), `DEPLOY_STAGING_ENV_FILE` (default `.env.staging`), `DEPLOY_PROD_ENV_FILE` (default `.env.prod`).
- Optional smoke URLs: `DEPLOY_STAGING_SMOKE_URL`, `DEPLOY_PROD_SMOKE_URL`.

Pushes to `main` run the staging deploy automatically when SSH secrets exist. If staging SSH secrets are absent, the workflow records a warning and skips only the SSH deploy step. Manual workflow dispatches fail fast when SSH secrets are absent.

### Host prerequisites

On the VPS, the deploy directory must already be a clone of this repository and must contain untracked env files with real secrets:

```bash
sudo mkdir -p /opt/brosolution
sudo chown "$USER":"$USER" /opt/brosolution
git clone https://github.com/haniffaiq/pos-system.git /opt/brosolution
cd /opt/brosolution
git fetch origin
```

Create `.env.staging` and `.env.prod` from the checked-in examples/reference, but keep them untracked:

```bash
cp .env.staging.example .env.staging
cp .env.example .env.prod
git ls-files .env.staging .env.prod
```

Expected: no output. Fill all required database, Redis, SMTP, auth/session, Caddy domain, Sentry, backup, and billing values before deployment.

Billing deployment guardrail: when `BILLING_ENABLED` is not `false`, `BILLING_ACTIVE_PSP` must be `midtrans` or `xendit`. The deploy script permits an incomplete active PSP only when the other provider's required runtime env is complete, so runtime can fall back safely.

Auth deployment guardrail: browser auth must use HTTP-only secure cookie/session semantics after P3. Keep `SESSION_COOKIE_SECURE=true` in staging/prod, set `SESSION_COOKIE_DOMAIN` for the production domain, and do not deploy a browser flow that persists access/refresh tokens in `localStorage`.

### Staging deploy

Automatic path after merging to `main`:

```bash
git checkout main
git pull --ff-only origin main
git push origin main
```

Manual staging redeploy of a specific ref:

```bash
gh workflow run deploy.yml -f target=staging -f ref=<sha-or-branch> -f auto_rollback=true
gh run list --workflow deploy.yml --limit 5
gh run watch <run-id>
```

Equivalent host commands for emergency/manual staging deploy:

```bash
cd /opt/brosolution
git fetch --prune origin
git checkout --detach <sha-or-origin/main>
corepack enable
pnpm install --frozen-lockfile
docker compose --env-file .env.staging \
  -f docker-compose.prod.yml -f docker-compose.staging.yml \
  --profile prod config --quiet
pnpm migrate
docker compose --env-file .env.staging \
  -f docker-compose.prod.yml -f docker-compose.staging.yml \
  --profile prod up -d --build --remove-orphans
curl --fail --silent --show-error --max-time 15 https://staging.brosolution.id/healthz
curl --fail --silent --show-error --max-time 15 https://staging.brosolution.id/readyz
```

Staging validation checklist:

- Web home page and `/healthz`/`/readyz` return 200.
- Platform admin login works using HTTP-only secure cookies; browser storage does not contain access/refresh tokens.
- One tenant-scoped read path works.
- `docker compose ... ps` shows `api`, `web`, `worker`, and `caddy` healthy/running (`db` and `redis` are external shared services, not compose-managed).
- Verify the shared Postgres, Redis, and MinIO instances are reachable independently before deploying app containers.
- Billing readiness shows the admin-selected PSP and fallback PSP state. Verify both Midtrans and Xendit sandbox configuration before selecting either provider as active.

### Production deploy

Production is manual through the protected `prod` GitHub environment:

```bash
gh workflow run deploy.yml -f target=prod -f ref=<sha-or-tag> -f auto_rollback=true
gh run list --workflow deploy.yml --limit 5
gh run watch <run-id>
```

Equivalent host commands for emergency/manual production deploy:

```bash
cd /opt/brosolution
git fetch --prune origin
git checkout --detach <sha-or-tag>
corepack enable
pnpm install --frozen-lockfile
docker compose --env-file .env.prod -f docker-compose.prod.yml --profile prod config --quiet
pnpm migrate
docker compose --env-file .env.prod -f docker-compose.prod.yml --profile prod up -d --build --remove-orphans
curl --fail --silent --show-error --max-time 15 https://brosolution.id/healthz
curl --fail --silent --show-error --max-time 15 https://brosolution.id/readyz
```

Production validation checklist:

- `/`, `/healthz`, and `/readyz` return 200 through Caddy/TLS.
- Platform admin login works; cookies have `HttpOnly`, `Secure`, and expected `SameSite` attributes.
- One tenant dashboard read path works and queue worker has no repeated errors.
- Billing provider readiness is healthy for the admin-selected PSP, and the other configured PSP is either healthy or intentionally disabled with `BILLING_ENABLED=false`.
- If billing secrets changed, run a sandbox/staging checkout and webhook replay before production, then monitor production webhook logs after deploy.
- Watch logs and dashboards for at least 10 minutes after deploy.

### Useful deploy inspection commands

```bash
cd /opt/brosolution
docker compose --env-file .env.prod -f docker-compose.prod.yml --profile prod ps
docker compose --env-file .env.prod -f docker-compose.prod.yml --profile prod logs --tail=200 api web worker caddy
docker compose --env-file .env.prod -f docker-compose.prod.yml --profile prod exec -T api node -e "fetch('http://127.0.0.1:4000/readyz').then(r=>console.log(r.status))"
```

## Rollback

Rollback reverts app containers to a known-good commit. Do not destructively roll back the database. Planned migrations are additive; failed migrations or bad data changes must be forward-fixed unless the incident commander explicitly approves a restore.

### Automatic rollback during deploy

The deploy workflow captures the previously deployed SHA before checkout. When `auto_rollback=true`, container restart or smoke-check failures run this rollback path automatically:

```bash
cd /opt/brosolution
git checkout --detach <previous-deployed-sha>
docker compose --env-file <env-file> <compose-files> --profile prod up -d --build api web worker caddy
```

Migrations are not rolled back automatically. If `pnpm migrate` fails, the workflow returns to the previous app checkout and stops before restarting the new app.

### Manual app rollback

1. Identify the last known-good commit from GitHub deploy runs, `git reflog`, or release notes.
2. Pause risky background jobs if the incident involves billing, migrations, or bulk writes:

   ```bash
   cd /opt/brosolution
   docker compose --env-file .env.prod -f docker-compose.prod.yml --profile prod stop worker
   ```

3. Revert app containers to the last known-good commit:

   ```bash
   cd /opt/brosolution
   git fetch --prune origin
   git checkout --detach <last-known-good-sha>
   docker compose --env-file .env.prod -f docker-compose.prod.yml --profile prod up -d --build api web worker caddy
   ```

4. Validate health and core user paths:

   ```bash
   curl --fail --silent --show-error --max-time 15 https://brosolution.id/healthz
   curl --fail --silent --show-error --max-time 15 https://brosolution.id/readyz
   docker compose --env-file .env.prod -f docker-compose.prod.yml --profile prod logs --tail=200 api web worker
   ```

5. Validate login, tenant reads/writes, billing checkout/webhook handling, and queue processing.
6. If billing webhooks were missed during rollback, run the reconciliation job after the app is stable.
7. Document impact, root cause, rollback SHA, validation results, and follow-up cards.

### Database restore escalation

Use restore only for confirmed corruption or data-loss scenarios with incident commander approval. Before restore, preserve the broken production database snapshot, disable workers and billing webhooks unless explicitly approved, and run billing reconciliation before re-enabling automations.

## Backup and restore

Backups are custom-format `pg_dump` artifacts uploaded to S3-compatible object storage by `infra/backup/backup.sh`. Each artifact has a sibling `.sha256` checksum and the script prunes objects older than `BACKUP_RETENTION_DAYS` when retention is enabled.

### Required backup environment

- `DATABASE_URL`: source Postgres URL (shared external instance).
- `MINIO_ENDPOINT`: MinIO S3-compatible endpoint (shared external instance provisioned by the instance owner).
- `MINIO_BUCKET`: target bucket (provisioned by the instance owner).
- `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY`: credentials for the shared MinIO instance.
- `APP_NAMESPACE`: used as the object-name prefix for backup artifacts so they are namespaced per app.
- `BACKUP_RETENTION_DAYS`: optional retention window. Set `0` or unset to disable script-side pruning if bucket lifecycle policies own retention.

The backup script falls back to legacy `BACKUP_S3_ENDPOINT` / `BACKUP_S3_BUCKET` / `BACKUP_S3_ACCESS_KEY` / `BACKUP_S3_SECRET_KEY` aliases when the `MINIO_*` vars are not set.

### Backup checklist

1. Confirm `pg_dump`, `aws`, and `sha256sum` are installed on the backup runner.
2. Confirm `MINIO_ENDPOINT`, `MINIO_BUCKET`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `DATABASE_URL`, `APP_NAMESPACE`, and `BACKUP_RETENTION_DAYS` are configured.
3. Run backup from the production host or backup runner:

   ```bash
   /opt/brosolution/infra/backup/backup.sh
   ```

4. Verify the output prints `backup ok: brosolution-db-<timestamp>.dump`.
5. In object storage, verify both files exist under the configured prefix:
   - `brosolution-db-<timestamp>.dump`
   - `brosolution-db-<timestamp>.dump.sha256`
6. Confirm old objects beyond `BACKUP_RETENTION_DAYS` were deleted, or that the bucket lifecycle policy enforces the required retention if script-side pruning is disabled.
7. Emit or record backup success in the monitoring channel.

### Cron schedule

Install this on the VPS after replacing the user/path with the production values:

```cron
# /etc/cron.d/brosolution-backup
0 2 * * * appuser /opt/brosolution/infra/backup/backup.sh >> /var/log/brosolution-backup.log 2>&1
```

Alert if the log does not contain a successful `backup ok:` line for the latest run or if the newest object is older than the recovery point objective.

### Restore dry-run checklist

Run restore drills in staging or an isolated restore database only.

1. Create an empty restore database and set `RESTORE_DATABASE_URL` to it. Do not point `RESTORE_DATABASE_URL` at production.
2. Choose the backup key, for example `brosolution-db-20260516T020000Z.dump`.
3. Restore and verify checksum automatically:

   ```bash
   RESTORE_DATABASE_URL="postgres://app:***@staging-db:5432/restore_drill" \
     /opt/brosolution/infra/backup/restore.sh brosolution-db-20260516T020000Z.dump
   ```

4. The restore script downloads the `.dump` and `.dump.sha256`, runs `sha256sum --check`, restores with `pg_restore --clean --if-exists --no-owner --no-acl`, then runs `RESTORE_VERIFY_SQL` or `select 1;` by default.
5. Run migration status checks and app smoke tests against the restore database.
6. Verify tenant isolation/RLS with at least two test tenants.
7. Record recovery time, selected backup key, checksum result, verification SQL result, and any manual fixes needed.

### Production restore guardrails

- Do not restore over production without explicit incident commander approval.
- Preserve the broken production database snapshot before attempting restore.
- Disable workers and billing webhooks while restoring unless the incident commander approves otherwise.
- After restore, run billing reconciliation before re-enabling billing automations.

## Incident response

### Page-worthy events

- `/readyz` failing for more than 5 minutes.
- API 5xx rate above the SLO threshold once defined, or Sentry error rate above 50/minute sustained.
- Login unavailable for owners or platform admins.
- Billing checkout/webhook failure affecting paid tenants.
- Billing active PSP unavailable and fallback PSP not ready.
- Webhook reconciliation job failing more than 3 consecutive runs.
- Backup missing, corrupt, or older than the recovery point objective.
- Suspected secret leakage, tenant data exposure, or RLS bypass.

### First 15 minutes

1. Assign incident commander and scribe.
2. State severity, affected tenants, and start time.
3. Check health:

   ```bash
   cd /opt/brosolution
   docker compose --env-file .env.prod -f docker-compose.prod.yml --profile prod ps
   docker compose --env-file .env.prod -f docker-compose.prod.yml --profile prod logs --tail=200 api web worker caddy
   curl --fail --silent --show-error --max-time 15 https://brosolution.id/healthz
   curl --fail --silent --show-error --max-time 15 https://brosolution.id/readyz
   ```

4. Check database, Redis, queue depth, and billing provider status (Postgres and Redis are external — connect directly, not via `docker compose exec`):

   ```bash
   psql "$DATABASE_URL" -c "SELECT 1;" 2>&1 | head -3
   redis-cli -u "$REDIS_URL" ping
   docker compose --env-file .env.prod -f docker-compose.prod.yml --profile prod logs --tail=200 worker | grep -Ei 'queue|bull|billing|webhook' || true
   ```

5. If billing is impacted, disable new checkout attempts if needed but keep webhook ingestion/reconciliation running when safe.
6. If data exposure or secret leakage is suspected, preserve evidence and start secrets rotation.

### Triage by symptom

#### API or web unavailable

1. Check Caddy, web, API, DB, and Redis container health.
2. Inspect recent deploys and config changes.
3. Roll back app containers if a deploy is the likely trigger.
4. Avoid database rollback unless corruption is confirmed and approved.

#### Billing failures

1. Determine active PSP and fallback PSP readiness from env and logs:

   ```bash
   cd /opt/brosolution
   docker compose --env-file .env.prod -f docker-compose.prod.yml --profile prod exec -T api printenv \
     BILLING_ENABLED BILLING_ACTIVE_PSP MIDTRANS_ENV XENDIT_ENV
   docker compose --env-file .env.prod -f docker-compose.prod.yml --profile prod logs --tail=300 api worker | grep -Ei 'billing|midtrans|xendit|webhook|fallback' || true
   ```

2. Check provider dashboard status for Midtrans and Xendit.
3. Verify webhook signatures and recent webhook delivery attempts.
4. If active PSP config is incomplete, switch admin-selected provider only after confirming the fallback provider is configured and healthy.
5. Run invoice reconciliation for pending invoices after recovery.

#### Authentication failures

1. Confirm HTTP-only session cookie issuance and cookie attributes once P3 lands:

   ```bash
   curl --include --silent --show-error https://brosolution.id/login | grep -i '^set-cookie:' || true
   ```

2. Check Redis if sessions, refresh tokens, rate limits, or MFA challenges depend on it.
3. For MFA issues, verify `MFA_KMS_KEY` and recent rotations without printing secret values:

   ```bash
   docker compose --env-file .env.prod -f docker-compose.prod.yml --profile prod exec -T api sh -lc 'test -n "$MFA_KMS_KEY" && echo MFA_KMS_KEY=set || echo MFA_KMS_KEY=missing'
   ```

4. Do not reintroduce localStorage token storage as a workaround.

#### Database or tenant isolation concern

1. Stop write-heavy workers if they may worsen the incident.
2. Preserve logs and a database snapshot.
3. Verify current tenant context and RLS policy behavior.
4. Escalate as a security incident if cross-tenant access is suspected.

### Communication

- Internal update cadence: every 15 minutes until stable.
- Tenant-facing update cadence: initial acknowledgement, material change, resolution, postmortem.
- Never include secrets, raw tokens, full payment identifiers, or unnecessary PII in incident notes.

### Post-incident

1. Write a short postmortem with timeline, impact, root cause, what worked, and action items.
2. Create follow-up cards for fixes instead of burying them in the postmortem.
3. Confirm monitoring catches the same failure mode next time.
4. If secrets were involved, confirm all affected secrets were rotated and old credentials revoked.
