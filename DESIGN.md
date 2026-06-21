# Build a Solana Copy Trading Web App — Full Instructions (Vault Execution Revision)

> **Revision note.** This document is the original copy-trading spec updated for a
> **fully automated, non-custodial execution model built on an on-chain vault program**.
> Per-trade browser wallet approval has been removed from the core flow. Users authorize
> trading **once** by creating an on-chain vault, depositing funds, and configuring
> risk limits that are enforced **on-chain**. The execution service then trades
> automatically within those limits with no popup per trade.

---

## What changed in this revision (read first)

| Area | v1 (original) | This revision |
| --- | --- | --- |
| Execution authorization | User signs **every** copy trade in Phantom | User authorizes **once** by creating a vault + setting on-chain limits |
| Where funds live | User's own wallet until each approval | User's **vault PDA**, owned by a custom Solana program |
| Who signs trade txs | The user, per trade | A restricted **executor authority** that can only call `execute_trade` within limits |
| Risk enforcement | Off-chain risk engine only | Off-chain pre-checks **plus** on-chain enforcement in the program |
| Wallet signatures needed | Auth + every trade | Auth, vault create, deposit, withdraw, update permissions/risk settings only |
| New components | — | `solana-program/` (Anchor), `apps/vault-service`, vault DB tables, vault UI |
| WebSocket `SIGNING_REQUEST` | Core of the trade loop | **Removed from the trade loop**; WS is now status/telemetry + vault tx prompts only |

**Non-custodial guarantees that still hold:** the platform never asks for a seed phrase
or private key, never stores user private keys, and never custodies user funds. Funds sit
in a program-owned vault that **only the vault owner can withdraw from**, and the executor
authority can do nothing except execute swaps that pass on-chain limit checks.

---

## What you are building

A production-quality, non-custodial Solana copy trading web app modeled after uwuu.ai.
Users connect their Phantom wallet, create a dedicated on-chain **vault**, deposit SOL,
and set risk limits. They browse a leaderboard of profitable on-chain traders and activate
a bot that **automatically** mirrors those traders' swaps in real time — funded from the
user's vault, executed without any per-trade approval, and bounded by limits enforced
directly by the Solana program. The app never asks for a seed phrase or private key, and
funds can only ever be withdrawn to the wallet that owns the vault.

---

## Core user flow (keep this in mind for every decision)

1. User lands on the homepage and clicks "Connect Wallet" — Phantom popup appears.
2. User signs a one-time nonce message to authenticate (no password, no email required).
3. **Onboarding — vault creation.** User clicks "Create Vault." The frontend builds the
   `initialize_vault` transaction; Phantom shows it; the user signs once. This creates the
   on-chain vault PDA, registers the platform **executor authority**, and writes the
   initial risk limits on-chain.
4. **Deposit.** User signs a `deposit` transaction to move SOL from their wallet into the
   vault. They can deposit or withdraw at any time.
5. User browses the trader leaderboard, filtered and sorted by 7d ROI, 30d ROI, win rate,
   drawdown, trade count.
6. User clicks a trader, reviews on-chain trade history and performance stats.
7. User clicks "Copy" and sets per-relation settings (trade size, slippage, stop-loss,
   etc.). These are validated against the vault's on-chain limits.
8. The bot activates. Every time that trader swaps on any supported Solana DEX, the
   execution service builds and submits a trade **automatically** from the user's vault,
   **with no Phantom popup**, provided every configured limit passes off-chain pre-checks
   and on-chain enforcement.
9. Result appears in the user's dashboard in real time over the WebSocket.
10. User can pause/resume a relation, adjust settings, withdraw funds, or instantly
    **revoke trading permission** at any time. Pausing/revoking is enforced on-chain.

Target latency from trader transaction landing to the user's automated trade being
submitted: **under 500ms** (no human in the loop anymore).

---

## Tech stack — do not deviate from this

**Frontend**
- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui for components
- `@solana/wallet-adapter-react` + `@solana/wallet-adapter-react-ui` for Phantom connection (auth + vault txs only)
- Zustand for global state
- Recharts for PnL charts

**Backend (monorepo, all TypeScript)**
- Node.js 22
- Fastify for the API gateway
- WebSockets via `@fastify/websocket`
- Redis (streams for event queue, pub/sub for live telemetry, cache for leaderboard)
- PostgreSQL with Prisma ORM

