# Phase 1 e2e gate

Playwright covers the Phase 1 critical flows from the implementation plan:

1. Platform admin logs in at `/admin/login`.
2. The admin registers a tenant at `/admin/tenants/new`.
3. The new tenant owner logs in at `/t/:slug/login` and reaches the owner dashboard.

The signup gate covers the self-serve `/signup` → MailHog verification email → `/verify` → tenant login path.

Run the Phase 1 local gate from the repository root:

```bash
docker compose --profile dev up -d db redis
pnpm migrate
pnpm seed:admin admin@local admin123
pnpm seed:plans
pnpm --filter @app/api build
pnpm --filter @app/web build
pnpm --filter @app/e2e exec playwright install --with-deps chromium
pnpm --filter @app/e2e test
pnpm --filter @app/e2e test:signup
```

Unit/integration regression commands for the Phase 1 gate:

```bash
pnpm --filter @app/shared test
pnpm --filter @app/ui test
pnpm --filter @app/web test
pnpm --filter @app/api test
pnpm test
```

If Docker is unavailable in the worker environment, `podman-compose` may be used as the compose implementation for db/redis verification.
