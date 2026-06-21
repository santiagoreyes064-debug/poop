# Solana Copy Trader (SCT)

A **non-custodial** Solana copy-trading platform. Users connect Phantom, create an
on-chain **vault** managed by a custom Solana program, deposit SOL, and set risk limits
that are enforced **on-chain**. The platform then mirrors top traders' swaps **automatically**
— no per-trade approval popup — while a **restricted executor authority** can only execute
trades within the user's authorized limits and can **never** withdraw funds or change
permissions.

> The full architecture and rationale live in [`DESIGN.md`](./DESIGN.md).

## Non-custodial guarantees

- The app never asks for a seed phrase or private key.
- User funds live in a program-owned vault PDA; **only the owner can withdraw**.
- The executor can only call `execute_trade` within on-chain limits — it cannot withdraw or
  modify permissions. The owner can pause or revoke it instantly on-chain.
- Wallet signatures are required **only** for: authentication, vault creation, deposits,
  withdrawals, and updating permissions/risk settings.

## Tech stack

pnpm workspaces + Turbo monorepo. Next.js 15 / TypeScript / Tailwind / shadcn/ui frontend.
Fastify + WebSocket API gateway. Redis (streams + pub/sub + cache). PostgreSQL + Prisma.
Anchor (Rust) vault program. Helius (monitoring + RPC), Jupiter v6 (routing), Jito (submission).

## Repository layout

```
solana-program/   Anchor vault program (Rust) + tests          (phase 2)
apps/
  api-gateway/    Fastify REST + WebSocket (port 3001)          (phase 3)
  wallet-monitor/ Helius WebSocket subscriber                   (phase 4)
  tx-parser/      Decodes raw txs into swap events              (phase 4)
  copy-engine/    Fans trades to subscribers, off-chain risk    (phase 4)
  execution/      Builds vault execute_trade tx, submits        (phase 4)
  vault-service/  Vault lifecycle + on-chain state sync         (phase 4)
  analytics/      ROI / win rate / Sharpe / drawdown cron       (phase 5)
  notification/   Telegram / Discord / email                    (phase 5)
  frontend/       Next.js 15 app                                (phase 6)
packages/
  shared-types/   Types/contracts shared by all services        done
  database/        Prisma schema + client                        done
  risk-engine/     Pure off-chain risk checks (+ unit tests)     (phase 3)
  vault-sdk/        Anchor client wrapper / ix builders          (phase 4)
  dex-adapters/     One adapter per DEX                          (phase 4)
```

## Quick start (5 commands)

```bash
cp .env.example .env                 # 1. fill in HELIUS_API_KEY and JWT_SECRET
pnpm install                         # 2. install the workspace
docker compose up -d postgres redis  # 3. start infra
pnpm db:deploy                       # 4. apply the database schema
pnpm dev                             # 5. run all services in dev mode
```

Generate a `JWT_SECRET` with `openssl rand -hex 32`. Get a free `HELIUS_API_KEY` at
[helius.dev](https://helius.dev). Keep `PAPER_TRADING=true` until you've validated behavior.

A detailed, beginner-friendly walkthrough lands in `docs/LOCAL_DEVELOPMENT.md` (phase 7).

## Build status

This repo is being built in phases. **Phase 1 (this commit)** delivers the monorepo
foundation: workspace config, Turbo, the `shared-types` and `database` packages (full Prisma
schema including the vault tables), Docker Compose infra, and environment templates.
Subsequent phases add the vault program, services, and frontend.
