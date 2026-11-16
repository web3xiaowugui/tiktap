import { createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN_ID, RPC_URL, xlayer } from "./chain.ts";
import type { Db } from "./db.ts";

/** 未配置时返回 null，路由层据此回 503。 */
export function readConfig() {
  const market = (process.env.POOL_MARKET_ADDRESS ?? "").trim();
  const operatorPkey = (process.env.OPERATOR_PKEY ?? "").trim();
  const gasTopUpWei = BigInt(process.env.GAS_TOPUP_WEI ?? "0");

  const tokens: Record<string, Address> = {};
  for (const symbol of ["TEST", "OKB", "BEM"]) {
    const value = (process.env[`${symbol}_TOKEN_ADDRESS`] ?? "").trim();
    if (value) tokens[symbol] = value as Address;
  }

  return {
    market: market ? (market as Address) : null,
    operatorPkey: operatorPkey ? (operatorPkey as Hex) : null,
    gasTopUpWei,
    tokens,
    chainId: CHAIN_ID,
    rpcUrl: RPC_URL,
  };
}

export type ChainConfig = ReturnType<typeof readConfig>;

export function requireMarket(cfg: ChainConfig): Address {
  if (!cfg.market) throw new Error("未配置 POOL_MARKET_ADDRESS");
  return cfg.market;
}

export function requireOperator(cfg: ChainConfig): Hex {
  if (!cfg.operatorPkey) throw new Error("未配置 OPERATOR_PKEY");
  return cfg.operatorPkey;
}

/** 用某个私钥建一个 wallet client；同一个地址的写入由调用方串行化。 */
export function walletFor(privateKey: Hex) {
  return createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: xlayer,
    transport: http(RPC_URL, { timeout: 10_000, retryCount: 1 }),
  });
}

/** 同一个地址的交易必须串行，否则 nonce 会撞。 */
const addressLocks = new Map<string, Promise<unknown>>();

export function withAddressLock<T>(address: string, task: () => Promise<T>): Promise<T> {
  const key = address.toLowerCase();
  const previous = addressLocks.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  addressLocks.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

/** 每笔写操作都先落 pending，再按 receipt 改状态；tx_hash 唯一键保证幂等。 */
export function recordPendingTx(
  db: Db,
  params: {
    userId: number | null;
    kind: string;
    txHash: string;
    payload?: unknown;
  },
): number {
  const result = db
    .prepare(
      "INSERT INTO txs (user_id, kind, tx_hash, status, payload, created_at) " +
        "VALUES (?, ?, ?, 'pending', ?, ?)",
    )
    .run(
      params.userId,
      params.kind,
      params.txHash,
      params.payload ? JSON.stringify(params.payload) : null,
      Date.now(),
    );
  return Number(result.lastInsertRowid);
}

export function markTxConfirmed(db: Db, txId: number): void {
  db.prepare("UPDATE txs SET status = 'confirmed', confirmed_at = ? WHERE id = ?").run(
    Date.now(),
    txId,
  );
}

export function markTxFailed(db: Db, txId: number, error: string): void {
  db.prepare("UPDATE txs SET status = 'failed', error = ? WHERE id = ?").run(error, txId);
}
