# BroSolution — Operational Grosir

BroSolution Operational Grosir is a multi-tenant SaaS starter for wholesale operations: POS, inventory, reporting, tenant administration, and multi-outlet workflows.

## Stack

- pnpm workspace monorepo: `apps/api`, `apps/web`, `packages/*`, `db/`, `e2e/`
- API: Hono, PostgreSQL, Redis/BullMQ, Vitest, jose, argon2
- Web: Next.js 14, Tailwind CSS, react-hook-form, Zod
- Infra: PostgreSQL 16, Redis 7, Docker Compose, MailHog for local email

## Quickstart

```bash
pnpm install
cp .env.example .env
# Fill in DATABASE_URL, REDIS_URL, APP_NAMESPACE, SHARED_NETWORK, and MINIO_* with
# credentials supplied by the instance owner, then ensure the external network exists:
docker network create "$(grep SHARED_NETWORK .env | cut -d= -f2)"
pnpm dev
```

`pnpm dev` runs the Docker Compose dev profile (app containers only — Postgres and Redis are provided by the shared external instance). In another terminal, initialize the database and platform admin:

```bash
pnpm migrate
pnpm seed:admin admin@local admin123
```

Open:

- Web: http://localhost:3000
- API: http://localhost:4000
- MailHog: http://localhost:8025

## Environment setup

Start from `.env.example` and fill in the credentials supplied by the instance owner. Keep `.env` out of git.

Core groups:

- Database: `DATABASE_URL` (single connection string to the shared Postgres instance)
- Redis/worker: `REDIS_URL` (includes credentials and DB index, e.g. `redis://user:pw@redis:6379/0`), `APP_NAMESPACE` (key prefix, queue prefix, and backup prefix)
- Networking: `SHARED_NETWORK` (name of the external Docker network; must be pre-created before `docker compose up`)
- Backup: `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`
- Auth: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, token TTL values
- Email: `SMTP_*`, `MAIL_FROM`, `MAILHOG_WEB_PORT`
- Web/API: `API_PORT`, `WEB_PORT`, `NEXT_PUBLIC_API_URL`, `CORS_ORIGINS`

See `docs/env-reference.md` for the full variable reference. Billing must support both Midtrans and Xendit: admins select the active PSP, and runtime code must fall back to the other configured provider when the active provider config is incomplete.

## Tests

```bash
pnpm test          # unit + integration tests across apps/packages
pnpm test:e2e      # Playwright e2e tests; requires the local stack
```

Useful focused checks:

```bash
pnpm --filter @app/shared test
pnpm --filter @app/ui test
pnpm --filter @app/api test
pnpm --filter @app/web test
```

## Docker notes

The default `docker-compose.yml` is for local development. Postgres and Redis are **not** bundled — they are provided by the shared external instance. Before starting the app stack, ensure the external Docker network exists:

```bash
docker network create "$(grep SHARED_NETWORK .env | cut -d= -f2)"
```

Then start the app containers:

```bash
docker compose --profile dev up --build api worker web
```

For local email, start the MailHog sidecar separately if needed:

```bash
docker compose --profile dev up -d mailhog
```

Ports are controlled by `.env`: API `4000`, web `3000`, and MailHog UI `8025` by default.

## Security roadmap notes

- P0 focuses on secrets hygiene and docs.
- P3 auth hardening must move browser auth to HTTP-only cookies/sessions instead of persisting bearer tokens in `localStorage`.
- Later SaaS phases add observability, self-serve signup, billing, quotas, frontend polish, and VPS deployment.

## Source docs

- `docs/superpowers/specs/2026-05-16-brosolution-saas-hardening-design.md` — approved SaaS hardening design
- `docs/superpowers/plans/2026-05-16-brosolution-saas-hardening.md` — active implementation plan
- `e2e/README.md` — local e2e gate and verification commands
