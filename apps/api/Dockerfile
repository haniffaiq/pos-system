FROM node:22-slim AS base

RUN corepack enable

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile --filter @app/api...

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @app/api build

WORKDIR /app/apps/api

CMD ["node", "dist/index.js"]
