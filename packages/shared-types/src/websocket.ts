import type { CopyTradeStatus, VaultStatus } from './enums.js';

/**
 * WebSocket protocol. NOTE: in the vault execution model the socket carries
 * telemetry only — there is no per-trade signing handshake. Vault transactions
 * (create/deposit/withdraw/limits) go through REST + Phantom, not this socket.
 */

export type ServerMessage =
  | { type: 'CONNECTED'; userId: string }
  | {
      type: 'TRADE_UPDATE';
      copyTradeId: string;
      status: CopyTradeStatus;
      signature?: string;
      latencyMs?: number;
      pnlSol?: string;
    }
  | {
      type: 'VAULT_UPDATE';
      vaultId: string;
      status: VaultStatus;
      balanceSol: number;
      openPositions: number;
    }
  | { type: 'ALERT'; level: 'info' | 'warning' | 'error'; message: string }
  | { type: 'PONG' };

export type ClientMessage =
  | { type: 'SUBSCRIBE'; topics: Array<'trades' | 'vault'> }
  | { type: 'PING' };

export const WS_HEARTBEAT_INTERVAL_MS = 30_000;
