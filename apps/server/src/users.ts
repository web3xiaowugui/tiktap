import { publicClientFor } from "./chain.ts";
import { allowUserOnChain } from "./market-sync.ts";
import { ERC20_ABI } from "./contracts.ts";
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
import { createCustodialWallet, decryptPrivateKey } from "./wallet.ts";
import type { Db } from "./db.ts";

const MAX_UINT256 = 2n ** 256n - 1n;

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
        .prepare("SELECT id, address, enc_pkey FROM users WHERE x_user_id = ?")
        .get(xUserId) as { id: number; address: string; enc_pkey: string } | undefined)
    : undefined;
  if (known) {
    // 复用账号时顺手刷新 handle/昵称（X 上改名、改 handle 都能跟上）
    if (xHandle || xName) {
      db.prepare(
        "UPDATE users SET x_handle = COALESCE(?, x_handle), x_name = COALESCE(?, x_name) WHERE id = ?",
      ).run(xHandle ?? null, xName ?? null, known.id);
    }
    let warning: string | undefined;
    try {
      const cfg = readConfig();
      await ensureUserOnChain(db, cfg, known.id, known.address as `0x${string}`);
      // 切到新环境后顺手把该链的代币额度全部开好，之后下注直接发 bet。
      await ensureApprovals(db, cfg, known.id, known.address as `0x${string}`, known.enc_pkey);
    } catch (error) {
      warning = `当前环境白名单/gas/授权未就绪：${describe(error)}`;
    }
    return {
      id: known.id,
      address: known.address,
      allowTxHash: null,
      fundedWei: "0",
      warning,
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
      "INSERT INTO users (email, address, enc_pkey, creator, created_at, x_user_id, x_handle, x_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
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

  try {
    await ensureApprovals(db, cfg, id, wallet.address, wallet.encPkey);
  } catch (error) {
    warning = (warning ? `${warning}；` : "") + `代币授权未完成：${describe(error)}`;
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
  // 公共 RPC 有时回执先返回、余额查询还看不到（X Layer testnet 尤其明显）。
  // 这里等到账真的可见再返回，否则紧接着的 approve / mint 的 estimateGas
  // 会读到余额 0 直接报 "gas required exceeds allowance (0)"。
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const balance = await publicClientFor().getBalance({ address });
    if (balance >= wei) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
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

/**
 * 同一个地址第一次在某个环境使用时，补该环境的白名单和 gas。
 * 身份全局复用，但每条链的权限/余额是独立的。
 */
export async function ensureUserOnChain(
  db: Db,
  cfg: ReturnType<typeof readConfig>,
  userId: number,
  address: `0x${string}`,
): Promise<void> {
  if (!cfg.market || !cfg.operatorPkey) {
    throw new Error("未配置 POOL_MARKET_ADDRESS / OPERATOR_PKEY");
  }
  const hash = await allowUserOnChain(cfg, address);
  if (hash !== "0x0") {
    const txId = recordPendingTx(db, {
      userId,
      kind: "setAllowed",
      txHash: hash,
      payload: { address },
    });
    const receipt = await publicClientFor().waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      markTxFailed(db, txId, "白名单交易回滚");
      throw new Error("白名单交易回滚");
    }
    markTxConfirmed(db, txId);
  }
  await ensureUserGas(cfg, address);
}

/**
 * 提前把所有下注代币的授权开到无限，下注时就不用再等一笔 approve。
 * 建号和领币之后各做一次；已经有无限额度的代币只读一次 allowance。
 */
export async function ensureApprovals(
  db: Db,
  cfg: ReturnType<typeof readConfig>,
  userId: number,
  address: `0x${string}`,
  encPkey: string,
): Promise<void> {
  const market = cfg.market;
  if (!market) return;

  const rows = db
    .prepare(
      "SELECT DISTINCT token_address FROM markets WHERE env = ? AND enabled = 1 AND token_address IS NOT NULL",
    )
    .all(cfg.env) as Array<{ token_address: string }>;
  if (rows.length === 0) return;

  const wallet = walletFor(decryptPrivateKey(encPkey));
  for (const row of rows) {
    const token = row.token_address as `0x${string}`;
    const allowance = (await publicClientFor().readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [address, market],
    })) as bigint;
    if (allowance >= MAX_UINT256 / 2n) continue;

    // 和用户自己的其他交易共用地址锁，避免下一笔 approve 撞 nonce。
    const hash = await withAddressLock(address, () =>
      wallet.writeContract({
        address: token,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [market, MAX_UINT256],
        chain: wallet.chain,
        account: wallet.account!,
      }),
    );
    const txId = recordPendingTx(db, {
      userId,
      kind: "approve",
      txHash: hash,
      payload: { token, spender: market },
    });
    const receipt = await publicClientFor().waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      markTxFailed(db, txId, "approve 回滚");
      throw new Error(`approve 回滚：${token}`);
    }
    markTxConfirmed(db, txId);
  }
}

export function describe(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) return `${error.message}（${cause.message.slice(0, 200)}）`;
    return error.message.slice(0, 300);
  }
  return String(error).slice(0, 300);
}
