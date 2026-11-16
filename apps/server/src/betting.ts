import { parseUnits, type Address } from "viem";
import { publicClient } from "./chain.ts";
import { ERC20_ABI, POOL_MARKET_ABI, sideFromLabel } from "./contracts.ts";
import { HttpError } from "./http.ts";
import { describe } from "./users.ts";
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
      await publicClient.readContract({
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
  const [token, enabled] = (await publicClient.readContract({
    address: cfg.market,
    abi: POOL_MARKET_ABI,
    functionName: "markets",
    args: [marketId],
  })) as readonly [Address, boolean];

  if (token === "0x0000000000000000000000000000000000000000") {
    throw new HttpError(503, `市场 ${marketId} 还没在链上配置代币`);
  }
  if (!enabled) throw new HttpError(409, `市场在链上已停用：${marketId}`);

  const open = (await publicClient.readContract({
    address: cfg.market,
    abi: POOL_MARKET_ABI,
    functionName: "isBettingOpen",
  })) as boolean;
  if (!open) throw new HttpError(409, "本轮已封盘，请等下一轮");

  const roundIndex = Number(
    (await publicClient.readContract({
      address: cfg.market,
      abi: POOL_MARKET_ABI,
      functionName: "currentRound",
    })) as bigint,
  );

  const balance = (await publicClient.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [user.address],
  })) as bigint;
  if (balance < amountWei) {
    throw new HttpError(
      400,
      `余额不足：需要 ${amountWei}，当前 ${balance}（可先调用 POST /api/faucet 领取）`,
    );
  }

  const pkey = decryptPrivateKey(user.enc_pkey);

  return withAddressLock(user.address, async () => {
    const wallet = walletFor(pkey);

    // 首次下注前补一次无限授权，之后不再重复。
    let approveTxHash: string | null = null;
    const allowance = (await publicClient.readContract({
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
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        markTxFailed(db, txId, "approve 回滚");
        throw new HttpError(502, "授权交易回滚");
      }
      markTxConfirmed(db, txId);
      approveTxHash = hash;
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
      receipt = await publicClient.waitForTransactionReceipt({ hash });
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

    return {
      txHash: hash,
      marketId,
      roundIndex,
      side,
      amountWei: amountWei.toString(),
      status: "confirmed" as const,
      approveTxHash,
    };
  });
}

/** 领体验币：用用户自己的地址发 mint（gas 也由用户地址出）。 */
export async function mintForUser(
  db: Db,
  address: string,
  betToken: string,
  amount: string,
): Promise<{ txHash: string; amountWei: string }> {
  const cfg = readConfig();

  const user = db
    .prepare("SELECT id, address, enc_pkey FROM users WHERE LOWER(address) = LOWER(?)")
    .get(address) as { id: number; address: Address; enc_pkey: string } | undefined;
  if (!user) throw new HttpError(404, `用户不存在：${address}`);

  const tokenRow = db
    .prepare(
      "SELECT token_address FROM markets WHERE bet_token = ? AND token_address IS NOT NULL LIMIT 1",
    )
    .get(betToken.toUpperCase()) as { token_address: string } | undefined;
  const tokenAddress = tokenRow?.token_address as Address | undefined;
  if (!tokenAddress) throw new HttpError(503, `代币 ${betToken} 还没有链上地址`);

  let amountWei: bigint;
  try {
    amountWei = parseUnits(amount, 18);
  } catch {
    throw new HttpError(400, `金额格式错误：${amount}`);
  }

  const pkey = decryptPrivateKey(user.enc_pkey);

  return withAddressLock(user.address, async () => {
    const wallet = walletFor(pkey);
    const hash = await wallet.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "mint",
      args: [amountWei],
      chain: wallet.chain,
      account: wallet.account!,
    });

    const txId = recordPendingTx(db, {
      userId: user.id,
      kind: "mint",
      txHash: hash,
      payload: { token: tokenAddress, amountWei: amountWei.toString() },
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      markTxFailed(db, txId, "mint 回滚");
      throw new HttpError(502, "领取交易回滚");
    }
    markTxConfirmed(db, txId);
    return { txHash: hash, amountWei: amountWei.toString() };
  });
}