**Blockchain**
- `@solana/web3.js`
- **Anchor (Rust)** for the custom vault program (`solana-program/`)
- `@coral-xyz/anchor` TypeScript client for building program instructions
- Helius API for WebSocket wallet monitoring and RPC (get a free key at helius.dev)
- Jupiter API v6 for swap routing and transaction building (invoked via CPI from the vault program)
- Jito block engine for fast bundle submission (fallback to standard RPC if Jito fails)

**Infrastructure**
- pnpm workspaces monorepo
- Turbo for build orchestration
- Docker Compose for local dev (PostgreSQL + Redis)
- GitHub Actions CI/CD
- Prometheus + Grafana for monitoring

---

## Monorepo structure — build exactly this layout

```
solana-program/         Anchor workspace: the custom non-custodial vault program (Rust)
  programs/vault/       initialize_vault, deposit, withdraw, update_limits, pause,
                        resume, revoke_executor, execute_trade (CPI to allowed DEX)
  tests/                Anchor/ts-mocha integration tests against a local validator

apps/
  api-gateway/        Fastify REST + WebSocket server (port 3001)
  wallet-monitor/     Helius WebSocket subscriber
  tx-parser/          Decodes raw Solana transactions into swap events
  copy-engine/        Fans parsed trades out to subscribers, applies off-chain risk rules
  execution/          Builds Jupiter routes, wraps them in a vault execute_trade ix,
                      signs with the executor authority, submits via Jito
  vault-service/      Vault lifecycle: tracks on-chain vault state, balances, deposit/
                      withdraw history, reconciles on-chain account data with the DB
  analytics/          Cron job — ROI, win rate, Sharpe, drawdown per trader + per vault
  notification/       Sends Telegram / Discord / email on trade events
  frontend/           Next.js 15 app

packages/
  shared-types/       TypeScript interfaces used by all services (incl. vault types)
  database/           Prisma schema + generated client, re-exported
  risk-engine/        Pure off-chain risk-check logic, fully unit-tested, no I/O
  vault-sdk/          TS wrapper around the Anchor client: build ix for create/deposit/
                      withdraw/update/pause/revoke/execute; PDA derivation; account decode
  dex-adapters/       One file per DEX (Jupiter, Raydium, Orca, Meteora), shared interface
```

---

## The custom Solana vault program (non-custodial core)

This program is what makes "fully automated" and "non-custodial" coexist. Build it with
Anchor.

### Accounts

- **Vault (PDA)** — seeds `["vault", owner_pubkey]`. Program-owned account that holds SOL
  (and associated token accounts for traded SPL tokens). Fields:
  - `owner` — the user's wallet pubkey (the only address allowed to withdraw)
  - `executor` — the platform executor authority pubkey allowed to call `execute_trade`
  - `status` — `ACTIVE` / `PAUSED` / `REVOKED`
  - `max_trade_size_lamports`
  - `max_daily_loss_lamports`
  - `daily_loss_accumulated_lamports` + `daily_loss_window_start` (rolling 24h)
  - `max_slippage_bps`
  - `max_open_positions` + `open_positions` counter
  - `allowed_dexs` — bitmask of permitted DEX program IDs
  - `token_blacklist` — list of disallowed mints (bounded length; overflow lives off-chain)
  - `bump`

### Instructions (each enforces limits on-chain)

- `initialize_vault(limits)` — signed by **owner**. Creates the PDA, sets `executor`, writes
  initial limits, status `ACTIVE`.
- `deposit(amount)` — signed by **owner**. Transfers SOL from owner into the vault PDA.
- `withdraw(amount)` — signed by **owner only**. Transfers SOL from the vault back to the
  owner. **No other address may ever withdraw.**
- `update_limits(limits)` — signed by **owner**. Updates risk parameters without moving
  funds.
- `pause()` / `resume()` — signed by **owner**. Toggles status; `execute_trade` rejects
  while `PAUSED`.
- `revoke_executor()` — signed by **owner**. Sets status `REVOKED` and/or clears
  `executor`, instantly and permanently stopping automated trading until re-authorized.
