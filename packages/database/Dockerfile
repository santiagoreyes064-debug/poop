# One-shot migration runner. Applies Prisma migrations then exits.
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-workspace.yaml .npmrc pnpm-lock.yaml* ./
COPY turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install
RUN pnpm --filter "@sct/database" generate

WORKDIR /app/packages/database
# `migrate deploy` applies committed migrations; falls back to db push if none exist yet.
CMD ["sh", "-c", "pnpm prisma migrate deploy || pnpm prisma db push --accept-data-loss"]
