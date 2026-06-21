import type { VaultStatus, Dex } from './enums.js';

/**
 * The set of risk limits the user authorizes on-chain. The execution service may
 * only trade within these; the vault program re-validates every one of them.
 */
export interface VaultLimits {
  maxTradeSizeSol: number;
  maxDailyLossSol: number;
  maxSlippageBps: number;
  maxOpenPositions: number;
  /** DEXs the user permits trading on. Mirrored on-chain as a bitmask. */
  allowedDexs: Dex[];
  /** Mints the user never wants to trade into. */
  tokenBlacklist: string[];
}

/** Decoded on-chain vault account state, normalized to SOL units for the API. */
export interface VaultState {
  vaultPda: string;
  owner: string;
  executor: string;
  status: VaultStatus;
  balanceSol: number;
  openPositions: number;
  dailyLossAccumulatedSol: number;
  dailyLossWindowStart: number;
  limits: VaultLimits;
}

/**
 * An unsigned, base64-serialized transaction the server builds for a vault action.
 * The frontend deserializes, has Phantom sign it, submits it, then calls
 * /vault/confirm with the resulting signature.
 */
export interface UnsignedVaultTransaction {
  /** base64 of a serialized (unsigned) VersionedTransaction. */
  serializedTransaction: string;
  /** Recent blockhash baked into the message, for client-side staleness checks. */
  blockhash: string;
  lastValidBlockHeight: number;
  /** Human description shown alongside the Phantom popup. */
  description: string;
}