- `execute_trade(route_params)` — signed by the **executor authority**. Before doing
  anything it asserts, **on-chain**: status is `ACTIVE`; the target DEX program is in
  `allowed_dexs`; `tokenOut` is not in `token_blacklist`; the trade size ≤
  `max_trade_size_lamports`; the slippage ≤ `max_slippage_bps`; `open_positions` <
  `max_open_positions`; the projected/realized loss keeps `daily_loss_accumulated` ≤
  `max_daily_loss_lamports` (resetting the window if 24h elapsed). If all pass, it performs
  the swap via **CPI** into the allowed DEX/Jupiter and updates counters. If any check
  fails, the whole transaction reverts — no partial state, no fund movement.

### Executor authority — hard restrictions (enforced on-chain)

The executor is a **delegated, restricted authority** and nothing more. The vault program
must enforce all of the following at the instruction level:

- The executor is authorized to invoke **`execute_trade` only**. Every other instruction
  (`initialize_vault`, `deposit`, `withdraw`, `update_limits`, `pause`, `resume`,
  `revoke_executor`) must assert the signer is the **owner** and reject the executor.
- `execute_trade` must assert `signer == vault.executor` **and** `vault.status == ACTIVE`,
  then re-validate every user-defined limit (trade size, daily loss, slippage, open
  positions, allowed DEXs, token blacklist) before any CPI. Any violation reverts the whole
  transaction.
- The executor can **never withdraw**. `withdraw` transfers only from the vault PDA to
  `vault.owner` and is owner-signed; there is no code path by which the executor moves
  funds to any address other than a limit-bounded swap.
- The executor can **never modify permissions or risk settings**. Limits, pause/resume, and
  executor revocation are owner-only.

### Why this is non-custodial

- Funds live in a **program-owned PDA**, not a server wallet.
- The executor is fund-less and limit-bound; it physically cannot withdraw or change limits.
- Only the **owner** can withdraw, update limits, pause, or revoke — instantly, on-chain.
- The platform never holds the user's private key or seed phrase.

> **Security tradeoff to document, not hide:** the executor authority is an operational
> signer the platform controls (so it can submit trades without a popup). It holds **no
> funds** and has **no withdrawal power**, and the user can revoke it instantly on-chain.
> Treat the executor key as critical infrastructure: store it in an HSM/KMS, never in the
> repo or plain env files in production, rotate it regularly, and scope it per-environment.
> This is the deliberate, well-understood cost of "no popup per trade." Surface it clearly
> in the README and onboarding UI so users consent with full information.

---

## Database schema — build all of these tables

- **users** — id, email (optional), createdAt
- **connected_wallets** — id, publicKey, userId, isDefault, label
- **vaults** — id, userId, walletId, vaultPda (unique), ownerPubkey, executorPubkey,
  status (ACTIVE/PAUSED/REVOKED), onChainBalanceLamports (cached), maxTradeSizeSol,
  maxDailyLossSol, maxSlippageBps, maxOpenPositions, allowedDexs (string array),
  tokenBlacklist (string array), createdSignature, lastSyncedAt, createdAt
- **vault_transactions** — id, vaultId, kind (CREATE/DEPOSIT/WITHDRAW/UPDATE_LIMITS/PAUSE/
  RESUME/REVOKE), amountSol (nullable), signature (unique), status (PENDING/CONFIRMED/
  FAILED), createdAt, confirmedAt
- **traders** — id, walletAddress, label, status (ACTIVE/PAUSED/BANNED/INACTIVE), cached
  analytics fields (roi7d, roi30d, winRate, sharpeRatio, maxDrawdown, avgHoldTime,
  totalTrades, lastTradeAt)
- **copy_relations** — id, userId, vaultId, traderId, enabled, copyMode (FIXED/
  PROPORTIONAL), fixedAmountSol, proportionPct, maxTradeSizeSol, maxSlippageBps,
  stopLossPct, takeProfitPct, maxDailyLossSol, maxOpenPositions, tokenBlacklist (string
  array), pausedAt, pauseReason
- **trades** — id, traderId, signature (unique), slot, timestamp, tokenIn, tokenOut,
  amountIn, amountOut (store as strings to avoid BigInt precision loss), dex (JUPITER/
  RAYDIUM/ORCA/METEORA/UNKNOWN), priceImpactBps, feeSol
- **copy_trades** — id, userId, vaultId, originalTradeId, status (PENDING/SUBMITTED/
  CONFIRMED/FAILED/SKIPPED), copiedSignature, amountIn, amountOut, executionLatencyMs,
  pnlSol, pnlUsd, skipReason, errorMessage, jitoBundleId, settledAt
