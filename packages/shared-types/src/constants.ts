import { Dex } from './enums.js';

/**
 * Redis stream names (consumed via consumer groups for exactly-once processing).
 */
export const STREAMS = {
  WALLET_EVENTS: 'stream:wallet-events',
  PARSED_TRADES: 'stream:parsed-trades',
  COPY_ORDERS: 'stream:copy-orders',
} as const;

/**
 * Redis consumer groups. Each pipeline stage reads its upstream stream as a group
 * so multiple instances can scale horizontally without double-processing.
 */
export const CONSUMER_GROUPS = {
  TX_PARSER: 'cg:tx-parser',
  COPY_ENGINE: 'cg:copy-engine',
  EXECUTION: 'cg:execution',
} as const;

/**
 * Redis pub/sub channels. `telemetry:{userId}` carries live UI updates; the
 * API gateway subscribes per connected user.
 */
export const CHANNELS = {
  telemetry: (userId: string) => `telemetry:${userId}`,
  executionResults: 'execution:results',
} as const;

/**
 * Redis cache key helpers. Leaderboard keys are invalidated by the analytics job.
 */
export const CACHE_KEYS = {
  leaderboard: (sort: string, order: string, page: number, perPage: number, minTrades: number) =>
    `leaderboard:${sort}:${order}:${page}:${perPage}:${minTrades}`,
  leaderboardPrefix: 'leaderboard:',
  nonce: (walletAddress: string) => `nonce:${walletAddress}`,
  traderProfile: (traderId: string) => `trader:${traderId}`,
} as const;

/** Nonce TTL for the auth challenge (5 minutes). */
export const NONCE_TTL_SECONDS = 5 * 60;

/** Copy orders older than this when the execution service picks them up are discarded. */
export const ORDER_DEADLINE_MS = 3_000;

/** Defaults used by the risk engine when a relation/vault leaves them unset. */
export const RISK_DEFAULTS = {
  MIN_LIQUIDITY_SOL: 5,
  DUST_THRESHOLD_SOL: 0.01,
  FEE_RESERVE_SOL: 0.005,
} as const;

export const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Canonical DEX program IDs. Used by the off-chain adapters AND mirrored as the
 * `allowed_dexs` bitmask enforced on-chain, so the two stay in sync.
 */
export const DEX_PROGRAM_IDS: Record<Exclude<Dex, Dex.UNKNOWN>, string[]> = {
  [Dex.JUPITER]: ['JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'],
  [Dex.RAYDIUM]: [
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // AMM v4
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', // CLMM
  ],
  [Dex.ORCA]: ['whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'], // Whirlpool
  [Dex.METEORA]: ['LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo'], // DLMM
};

/**
 * Bit positions for the on-chain `allowed_dexs` bitmask. The vault program checks
 * `(allowed_dexs & (1 << DEX_BIT[dex])) != 0` before executing on a DEX.
 */
export const DEX_BIT: Record<Exclude<Dex, Dex.UNKNOWN>, number> = {
  [Dex.JUPITER]: 0,
  [Dex.RAYDIUM]: 1,
  [Dex.ORCA]: 2,
  [Dex.METEORA]: 3,
};

/** Build an `allowed_dexs` bitmask from a list of DEX names. */
export function dexListToBitmask(dexes: Dex[]): number {
  return dexes.reduce((mask, dex) => {
    if (dex === Dex.UNKNOWN) return mask;
    return mask | (1 << DEX_BIT[dex]);
  }, 0);
}

/** Decode an `allowed_dexs` bitmask back into a list of DEX names. */
export function bitmaskToDexList(mask: number): Dex[] {
  return (Object.keys(DEX_BIT) as Array<Exclude<Dex, Dex.UNKNOWN>>).filter(
    (dex) => (mask & (1 << DEX_BIT[dex])) !== 0,
  );
}

/** Native SOL wrapped mint, used as tokenIn/tokenOut for SOL legs. */
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';
