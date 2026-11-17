import { publicClientFor } from "./chain.ts";
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
import { currentEnv } from "./runtime.ts";

export interface CreatedUser {
  id: number;
  address: string;
  allowTxHash: string | null;
  fundedWei: string;
  warning?: string;
  /** true = 这个 X id 之前就建过号，直接复用原地址。 */
  reused?: boolean;
}

/** X 账号资料；handle 会变，每次登录刷新。 */
export interface XProfile {
  xUserId?: string;
  xHandle?: string;
  xName?: string;
}

/**
 * 建号：生成托管地址 → 私钥加密入库 → 合约白名单放过 →（可选）打一点原生 gas。
 * 用户不持有私钥，交易由后端用这个地址签名发起。
 */
export async function createUser(
  db: Db,
  creator?: string,
  profile: XProfile = {},
): Promise<CreatedUser> {
  const { xUserId, xHandle, xName } = profile;
  const known = xUserId
    ? (db
        .prepare("SELECT id, address FROM users WHERE env = ? AND x_user_id = ?")
        .get(currentEnv(), xUserId) as { id: number; address: string } | undefined)
    : undefined;
  if (known) {
    // 复用账号时顺手刷新 handle/昵称（X 上改名、改 handle 都能跟上）
    if (xHandle || xName) {
      db.prepare(
        "UPDATE users SET x_handle = COALESCE(?, x_handle), x_name = COALESCE(?, x_name) WHERE env = ? AND id = ?",
      ).run(xHandle ?? null, xName ?? null, currentEnv(), known.id);
    }
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
    .prepare("SELECT id, address FROM users WHERE env = ? AND address = ?")
    .get(currentEnv(), wallet.address) as { id: number; address: string } | undefined;
  if (existing) throw new HttpError(409, `该地址已存在：${existing.address}`);

  const result = db
    .prepare(
      "INSERT INTO users (env, email, address, enc_pkey, creator, created_at, x_user_id, x_handle, x_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      currentEnv(),
      email,
      wallet.address,
      wallet.encPkey,
      creator ?? null,
      Date.now(),
      xUserId ?? null,
      xHandle ?? null,
      xName ?? null,
    );
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
      const receipt = await publicClientFor().waitForTransactionReceipt({ hash });
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
  await publicClientFor().waitForTransactionReceipt({ hash });
  return wei.toString();
}

/**
 * 用户地址余额不足以付 gas 时自动补一点。
 *
 * 主要给本地 Anvil 重启后复用旧数据库里的托管地址用：建号时充过 gas 的地址，
 * 在新链上余额是 0，首次 mint / 下注会报 Insufficient funds。
 */
export async function ensureUserGas(
  cfg: ReturnType<typeof readConfig>,
  address: `0x${string}`,
): Promise<string | null> {
  if (cfg.gasTopUpWei <= 0n || !cfg.operatorPkey) return null;
  const balance = await publicClientFor().getBalance({ address });
  if (balance >= cfg.gasTopUpWei / 4n) return null;
  return topUpGas(cfg, address, cfg.gasTopUpWei);
}

export function describe(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) return `${error.message}（${cause.message.slice(0, 200)}）`;
    return error.message.slice(0, 300);
  }
  return String(error).slice(0, 300);
}