- **trader_analytics** — id, traderId, calculatedAt, windowDays (1/7/30/90), roi, winRate,
  totalTrades, avgHoldTimeSec, sharpeRatio, maxDrawdown, realizedPnlSol
- **vault_analytics** — id, vaultId, calculatedAt, windowDays (1/7/30/90), realizedPnlSol,
  unrealizedPnlSol, winRate, openPositions, depositedSol, withdrawnSol, netFlowSol
- **notification_preferences** — id, userId, channel (TELEGRAM/DISCORD/EMAIL/WEBHOOK),
  target, enabled, onTradeExecuted, onTradeFailed, onDailyLoss, onTraderPaused,
  onVaultLowBalance, onPermissionRevoked
- **audit_logs** — id, userId, action, metadata (JSON), ipAddress, createdAt
- **token_metadata** — mintAddress (PK), symbol, name, decimals, logoUri, verified,
  isHoneypot, updatedAt

---

## Real-time event flow — implement this exactly

Target execution time from trader transaction landing to **the user's automated trade
being submitted** is **under 500ms**. There is no human approval step.

1. Trader wallet submits a swap on Solana.
2. Helius WebSocket fires within ~20ms of confirmation.
3. **Wallet Monitor** pushes a `WalletEvent` to Redis stream `stream:wallet-events`.
4. **Tx Parser** consumes from that stream, fetches the full transaction via Helius RPC,
   finds the matching DEX adapter, parses token in/out/amounts, stores a `Trade` row,
   pushes a `ParsedTradeEvent` to `stream:parsed-trades`.
5. **Copy Engine** consumes from `stream:parsed-trades`, queries all enabled `CopyRelation`
   rows for that trader, runs the off-chain **Risk Engine** for each subscriber (fast fail
   for obviously invalid trades to save RPC), creates a `CopyTrade` row (status PENDING)
   for each allowed trade, pushes a `CopyOrderEvent` to `stream:copy-orders`.
6. **Execution Service** consumes from `stream:copy-orders`, checks the order deadline
   (discard if >3 seconds old), loads the user's vault state, calls the Jupiter quote API,
   calls the Jupiter swap API to build the route, then **wraps that route in a vault
   `execute_trade` instruction** (so on-chain limit checks run), and signs the transaction
   with the **executor authority** key.
7. Execution Service submits the transaction via the **Jito block engine** (fallback to
   Helius RPC if Jito fails) and waits for confirmation. The vault program performs all
   on-chain limit assertions atomically; if any fail, the tx reverts and the `CopyTrade`
   is marked `SKIPPED`/`FAILED` with the reason.
8. Execution Service updates the `CopyTrade` row with status CONFIRMED, signature, latency,
   and updates cached vault balance/open-position counters via `vault-service`.
9. Execution Service publishes a `TradeResult` to Redis pub/sub `telemetry:{userId}` and to
   `execution:results`.
10. **API Gateway** WebSocket handler receives `telemetry:{userId}` and forwards a
    `TRADE_UPDATE` to the user's connected browser tabs (live dashboard, no signing).
11. **Notification Service** consumes `execution:results` and sends Telegram/Discord/email
    if configured.

> The former steps about publishing a `SigningRequest`, forwarding it to the browser,
> calling `signTransaction`, and returning a signed tx are **removed**. The browser is no
> longer in the trade-execution path.

---

## Authentication — implement wallet-based auth only

No passwords. No email required. Unchanged from v1:

1. `POST /api/v1/auth/nonce` — takes `walletAddress`, stores a signed message in Redis with
   5-minute TTL, returns the message string.
2. Frontend calls `signMessage` on the wallet adapter with that message encoded as UTF-8
   bytes.
3. `POST /api/v1/auth/verify` — takes `walletAddress` and `signature` (base58-encoded),
   verifies the Ed25519 signature using `tweetnacl`, consumes the nonce, upserts the user
   and connected_wallet records, returns a JWT (7-day expiry).
4. All subsequent API calls include `Authorization: Bearer <token>`.
5. WebSocket connection authenticates via `?token=<jwt>` query parameter.

---

## Wallet signatures — exactly when they are required

The user signs **only** for:

1. **Authentication** — the nonce message (`signMessage`).
2. **Vault creation** — `initialize_vault`.
3. **Deposits** — `deposit`.
4. **Withdrawals** — `withdraw`.
5. **Updating permissions / risk settings** — `update_limits`, `pause`, `resume`,
   `revoke_executor`.

