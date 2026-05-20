# Testing

The default test command is safe to run from a cold shell:

```sh
pnpm test
```

Tests that require external Postgres or Redis infrastructure are skipped unless the matching environment variables are set. This keeps worker and CI verification predictable while keeping the integration tests available.

Redis-backed integration tests cover refresh token storage and BullMQ queues. To run them against a local Redis instance:

```sh
pnpm test:redis
```

or explicitly:

```sh
REDIS_URL=redis://localhost:6379 pnpm --filter @app/api test:redis
```

Postgres-backed tests require `DATABASE_URL`; auth service integration tests require that plus `REDIS_URL`.
