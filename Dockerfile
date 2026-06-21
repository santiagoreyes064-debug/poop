# Generic multi-stage Dockerfile for any Node/TypeScript service in the monorepo.
# Build a specific service with:
#   docker build --build-arg SERVICE=api-gateway -t sct-api-gateway .
# (docker-compose passes SERVICE per service.)

# ---- base ----------------------------------------------------------------
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# ---- deps: install the full workspace (cached on lockfile) ----------------
FROM base AS deps
# pnpm-lock.yaml* is optional: included if committed, regenerated otherwise.
COPY package.json pnpm-workspace.yaml .npmrc pnpm-lock.yaml* ./
COPY turbo.json tsconfig.base.json ./
# Copy every package manifest so pnpm can resolve the workspace graph.
COPY packages ./packages
COPY apps ./apps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install

# ---- build: compile the target service and its workspace deps -------------
FROM deps AS build
ARG SERVICE
RUN pnpm --filter "@sct/database" generate || true
RUN pnpm turbo run build --filter="...@sct/${SERVICE}" --filter="@sct/${SERVICE}"

# ---- runtime: minimal, non-root ------------------------------------------
FROM base AS runtime
ARG SERVICE
ENV NODE_ENV=production
# Run as the non-root uid required by the security spec.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nodeuser -G nodejs
COPY --from=build --chown=1001:1001 /app /app
USER 1001
WORKDIR /app/apps/${SERVICE}
ENV SERVICE=${SERVICE}
CMD ["node", "dist/index.js"]