The user **never** signs an individual copy trade. All vault txs are built server-side
(via `vault-sdk`), sent to the browser, signed in Phantom (so the user sees exactly what
they authorize), and submitted. Each successful vault tx writes a `vault_transactions`
row and an `audit_logs` row.

---

## DEX adapter pattern — implement this interface

Every DEX adapter has exactly two methods:
- `canParse(tx: TransactionWithMeta): boolean` — fast check, usually just looks for the
  program ID in the account keys.
- `parse(tx: TransactionWithMeta, traderId: string): Promise<ParsedTradeEvent>` — extracts
  tokenIn, tokenOut, amountIn, amountOut using pre/post token balance diffs.

Implement adapters for: Jupiter v6 (`JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4`),
Raydium AMM v4 + CLMM, Orca Whirlpool, Meteora DLMM. The balance-diff approach (compare pre
vs post token balances from `tx.meta`) works reliably across all four DEXs.

Register all four adapters in a `DexAdapterRegistry`. The Tx Parser calls
`registry.findAdapter(tx)` and uses the first match.

> The set of DEX **program IDs** each adapter handles must also be represented as the
> `allowed_dexs` bitmask in the vault program, so on-chain enforcement and off-chain
> parsing stay in sync. Keep the mapping in `packages/shared-types`.

---

## Risk engine — two layers, off-chain pre-check + on-chain enforcement

The off-chain risk engine still runs first (to avoid wasting RPC/Jupiter calls and to give
fast skip reasons), but it is **no longer the final authority** — the vault program
re-checks the critical limits on-chain.

Off-chain checks run in this order, stopping at the first failure:

1. Is `copyRelation.enabled` true and the vault `ACTIVE` (not PAUSED/REVOKED)?
2. Is `trade.tokenOut` in the user's `tokenBlacklist` (relation or vault)?
3. Is the token flagged as a honeypot in `token_metadata`?
4. Is the target DEX in the vault's `allowedDexs`?
5. Is the token liquidity above the minimum threshold (5 SOL default)?
6. Has the user hit their `maxDailyLossSol` today?
7. Has the user hit their `maxOpenPositions` limit?
8. Calculate desired position size: FIXED → `fixedAmountSol`; PROPORTIONAL → vault balance
   × `proportionPct / 100`.
9. Cap at `maxTradeSizeSol`.
10. Is the result above the dust threshold (0.01 SOL minimum)?
11. Does the **vault** have enough SOL (amount + 0.005 SOL reserve for fees)?

The risk engine must be a pure class with all I/O injected via an interface
(`getVaultBalance`, `getVaultStatus`, `getDailyLoss`, `getOpenPositionCount`, `isHoneypot`,
`getTokenLiquidity`, `getAllowedDexs`). This makes it fully unit-testable. Write at least
**8** unit tests covering: allowed trade, disabled copy, paused/revoked vault, blacklisted
token, honeypot, disallowed DEX, daily loss hit, capped to maxTradeSize, insufficient vault
balance.

The **on-chain** mirror of checks 1, 2, 4, 6, 7, 9, and slippage is enforced in
`execute_trade`. This is the trust anchor: even if the off-chain engine has a bug or the
executor key is compromised, the program rejects anything outside the user's authorized
limits.

---

## API endpoints to implement

```
POST   /api/v1/auth/nonce
POST   /api/v1/auth/verify
POST   /api/v1/auth/wallet          add a second wallet to account

POST   /api/v1/vault                create vault: returns unsigned initialize_vault tx
GET    /api/v1/vault                user's vault(s): status, balance, limits
POST   /api/v1/vault/deposit        returns unsigned deposit tx for amountSol
POST   /api/v1/vault/withdraw       returns unsigned withdraw tx for amountSol
PATCH  /api/v1/vault/limits         returns unsigned update_limits tx
POST   /api/v1/vault/pause          returns unsigned pause tx
POST   /api/v1/vault/resume         returns unsigned resume tx
POST   /api/v1/vault/revoke         returns unsigned revoke_executor tx
POST   /api/v1/vault/confirm        client posts a signed/submitted signature to record it
GET    /api/v1/vault/transactions   deposit/withdraw/permission history (paginated)
GET    /api/v1/vault/analytics      vault P&L, balances, open positions

GET    /api/v1/traders/leaderboard  sort, order, page, perPage, minTrades
GET    /api/v1/traders/search       query string search
GET    /api/v1/traders/:id          profile + analytics + recent trades
POST   /api/v1/traders/add          nominate a wallet for monitoring

GET    /api/v1/copy                 list user's copy relations
POST   /api/v1/copy/subscribe       create a new copy relation (validated vs vault limits)
PATCH  /api/v1/copy/:id             update settings
DELETE /api/v1/copy/:id             unsubscribe
POST   /api/v1/copy/:id/pause
POST   /api/v1/copy/:id/resume
GET    /api/v1/copy/:id/trades      trade history for a relation

GET    /api/v1/dashboard            summary stats (incl. vault balance + available liquidity)
GET    /api/v1/dashboard/trades     paginated full history with filters
GET    /api/v1/dashboard/tokens     per-token P&L summary
PUT    /api/v1/dashboard/notifications

GET    /health
GET    /metrics                     Prometheus format
```

