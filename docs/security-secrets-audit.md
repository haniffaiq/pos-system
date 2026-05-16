# Secrets and Git History Audit

Date: 2026-05-16
Scope: BRS-P0-01, repository `haniffaiq/pos-system` at baseline `e0d00ce`.

## Findings

- Current `.env` status: not tracked. `git ls-files .env` returns no paths.
- Current env allowlist: `.env.example` is tracked; `.gitignore` ignores `.env`, `.env.*`, and re-includes `!.env.example`.
- Reachable git history: no commit in `git log --all -- .env`; no reachable tracked path named `.env` was found.
- Historical env-ish tracked files: only `.env.example` appeared in reachable history.
- No secret values were added by this audit. `.env.example` contains placeholders only.

## Commands used

```bash
git ls-files '.env' '.env.*' ':!:*.example'
git log --oneline --all -- .env
git log --all --name-only --pretty=format:
git grep -I -n -E '(JWT_SECRET|JWT_ACCESS_SECRET|JWT_REFRESH_SECRET|DATABASE_URL|DATABASE_ADMIN_URL|POSTGRES_PASSWORD|SMTP_PASS|SMTP_PASSWORD|MIDTRANS_SERVER_KEY|XENDIT_SECRET_KEY|API_KEY|SECRET_KEY)' $(git rev-list --all)
```

The history grep was reviewed by path/key only; secret values were not copied into this document.

## Rotation guidance

No `.env` blob was found in the current index or reachable history, so this audit does not identify a repository-history leak requiring emergency rotation.

Rotate credentials anyway if any developer previously copied real secrets into local files, chat, CI logs, issue comments, or other systems outside this git repository. At minimum rotate:

1. `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: generate new values with `openssl rand -base64 48`; deploy both together; users must re-login after access-token invalidation.
2. `MFA_KMS_KEY` when P3 ships: rotation invalidates existing TOTP enrollments and requires planned user re-enrollment.
3. Database, SMTP, Midtrans, Xendit, Sentry, and backup storage credentials: rotate in provider consoles, update deployment env, restart affected services, and verify webhooks/reconciliation.

Do not commit real `.env` files. Keep local secrets in `.env` only and use deployment environment/secret storage for production.
