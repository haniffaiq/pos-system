FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @app/web...

COPY packages packages
COPY apps/web apps/web

# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so
# the public API origin must be supplied as a build arg (not just runtime).
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm --filter @app/web build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/healthcheck.mjs ./apps/web/healthcheck.mjs

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