Apply rate limiting globally (100 req/min per IP). All endpoints except `/auth/nonce`,
`/auth/verify`, and `/health` require a valid JWT. The vault endpoints **never sign** on
the server for create/deposit/withdraw/limit changes — they return unsigned transactions
for the user to sign in Phantom; `/vault/confirm` records the resulting signature.

---

## WebSocket protocol — implement these message types

Because trades are automated, the WebSocket is now **telemetry + optional vault-tx
prompting**, not a signing channel for trades.

**Server → Client:**
- `{ type: "CONNECTED", userId }` — sent on successful connection.
- `{ type: "TRADE_UPDATE", copyTradeId, status, signature, latencyMs, pnlSol }` — live
  automated-trade status updates.
- `{ type: "VAULT_UPDATE", vaultId, status, balanceSol, openPositions }` — pushed on
  deposit/withdraw/limit change/trade settlement.
- `{ type: "ALERT", level, message }` — e.g. daily-loss threshold hit, low vault balance,
  executor revoked.
- `{ type: "PONG" }` — heartbeat response.

**Client → Server:**
- `{ type: "SUBSCRIBE", topics: ["trades","vault"] }` — choose telemetry streams.
- `{ type: "PING" }` — heartbeat (send every 30s).

The API Gateway maintains a `Map<userId, Set<WebSocket>>` to support multiple browser tabs
per user. Use Redis pub/sub (`telemetry:{userId}`) so the WebSocket handler and the
execution service can be on different servers.

> The v1 `SIGNING_REQUEST` / `SIGNING_RESPONSE` message types are **removed** from the
> trade loop. Vault transactions (create/deposit/withdraw/update) are handled through the
> normal REST + Phantom signing flow, not the WebSocket.

---

## Frontend pages to build

**`/` — Dashboard**
- Vault status card: status badge (ACTIVE/PAUSED/REVOKED), balance, available liquidity,
  quick "Deposit / Withdraw / Pause" actions.
- Portfolio PnL cards: 24h, 7d.
- Active copied traders count, open positions count.
- Recent trades table: pair, status badge (colored), P&L, execution latency, DEX. **No
  pending-signature column** — trades are automatic.
- If wallet not connected: hero with "Connect Wallet."
- If connected but no vault: onboarding CTA "Create Vault" with a plain-language
  explanation of the non-custodial vault model and the executor-authority tradeoff.

**`/vault` — Vault management (new)**
- Vault overview: PDA address, owner, status, balance, open positions.
- Deposit and withdraw forms (each builds an unsigned tx → Phantom).
- On-chain limit editor: max trade size, max daily loss, max slippage, max open positions,
  allowed DEXs (multi-select), token blacklist (comma-separated mints) → `update_limits`.
- **Pause trading** and **Revoke permission** buttons (clearly labeled, with confirmation),
  emphasizing they take effect on-chain immediately.
- Deposit/withdraw/permission history table.
- Vault P&L chart (Recharts) and net-flow summary.

**`/traders` — Leaderboard**
- Sortable by 7d ROI, 30d ROI, win rate, Sharpe ratio, max drawdown, trade count.
- Columns: rank, wallet (truncated + label), 7d ROI, 30d ROI, win rate, Sharpe, drawdown,
  trades, copiers, "Copy" button.
- "Copy" opens a modal for relation settings (size, slippage, stop-loss) that validates
  against the vault's on-chain limits and warns if a setting exceeds them.

