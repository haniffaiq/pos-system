# Ops Runbook

This runbook is the operator-facing stub for BroSolution / Operational Grosir production operations. It is intentionally procedure-first and will be expanded as P1-P8 ship concrete observability, billing, backup, and deploy automation.

## Scope and production assumptions

- App stack: Next.js web, Hono API, worker, Postgres, Redis.
- Deploy target: single-region VPS using Docker Compose and Caddy.
- Observability target: structured logs, Loki, Grafana, Prometheus, and Sentry.
- Billing target: Midtrans and Xendit must both be supported. An admin-selected active PSP is attempted first; if that provider is configured incompletely or fails provider readiness checks, runtime billing must fall back to the other configured provider.
- Auth hardening target: HTTP-only cookie/session storage. Do not continue expanding localStorage token patterns in P3+ work.

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
2. Connect as a Postgres superuser:

   ```bash
   docker compose -f docker-compose.prod.yml exec db psql -U postgres
   ```

3. Rotate the app user password:

   ```sql
   ALTER USER app WITH PASSWORD 'new-password';
   ```

4. Update `DATABASE_URL` in the production environment.
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

Use this for `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY`, and `BACKUP_S3_SECRET_KEY`.

1. Create a new object-storage access key with least privilege for the backup bucket/prefix.
2. Update backup environment values.
3. Run a backup dry-run and restore dry-run before revoking the old key.
4. Confirm the new object has expected encryption, retention, and lifecycle policy.

## Deploy

Detailed production automation lands in P8. Until then, use this deploy checklist as the minimum standard.

1. Confirm the target commit and PR are merged to `main`.
2. Pull latest code on the VPS:

   ```bash
   git fetch origin
   git checkout main
   git pull --ff-only origin main
   ```

3. Confirm required environment values exist and `.env` is not tracked by git:

   ```bash
   git ls-files .env
   ```

   Expected: no output.

4. Build and start the stack:

   ```bash
   docker compose -f docker-compose.prod.yml build
   docker compose -f docker-compose.prod.yml up -d
   ```

5. Run migrations only after reviewing migration notes and backup freshness:

   ```bash
   pnpm migrate
   ```

6. Validate:
   - `/healthz` returns 200.
   - `/readyz` returns 200.
   - Web home page loads.
   - Platform admin can log in.
   - One tenant-scoped read path works.
   - Queue worker starts with no repeated errors.
   - Billing readiness reports the admin-selected PSP and fallback PSP state correctly once P5 is implemented.

7. Watch logs and dashboards for at least 10 minutes after deploy.

## Rollback

1. Identify the last known-good commit and image tag.
2. Pause risky background jobs if the incident involves billing, migrations, or bulk writes.
3. Revert app containers to the last known-good image or commit:

   ```bash
   git checkout <last-known-good-commit>
   docker compose -f docker-compose.prod.yml build
   docker compose -f docker-compose.prod.yml up -d api web worker
   ```

4. Do not rollback schema destructively. All planned migrations should be additive. If a new migration caused the incident, ship a forward-fix migration.
5. Validate `/readyz`, login, tenant reads/writes, and billing webhook handling.
6. If billing webhooks were missed during rollback, run the reconciliation job after the app is stable.
7. Document impact, root cause, and follow-up tasks.

## Backup and restore

Backups are custom-format `pg_dump` artifacts uploaded to S3-compatible object storage by `infra/backup/backup.sh`. Each artifact has a sibling `.sha256` checksum and the script prunes objects older than `BACKUP_RETENTION_DAYS` when retention is enabled.

### Required backup environment

- `DATABASE_URL`: source Postgres URL.
- `BACKUP_S3_ENDPOINT`: S3-compatible endpoint, for example R2, Wasabi, DigitalOcean Spaces, or AWS S3.
- `BACKUP_S3_BUCKET`: target bucket.
- `BACKUP_S3_PREFIX`: optional prefix, defaults to bucket root; use `db` in production.
- `BACKUP_S3_ACCESS_KEY` / `BACKUP_S3_SECRET_KEY`: optional aliases for AWS CLI credentials.
- `BACKUP_S3_REGION`: optional, defaults to `auto`.
- `BACKUP_RETENTION_DAYS`: optional retention window. Set `0` or unset to disable script-side pruning if bucket lifecycle policies own retention.

### Backup checklist

1. Confirm `pg_dump`, `aws`, and `sha256sum` are installed on the backup runner.
2. Confirm `BACKUP_S3_*`, `DATABASE_URL`, and `BACKUP_RETENTION_DAYS` are configured.
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
   docker compose -f docker-compose.prod.yml ps
   docker compose -f docker-compose.prod.yml logs --tail=200 api web worker
   ```

4. Check `/healthz`, `/readyz`, database, Redis, queue depth, and billing provider status.
5. If billing is impacted, disable new checkout attempts if needed but keep webhook ingestion/reconciliation running when safe.
6. If data exposure or secret leakage is suspected, preserve evidence and start secrets rotation.

### Triage by symptom

#### API or web unavailable

1. Check Caddy, web, API, DB, and Redis container health.
2. Inspect recent deploys and config changes.
3. Roll back app containers if a deploy is the likely trigger.
4. Avoid database rollback unless corruption is confirmed and approved.

#### Billing failures

1. Determine active PSP and fallback PSP readiness.
2. Check provider dashboard status for Midtrans and Xendit.
3. Verify webhook signatures and recent webhook delivery attempts.
4. If active PSP config is incomplete, switch admin-selected provider only after confirming the fallback provider is configured and healthy.
5. Run invoice reconciliation for pending invoices after recovery.

#### Authentication failures

1. Confirm HTTP-only session cookie issuance and cookie attributes once P3 lands.
2. Check Redis if sessions, refresh tokens, rate limits, or MFA challenges depend on it.
3. For MFA issues, verify `MFA_KMS_KEY` and recent rotations.
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
