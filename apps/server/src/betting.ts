import { parseUnits, type Address } from "viem";
import { publicClientFor } from "./chain.ts";
import { ERC20_ABI, POOL_MARKET_ABI, TEST_TOKEN_ABI, WOKB_ABI, sideFromLabel } from "./contracts.ts";
import { HttpError } from "./http.ts";
import { describe, ensureApprovals, ensureUserGas, ensureUserOnChain } from "./users.ts";
import {
  markTxConfirmed,
  markTxFailed,
  readConfig,
  recordPendingTx,
  walletFor,
  withAddressLock,
} from "./tx.ts";
import { findMarket } from "./markets.ts";
import { decryptPrivateKey } from "./wallet.ts";
import { recordBet } from "./bets.ts";
import type { Db } from "./db.ts";
import { currentEnv } from "./runtime.ts";

export interface BetInput {
  address: string;
  market: string;
  betToken: string;
  side: string;
  amount: string;
}

export interface BetResult {
  txHash: string;
  marketId: number;
  roundIndex: number;
  side: number;
  amountWei: string;
  status: "confirmed";
  approveTxHash: string | null;
}

const MAX_UINT256 = 2n ** 256n - 1n;

/** 读该市场当前的下注费率（bps）。老合约没有这个 view 时按 0 处理。 */
async function readBetFeeBps(market: Address, marketId: number): Promise<number> {
  try {
    return Number(
      await publicClientFor().readContract({
        address: market,
        abi: POOL_MARKET_ABI,
        functionName: "betFeeBps",
        args: [marketId],
      }),
    );
  } catch {
    return 0;
  }
}

/**
 * 下注：校验 → 必要时补授权 → 用用户托管私钥发 bet → txHash 落库 → 查 receipt 回填状态。
 * 所有写操作都串行到同一个地址，避免 nonce 相撞。
 */