**`/traders/[id]` — Trader profile**
- Wallet address, label, status badge.
- PnL chart (Recharts, 7d/30d/90d switcher).
- Stats grid: ROI, win rate, Sharpe, drawdown, avg hold time, total trades.
- Recent trades table.

**`/copy` — Copy settings**
- List active copy relations as cards: trader name/address, enabled toggle, quick stats
  (mode, slippage, max size).
- Expandable settings form: copyMode, SOL amount, max size, slippage bps, stop-loss %,
  take-profit %, daily loss limit, token blacklist.
- Unsubscribe with confirmation.
- Each card shows whether its settings fit within current vault limits.

**Shared layout**
- Sticky nav bar: "SCT" logo, Dashboard / Traders / Copy / Vault links, WalletMultiButton
  on the right, plus a small vault-status pill.
- Dark theme (gray-950 background, brand purple `#9945FF`, Solana green `#14F195` for
  positive P&L).

---

## Execution / signing model — automated, non-custodial vault execution

- The user authorizes trading **once** by creating a vault and configuring on-chain limits.
- The **execution service** builds each trade by: getting a Jupiter route → wrapping it in
  the vault `execute_trade` instruction → signing with the **executor authority** →
  submitting via Jito (fallback Helius RPC).
- All limit enforcement is duplicated **on-chain**; the program reverts any trade outside
  the user's authorized parameters.
- Funds are held in the program-owned vault PDA and are **only ever withdrawable by the
  owner** to the owner's wallet.

**Permanently excluded, non-negotiable:** asking for a seed phrase or private key; storing
user private keys; custodial server wallets that hold user funds; any flow that lets the
platform move user funds outside the user's on-chain limits.

**Executor authority handling (operational):** the executor key is server-controlled but
fund-less and limit-bound. Store it in KMS/HSM, never in source or plaintext prod env,
rotate regularly, and make revocation a one-click on-chain action for the user.

---

## Docker Compose services for local dev

- `postgres` — postgres:16-alpine, port 5432, health check
- `redis` — redis:7-alpine, port 6379, append-only persistence, 256MB max memory, health
  check
- `solana-validator` — local test validator with the vault program deployed (for local
  end-to-end paper trading without mainnet)
- `migrate` — one-shot container that runs `prisma migrate deploy` and exits
- `api-gateway` — port 3001
- `wallet-monitor`
- `tx-parser`
- `copy-engine`
- `execution`
- `vault-service`
- `analytics`
- `notification`
- `prometheus` — port 9090, mounts prometheus.yml
- `grafana` — port 3002, admin password from env

All services share an `.env` via `x-common-env` anchor. App services depend on postgres and
redis being healthy; `execution` and `vault-service` also depend on the validator (local)
or use the configured cluster RPC.

---

## Environment variables required

```
DATABASE_URL
REDIS_URL
JWT_SECRET                  generate with: openssl rand -hex 32
HELIUS_API_KEY              get free at helius.dev
JITO_BLOCK_ENGINE_URL       https://mainnet.block-engine.jito.wtf
JITO_AUTH_TOKEN             optional, improves speed
SOLANA_RPC_URL              cluster RPC (local validator for dev)
VAULT_PROGRAM_ID            deployed Anchor program id
EXECUTOR_AUTHORITY_KEY      executor signer; load from KMS/secret manager in prod, never commit
TELEGRAM_BOT_TOKEN          optional
DISCORD_WEBHOOK_URL         optional
SENDGRID_API_KEY            optional
NODE_ENV
CORS_ORIGIN
PORT
PAPER_TRADING               true|false
```

---

## Analytics calculations — implement these exactly

Run every 5 minutes across all ACTIVE and PAUSED traders. For each trader, calculate for
windows of 1, 7, 30, and 90 days:

- **Win rate** — trades where `amountOut > amountIn` divided by total trades (simplified
  heuristic; accurate P&L requires token price data from Birdeye).
- **Average hold time** — match SOL→token buys with subsequent token→SOL sells for the same
  token, average the time delta in seconds.
- **Sharpe ratio** — group trades by day, compute daily return approximation, divide mean
  daily return by standard deviation, multiply by sqrt(365) to annualize. Return 0 if fewer
  than 5 data points.
- **Max drawdown** — build a cumulative return series by multiplying `amountOut/amountIn`
  across trades in order. Track peak. Max drawdown = max((peak - current) / peak) across all
  points.
