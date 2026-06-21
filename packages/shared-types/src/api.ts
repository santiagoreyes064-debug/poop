import type { CopyMode, VaultTxKind } from './enums.js';
import type { VaultLimits } from './vault.js';

/**
 * REST request/response DTOs. Kept framework-agnostic so both the API gateway and
 * the frontend can import them.
 */

// --- Auth ---
export interface NonceRequest {
  walletAddress: string;
}
export interface NonceResponse {
  message: string;
}
export interface VerifyRequest {
  walletAddress: string;
  /** base58-encoded Ed25519 signature over the nonce message. */
  signature: string;
}
export interface VerifyResponse {
  token: string;
  userId: string;
}

// --- Vault ---
export interface CreateVaultRequest {
  walletAddress: string;
  limits: VaultLimits;
}
export interface VaultAmountRequest {
  amountSol: number;
}
export interface UpdateLimitsRequest {
  limits: Partial<VaultLimits>;
}
export interface ConfirmVaultTxRequest {
  kind: VaultTxKind;
  signature: string;
  amountSol?: number;
}

// --- Traders / leaderboard ---
export type LeaderboardSort =
  | 'roi7d'
  | 'roi30d'
  | 'winRate'
  | 'sharpeRatio'
  | 'maxDrawdown'
  | 'totalTrades';

export interface LeaderboardQuery {
  sort?: LeaderboardSort;
  order?: 'asc' | 'desc';
  page?: number;
  perPage?: number;
  minTrades?: number;
}

export interface LeaderboardRow {
  rank: number;
  traderId: string;
  walletAddress: string;
  label: string | null;
  roi7d: number;
  roi30d: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalTrades: number;
  copiers: number;
}

// --- Copy relations ---
export interface SubscribeRequest {
  traderId: string;
  copyMode: CopyMode;
  fixedAmountSol?: number;
  proportionPct?: number;
  maxTradeSizeSol: number;
  maxSlippageBps: number;
  stopLossPct?: number;
  takeProfitPct?: number;
  maxDailyLossSol?: number;
  maxOpenPositions?: number;
  tokenBlacklist?: string[];
}

export type UpdateCopyRelationRequest = Partial<Omit<SubscribeRequest, 'traderId'>> & {
  enabled?: boolean;
};

// --- Pagination envelope ---
export interface Paginated<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}
