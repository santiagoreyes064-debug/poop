/**
 * Enums shared across all services. These mirror the Prisma enums in
 * `@sct/database` so the wire format and the DB stay in lock-step.
 */

export enum VaultStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  REVOKED = 'REVOKED',
}

export enum VaultTxKind {
  CREATE = 'CREATE',
  DEPOSIT = 'DEPOSIT',
  WITHDRAW = 'WITHDRAW',
  UPDATE_LIMITS = 'UPDATE_LIMITS',
  PAUSE = 'PAUSE',
  RESUME = 'RESUME',
  REVOKE = 'REVOKE',
}

export enum VaultTxStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
}

export enum TraderStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  BANNED = 'BANNED',
  INACTIVE = 'INACTIVE',
}

export enum CopyMode {
  FIXED = 'FIXED',
  PROPORTIONAL = 'PROPORTIONAL',
}

export enum Dex {
  JUPITER = 'JUPITER',
  RAYDIUM = 'RAYDIUM',
  ORCA = 'ORCA',
  METEORA = 'METEORA',
  UNKNOWN = 'UNKNOWN',
}

export enum CopyTradeStatus {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

export enum NotificationChannel {
  TELEGRAM = 'TELEGRAM',
  DISCORD = 'DISCORD',
  EMAIL = 'EMAIL',
  WEBHOOK = 'WEBHOOK',
}

/**
 * Reasons a copy order can be skipped by the risk engine. These are surfaced to
 * the user verbatim in the dashboard, so keep them human-readable.
 */
export enum SkipReason {
  COPY_DISABLED = 'COPY_DISABLED',
  VAULT_NOT_ACTIVE = 'VAULT_NOT_ACTIVE',
  TOKEN_BLACKLISTED = 'TOKEN_BLACKLISTED',
  HONEYPOT = 'HONEYPOT',
  DEX_NOT_ALLOWED = 'DEX_NOT_ALLOWED',
  INSUFFICIENT_LIQUIDITY = 'INSUFFICIENT_LIQUIDITY',
  DAILY_LOSS_LIMIT = 'DAILY_LOSS_LIMIT',
  MAX_OPEN_POSITIONS = 'MAX_OPEN_POSITIONS',
  BELOW_DUST_THRESHOLD = 'BELOW_DUST_THRESHOLD',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  ORDER_EXPIRED = 'ORDER_EXPIRED',
  ON_CHAIN_REJECTED = 'ON_CHAIN_REJECTED',
}
