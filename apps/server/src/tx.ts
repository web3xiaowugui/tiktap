import { createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { envChain } from "./chain.ts";
import { readConfig, type ChainConfig } from "./config.ts";
import type { Db } from "./db.ts";
import { currentEnv } from "./runtime.ts";

export { readConfig };
export type { ChainConfig };

export function requireMarket(cfg: ChainConfig): Address {
  if (!cfg.market) throw new Error("鏈厤缃?POOL_MARKET_ADDRESS");
  return cfg.market;
}

export function requireOperator(cfg: ChainConfig): Hex {
  if (!cfg.operatorPkey) throw new Error("鏈厤缃?OPERATOR_PKEY");
  return cfg.operatorPkey;
}

/** 鐢ㄦ煇涓閽ュ缓涓€涓?wallet client锛涘悓涓€涓湴鍧€鐨勫啓鍏ョ敱璋冪敤鏂逛覆琛屽寲銆?*/
export function walletFor(privateKey: Hex, env = currentEnv()) {
  const chain = envChain(env);
  return createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: chain.chain,
    transport: http(chain.rpcUrl, { timeout: 10_000, retryCount: 1 }),
  });
}

/** 鍚屼竴涓湴鍧€鐨勪氦鏄撳繀椤讳覆琛岋紝鍚﹀垯 nonce 浼氭挒銆?*/
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

/** 姣忕瑪鍐欐搷浣滈兘鍏堣惤 pending锛屽啀鎸?receipt 鏀圭姸鎬侊紱tx_hash 鍞竴閿繚璇佸箓绛夈€?*/
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
      "INSERT INTO txs (env, user_id, kind, tx_hash, status, payload, created_at) " +
        "VALUES (?, ?, ?, ?, 'pending', ?, ?)",
    )
    .run(
      currentEnv(),
      params.userId,
      params.kind,
      params.txHash,
      params.payload ? JSON.stringify(params.payload) : null,
      Date.now(),
    );
  return Number(result.lastInsertRowid);
}

export function markTxConfirmed(db: Db, txId: number): void {
  db.prepare(
    "UPDATE txs SET status = 'confirmed', confirmed_at = ? WHERE env = ? AND id = ?",
  ).run(Date.now(), currentEnv(), txId);
}

export function markTxFailed(db: Db, txId: number, error: string): void {
  db.prepare("UPDATE txs SET status = 'failed', error = ? WHERE env = ? AND id = ?").run(
    error,
    currentEnv(),
    txId,
  );
}