export async function placeBet(db: Db, input: BetInput): Promise<BetResult> {
  const cfg = readConfig();
  if (!cfg.market) throw new HttpError(503, "未配置 POOL_MARKET_ADDRESS");

  const user = db
    .prepare("SELECT id, address, enc_pkey FROM users WHERE LOWER(address) = LOWER(?)")
    .get(input.address) as { id: number; address: Address; enc_pkey: string } | undefined;
  if (!user) throw new HttpError(404, `用户不存在：${input.address}，先调用 POST /api/users 建号`);

  const marketRow = findMarket(db, input.market.toUpperCase(), input.betToken.toUpperCase());
  if (!marketRow) throw new HttpError(404, `未知市场：${input.market}/${input.betToken}`);
  if (marketRow.enabled !== 1) throw new HttpError(409, `市场已下线：${input.market}/${input.betToken}`);

  let side: number;
  try {
    side = sideFromLabel(input.side);
  } catch (error) {
    throw new HttpError(400, describe(error));
  }

  let amountWei: bigint;
  try {
    amountWei = parseUnits(input.amount, 18);
  } catch {
    throw new HttpError(400, `金额格式错误：${input.amount}`);
  }
  if (amountWei <= 0n) throw new HttpError(400, "金额必须大于 0");

  const marketId = marketRow.market_id;
  const [token, enabled] = (await publicClientFor().readContract({
    address: cfg.market,
    abi: POOL_MARKET_ABI,
    functionName: "markets",
    args: [marketId],
  })) as readonly [Address, boolean];

  if (token === "0x0000000000000000000000000000000000000000") {
    throw new HttpError(503, `市场 ${marketId} 还没在链上配置代币`);
  }
  if (!enabled) throw new HttpError(409, `市场在链上已停用：${marketId}`);

  const open = (await publicClientFor().readContract({
    address: cfg.market,
    abi: POOL_MARKET_ABI,
    functionName: "isBettingOpen",
  })) as boolean;
  if (!open) throw new HttpError(409, "本轮已封盘，请等下一轮");

  const roundIndex = Number(
    (await publicClientFor().readContract({
      address: cfg.market,
      abi: POOL_MARKET_ABI,
      functionName: "currentRound",
    })) as bigint,
  );

  const balance = (await publicClientFor().readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [user.address],
  })) as bigint;

  // OKB 市场用 WOKB 作为 ERC20 载体：余额不够的部分由用户原生 OKB 现场 wrap。
  const isOkb = marketRow.bet_token.toUpperCase() === "OKB";
  const wrapWei = isOkb && balance < amountWei ? amountWei - balance : 0n;

  if (!isOkb && balance < amountWei) {
    throw new HttpError(
      400,
      `余额不足：需要 ${amountWei}，当前 ${balance}（可先调用 POST /api/faucet 领取）`,
    );
  }

  const pkey = decryptPrivateKey(user.enc_pkey);

  // 账号是全局身份：首次在某条链上下注时，先补该链的白名单和 gas。
  await ensureUserOnChain(db, cfg, user.id, user.address);

  return withAddressLock(user.address, async () => {
    const wallet = walletFor(pkey);

    const unwrapAllWokb = async (reason: string) => {
      if (!isOkb) return;
      const balance = (await publicClientFor().readContract({
        address: token,
        abi: WOKB_ABI,
        functionName: "balanceOf",
        args: [user.address],
      })) as bigint;
      if (balance <= 0n) return;
      const hash = await wallet.writeContract({
        address: token,
        abi: WOKB_ABI,
        functionName: "withdraw",
        args: [balance],
        chain: wallet.chain,
        account: wallet.account!,
      });
      const txId = recordPendingTx(db, {
        userId: user.id,
        kind: "unwrap",
        txHash: hash,
        payload: { token, amountWei: balance.toString(), reason },
      });
      const receipt = await publicClientFor().waitForTransactionReceipt({ hash });
      if (receipt.status === "success") {
        markTxConfirmed(db, txId);
      } else {
        markTxFailed(db, txId, `${reason} unwrap 回滚`);
      }
    };

    if (isOkb && wrapWei > 0n) {
      const nativeBalance = await publicClientFor().getBalance({ address: user.address });
      if (nativeBalance < wrapWei) {
        throw new HttpError(
          400,
          `原生 OKB 不足：需要 wrap ${wrapWei}，当前 ${nativeBalance}`,
        );
      }
      const hash = await wallet.writeContract({
        address: token,
        abi: WOKB_ABI,
        functionName: "deposit",
        value: wrapWei,
        chain: wallet.chain,
        account: wallet.account!,
      });
      const txId = recordPendingTx(db, {
        userId: user.id,
        kind: "wrap",
        txHash: hash,
        payload: { token, amountWei: wrapWei.toString() },
      });
      const receipt = await publicClientFor().waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        markTxFailed(db, txId, "wrap 回滚");
        throw new HttpError(502, "WOKB wrap 回滚");
      }
      markTxConfirmed(db, txId);
    }

    try {
      // 首次下注前补一次无限授权，之后不再重复。
    let approveTxHash: string | null = null;
    const allowance = (await publicClientFor().readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [user.address, cfg.market!],
    })) as bigint;

    if (allowance < amountWei) {
      const hash = await wallet.writeContract({
        address: token,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [cfg.market!, MAX_UINT256],
        chain: wallet.chain,
        account: wallet.account!,
      });
      const txId = recordPendingTx(db, {
        userId: user.id,
        kind: "approve",
        txHash: hash,
        payload: { token, spender: cfg.market },
      });
      const receipt = await publicClientFor().waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        markTxFailed(db, txId, "approve 回滚");
        throw new HttpError(502, "授权交易回滚");
      }
      markTxConfirmed(db, txId);
      approveTxHash = hash;

      // 公共 RPC 的 receipt 返回后状态可能还会慢半拍，确认 allowance 真可见再下注。
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const fresh = (await publicClientFor().readContract({
          address: token,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [user.address, cfg.market!],
        })) as bigint;
        if (fresh >= amountWei) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // 合约按下注金额收手续费；这里按同一份费率算净仓位，结算 payout 用净额。
    const feeBps = await readBetFeeBps(cfg.market!, marketId);
    const feeWei = feeBps > 0 ? (amountWei * BigInt(feeBps)) / 10_000n : 0n;

    const hash = await wallet.writeContract({
      address: cfg.market!,
      abi: POOL_MARKET_ABI,
      functionName: "bet",
      args: [marketId, side, amountWei],
      chain: wallet.chain,
      account: wallet.account!,
    });

    const txId = recordPendingTx(db, {
      userId: user.id,
      kind: "bet",
      txHash: hash,
      payload: { marketId, roundIndex, side, amountWei: amountWei.toString() },
    });

    let receipt;
    try {
      receipt = await publicClientFor().waitForTransactionReceipt({ hash });
    } catch (error) {
      markTxFailed(db, txId, describe(error));
      throw new HttpError(502, `交易确认失败：${describe(error)}`);
    }

    if (receipt.status !== "success") {
      markTxFailed(db, txId, "bet 回滚");
      throw new HttpError(409, "下注交易被合约回滚（可能已封盘或余额不足）");
    }

    markTxConfirmed(db, txId);

    recordBet(db, {
      userId: user.id,
      address: user.address,
      marketId,
      symbol: marketRow.symbol,
      betToken: marketRow.bet_token,
      roundId: roundIndex,
      side,
      amountWei: amountWei.toString(),
      feeWei: feeWei.toString(),
      txHash: hash,
      status: "confirmed",
    });

    // 成功下注后如果 WOKB 还有剩余（例如用了历史余额），立刻赎回，保持内部载体归零。
    if (isOkb) {
      try {
        await unwrapAllWokb("bet_success_leftover");
      } catch (cleanupError) {
        console.warn("[bet] 下注成功后 WOKB 清理失败：", describe(cleanupError));
      }
    }

    return {
      txHash: hash,
      marketId,
      roundIndex,
      side,
      amountWei: amountWei.toString(),
      status: "confirmed" as const,
      approveTxHash,
    };
    } catch (error) {
      if (isOkb) {
        try {
          await unwrapAllWokb("bet_failed");
        } catch (cleanupError) {
          console.warn("[bet] 下注失败后 WOKB 自动赎回失败：", describe(cleanupError));
        }
      }
      throw error;
    }
  });
}

