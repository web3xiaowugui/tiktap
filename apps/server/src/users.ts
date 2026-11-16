import { publicClient } from "./chain.ts";
import { allowUserOnChain } from "./market-sync.ts";
import { HttpError } from "./http.ts";
import {
  markTxConfirmed,
  markTxFailed,
  readConfig,
  recordPendingTx,
  requireOperator,
  walletFor,
  withAddressLock,
} from "./tx.ts";
import { createCustodialWallet } from "./wallet.ts";
import type { Db } from "./db.ts";

export interface CreatedUser {
  id: number;
  address: string;
  allowTxHash: string | null;
  fundedWei: string;
  warning?: string;
  /** true = 这个 X id 之前就建过号，直接复用原地址。 */
  reused?: boolean;
}

/**
 * 建号：生成托管地址 → 私钥加密入库 → 合约白名单放过 →（可选）打一点原生 gas。
 * 用户不持有私钥，交易由后端用这个地址签名发起。
 */
export async function createUser(
  db: Db,
  creator?: string,
  xUserId?: string,
): Promise<CreatedUser> {
  const known = xUserId
    ? (db
        .prepare("SELECT id, address FROM users WHERE x_user_id = ?")
        .get(xUserId) as { id: number; address: string } | undefined)
    : undefined;
  if (known) {
    return {
      id: known.id,
      address: known.address,
      allowTxHash: null,
      fundedWei: "0",
      reused: true,
    };
  }

  const wallet = createCustodialWallet();
  const email = `${wallet.address.toLowerCase()}@tiktap.local`;

  const existing = db
    .prepare("SELECT id, address FROM users WHERE address = ?")
    .get(wallet.address) as { id: number; address: string } | undefined;
  if (existing) throw new HttpError(409, `该地址已存在：${existing.address}`);

  const result = db
    .prepare(
      "INSERT INTO users (email, address, enc_pkey, creator, created_at, x_user_id) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(email, wallet.address, wallet.encPkey, creator ?? null, Date.now(), xUserId ?? null);
  const id = Number(result.lastInsertRowid);

  const cfg = readConfig();
  let allowTxHash: string | null = null;
  let warning: string | undefined;

  try {
    if (!cfg.market || !cfg.operatorPkey) throw new Error("未配置 POOL_MARKET_ADDRESS / OPERATOR_PKEY");
    const hash = await allowUserOnChain(cfg, wallet.address);
    if (hash !== "0x0") {
      const txId = recordPendingTx(db, {
        userId: id,
        kind: "setAllowed",
        txHash: hash,
        payload: { address: wallet.address },
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "success") markTxConfirmed(db, txId);
      else markTxFailed(db, txId, "白名单交易回滚");
      allowTxHash = hash;
    }
  } catch (error) {
    warning = `白名单未生效：${describe(error)}`;
  }

  let fundedWei = "0";
  if (cfg.gasTopUpWei > 0n && cfg.operatorPkey) {
    try {
      fundedWei = await topUpGas(cfg, wallet.address, cfg.gasTopUpWei);
    } catch (error) {
      warning = (warning ? `${warning}；` : "") + `充值失败：${describe(error)}`;
    }
  }

  return { id, address: wallet.address, allowTxHash, fundedWei, warning };
}

/** 给用户地址打一点原生币当 gas（本地演示网用，主网应关掉）。 */
async function topUpGas(
  cfg: ReturnType<typeof readConfig>,
  address: `0x${string}`,
  wei: bigint,
): Promise<string> {
  const hash = await withAddressLock("operator", async () => {
    const operator = walletFor(requireOperator(cfg));
    return operator.sendTransaction({
      account: operator.account!,
      chain: operator.chain,
      to: address,
      value: wei,
    });
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return wei.toString();
}

export function describe(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) return `${error.message}（${cause.message.slice(0, 200)}）`;
    return error.message.slice(0, 300);
  }
  return String(error).slice(0, 300);
}
