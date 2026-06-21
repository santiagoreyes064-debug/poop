import type { Dex, SkipReason } from './enums.js';

/**
 * Pipeline event contracts. These objects are JSON-serialized into Redis streams.
 * All token amounts are STRINGS to avoid BigInt precision loss across the wire and
 * in PostgreSQL.
 */

/** Emitted by wallet-monitor when Helius reports a monitored wallet transaction. */
export interface WalletEvent {
  /** Trader wallet that transacted. */
  walletAddress: string;
  /** Internal trader id (resolved by wallet-monitor from the monitored set). */
  traderId: string;
  /** Transaction signature. */
  signature: string;
  /** Slot the tx landed in. */
  slot: number;
  /** Unix ms when wallet-monitor observed the event. */
  observedAt: number;
}

/** Emitted by tx-parser after decoding a swap from a raw transaction. */
export interface ParsedTradeEvent {
  traderId: string;
  signature: string;
  slot: number;
  /** Unix seconds of the block time. */
  timestamp: number;
  tokenIn: string;
  tokenOut: string;
  /** Raw base-unit amounts as strings. */
  amountIn: string;
  amountOut: string;
  dex: Dex;
  priceImpactBps: number;
  feeSol: string;
}

/**
 * Emitted by copy-engine for each subscriber whose trade passed off-chain risk
 * checks. The execution service consumes this and builds the on-chain trade.
 */
export interface CopyOrderEvent {
  copyTradeId: string;
  userId: string;
  vaultId: string;
  vaultPda: string;
  ownerPubkey: string;
  originalTradeId: string;
  tokenIn: string;
  tokenOut: string;
  /** Amount of tokenIn (lamports for SOL) the user wants to spend, as a string. */
  amountInLamports: string;
  maxSlippageBps: number;
  dex: Dex;
  /** Unix ms after which the order is stale and must be discarded. */
  deadline: number;
  createdAt: number;
}

/** Published to `execution:results` after a copy trade settles (or fails). */
export interface TradeResult {
  copyTradeId: string;
  userId: string;
  vaultId: string;
  success: boolean;
  signature?: string;
  amountIn?: string;
  amountOut?: string;
  executionLatencyMs?: number;
  pnlSol?: string;
  jitoBundleId?: string;
  skipReason?: SkipReason;
  errorMessage?: string;
  settledAt: number;
}