/**
 * 领取统计：只算「当前这枚 TEST」上 confirmed 的 mint 记录。
 * 新版 TEST 不限量，这个数字只用于弹框展示「累计已领」。
 */
export function readMintedAmount(
  db: Db,
  userId: number,
  tokenAddress?: string,
): number {
  const rows = db
    .prepare(
      "SELECT payload FROM txs WHERE env = ? AND user_id = ? AND kind = 'mint' AND status = 'confirmed'",
    )
    .all(currentEnv(), userId) as Array<{ payload: string | null }>;

  let claimedWei = 0n;
  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload ?? "{}") as { amountWei?: string; token?: string };
      if (!payload.amountWei) continue;
      if (
        tokenAddress &&
        payload.token &&
        payload.token.toLowerCase() !== tokenAddress.toLowerCase()
      ) {
        continue;
      }
      claimedWei += BigInt(payload.amountWei);
    } catch {
      // 忽略坏掉的 payload
    }
  }

  return Number(claimedWei / 10n ** 18n);
}

/** 领体验币：只允许 TEST，用用户自己的地址发 mint。 */
export async function mintForUser(
  db: Db,
  address: string,
  betToken: string,
  amount: string,
): Promise<{ txHash: string; amountWei: string }> {
  const cfg = readConfig();
  if (betToken.trim().toUpperCase() !== "TEST") {
    throw new HttpError(400, "领测试币只发 TEST");
  }

  const user = db
    .prepare("SELECT id, address, enc_pkey FROM users WHERE LOWER(address) = LOWER(?)")
    .get(address) as { id: number; address: Address; enc_pkey: string } | undefined;
  if (!user) throw new HttpError(404, `用户不存在：${address}`);

  const tokenRow = db
    .prepare(
      "SELECT token_address FROM markets WHERE env = ? AND bet_token = ? AND token_address IS NOT NULL LIMIT 1",
    )
    .get(currentEnv(), betToken.toUpperCase()) as { token_address: string } | undefined;
  const tokenAddress = tokenRow?.token_address as Address | undefined;
  if (!tokenAddress) throw new HttpError(503, `代币 ${betToken} 还没有链上地址`);

  let amountWei: bigint;
  try {
    amountWei = parseUnits(amount, 18);
  } catch {
    throw new HttpError(400, `金额格式错误：${amount}`);
  }

  // 新版 TEST 只有 operator（minter）能铸，而且可以铸给任意地址，
  // 所以这里用 operator 签名，不再用用户自己的钱包发交易。
  if (!cfg.operatorPkey) throw new HttpError(503, "未配置 OPERATOR_PKEY");
  const minterPkey = cfg.operatorPkey;

  await ensureUserGas(cfg, user.address);

  const minted = await withAddressLock(user.address, async () => {
    const wallet = walletFor(minterPkey);

    // 先记下领之前的余额，领完确认链上真的加上了再返回
    const beforeBalance = (await publicClientFor().readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [user.address],
    })) as bigint;

    const hash = await wallet.writeContract({
      address: tokenAddress,
      abi: TEST_TOKEN_ABI,
      functionName: "mint",
      args: [user.address, amountWei],
      chain: wallet.chain,
      account: wallet.account!,
    });

    const txId = recordPendingTx(db, {
      userId: user.id,
      kind: "mint",
      txHash: hash,
      payload: { token: tokenAddress, amountWei: amountWei.toString() },
    });

    const receipt = await publicClientFor().waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      markTxFailed(db, txId, "mint 回滚");
      throw new HttpError(502, "领取交易回滚");
    }
    markTxConfirmed(db, txId);

    // 公共 RPC 的 eth_call 状态可能慢 receipt 一两秒：轮询到余额可见再返回，
    // 前端领完立刻刷新就不会拿到旧余额。
    const expected = beforeBalance + amountWei;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const current = (await publicClientFor().readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [user.address],
      })) as bigint;
      if (current >= expected) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return { txHash: hash, amountWei: amountWei.toString() };
  });

  // 领币后顺手把这条链所有下注代币的额度开好，下注路径就不用再 approve。
  try {
    await ensureApprovals(db, cfg, user.id, user.address, user.enc_pkey);
  } catch (error) {
    console.warn("[faucet] 自动授权失败：", describe(error));
  }

  return minted;
}