- **ROI** — requires Birdeye price API for USD value at trade time. In v1, store 0 and add a
  TODO comment.

After calculating, update the cached fields on the `traders` table and invalidate all
`leaderboard:*` Redis cache keys.

**Vault analytics (new):** in the same cron, compute per-vault `vault_analytics`
(realized/unrealized P&L, win rate, open positions, deposited/withdrawn/net-flow SOL) using
`copy_trades` joined to `vault_transactions`, and push `VAULT_UPDATE` telemetry.

---

## Scalability targets — design for these

- 100,000 monitored wallets (Wallet Monitor uses one WebSocket subscription per wallet; at
  this scale run multiple monitor instances behind a Redis set).
- 10,000 concurrent users (API Gateway is stateless; scale horizontally).
- 50,000 trades per hour (Redis streams with consumer groups allow multiple Tx Parser /
  Copy Engine / Execution instances; use `xReadGroup` so each message is processed exactly
  once).
- The Execution service is the new throughput-critical component: it signs with the
  executor authority and submits on-chain. Scale it horizontally with the consumer group,
  and shard executor signing capacity (e.g., multiple executor keys per environment) if a
  single signer becomes a bottleneck. The vault program treats any registered executor key
  identically, so this scales cleanly.
- Redis streams provide idempotency and replay — a crashed consumer picks up unacknowledged
  messages from the PEL.

---

## Security requirements

- JWT secret must be at least 32 random bytes (`openssl rand -hex 32`).
- Ed25519 signature verification uses `tweetnacl` — never trust the walletAddress claim
  without verifying the signature.
- One-time nonces: Redis, 5-minute TTL, delete immediately after successful verification.
- Rate limiting: 100 requests/minute per IP via `@fastify/rate-limit`.
- Audit log: write a row for every sensitive action (`wallet.connected`, `vault.created`,
  `vault.deposit`, `vault.withdraw`, `vault.limits_updated`, `vault.paused`,
  `vault.resumed`, `vault.revoked`, `copy.subscribed`, `copy.settings_updated`,
  `copy.unsubscribed`).
- Docker: run all services as non-root user (uid 1001).
- Allowed fields on PATCH endpoints: explicitly whitelist updatable fields; never allow
  userId, vaultId, traderId, or any on-chain authority field to be changed via the API.
- **Executor authority:** stored in KMS/HSM, never in repo or plaintext prod env, rotated
  regularly, scoped per environment. It is fund-less and limit-bound, and the user can
  revoke it on-chain instantly.
- **On-chain is the source of truth for limits.** Off-chain checks are an optimization;
  `execute_trade` re-validates every critical limit and reverts on violation.

---

## Paper trading mode

`PAPER_TRADING=true` support. When enabled: the execution service skips real
Jupiter/Jito/on-chain submission and records a synthetic `CopyTrade` with a simulated
outcome against a **simulated vault balance**. P&L is tracked in the DB exactly as in
production. All risk rules (off-chain) and the same limit logic the program would enforce,
analytics, and notifications still run. For local end-to-end testing of the real on-chain
path without mainnet funds, deploy the vault program to the bundled `solana-validator` and
point `SOLANA_RPC_URL` at it. Recommend users run in paper trading mode for at least one
week before enabling real funds.

---

## What NOT to build in v1

- Email/password authentication (wallet auth only).
- Mobile app (responsive web only).
- Birdeye price integration (add TODO comments where price data is needed).
- Kubernetes manifests (Docker Compose only for now).
- Token discovery or mempool sniping (copy trading only).
- Any feature that requires storing a private key or seed phrase, or that custodies user
  funds (permanently excluded).
- Multi-sig or threshold executor schemes (design the executor as a single rotatable
  authority for now; note multi-sig as a v2 hardening option).

---

## File delivery

Produce everything as a downloadable zip containing the complete monorepo **including the
`solana-program/` Anchor workspace**. Every file must be fully implemented — no placeholder
comments like "TODO: implement this." The only acceptable TODOs are the ones explicitly
called out here (Birdeye price data). Include a `README.md` with the quick start (now
covering: install, start infra, deploy the vault program to the local validator, run
migrations, start services) and a `docs/LOCAL_DEVELOPMENT.md` with step-by-step,
beginner-friendly instructions. The README must clearly explain the non-custodial vault
model and the executor-authority tradeoff so users understand exactly what they authorize.
