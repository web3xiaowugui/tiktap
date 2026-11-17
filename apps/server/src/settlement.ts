import { type Address } from "viem";
import { publicClientFor } from "./chain.ts";
import { POOL_MARKET_ABI, SIDE_DOWN, SIDE_UP, SIDE_VOID, sideFromLabel } from "./contracts.ts";
import { HttpError } from "./http.ts";
import { listMarkets } from "./markets.ts";
import {
  markTxConfirmed,
  markTxFailed,
  readConfig,
  recordPendingTx,
  requireOperator,
  requireMarket,
  walletFor,
  withAddressLock,
  type ChainConfig,
} from "./tx.ts";
import { decryptPrivateKey } from "./wallet.ts";
import { describe } from "./users.ts";
import { ensureRoundPrices, getRoundPrice } from "./round-prices.ts";
import { applyClaim, applySettlement } from "./bets.ts";
import type { Db } from "./db.ts";
import { currentEnv, runWithEnv } from "./runtime.ts";

export interface RoundInfo {
  blockNumber: number;
  currentRound: number;
  isBettingOpen: boolean;
  roundStartBlock: number;
  roundEndBlock: number;
  blocksLeftInWindow: number;
}

/** 读结算时快照下来的领奖费率；老合约没有这个 getter 时按 0 处理。 */
async function readRoundClaimFeeBps(
  market: Address,
  marketId: number,
  roundIndex: number,
): Promise<number> {
  try {
    return Number(
      await publicClientFor().readContract({
        address: market,
        abi: POOL_MARKET_ABI,
        functionName: "roundClaimFeeBps",
        args: [BigInt(roundIndex), marketId],
      }),
    );
  } catch {
    return 0;
  }
}

export async function getRoundInfo(cfg: ChainConfig): Promise<RoundInfo> {
  const market = requireMarket(cfg);
  const blockNumber = Number(await publicClientFor().getBlockNumber());
  const currentRound = Number(
    (await publicClientFor().readContract({
      address: market,
      abi: POOL_MARKET_ABI,
      functionName: "currentRound",
    })) as bigint,
  );
  const isBettingOpen = (await publicClientFor().readContract({
    address: market,
    abi: POOL_MARKET_ABI,
    functionName: "isBettingOpen",
  })) as boolean;
  const roundStartBlock = Number(
    (await publicClientFor().readContract({
      address: market,
      abi: POOL_MARKET_ABI,
      functionName: "roundStart",
      args: [BigInt(currentRound)],
    })) as bigint,
  );
  const roundEndBlock = roundStartBlock + 600;

  return {
    blockNumber,
    currentRound,
    isBettingOpen,
    roundStartBlock,
    roundEndBlock,
    blocksLeftInWindow: Math.max(0, roundStartBlock + 300 - blockNumber),
  };
}

export function winnerFromLabel(label: string): number {
  if (label.toLowerCase() === "void") return SIDE_VOID;
  try {
    return sideFromLabel(label);
  } catch {
    throw new HttpError(400, `未知结算结果：${label}（可选 long / short / void）`);
  }
}

/**
 * 这一轮的锁定价格（开始价）和开奖价格（结束价）从 round_prices 读；
 * 还没写入时才向 OKX 拉一次并落库。涨跌 = 开奖价 >= 锁定价。
 */
export async function priceWinner(
  db: Db,
  cfg: ChainConfig,
  symbol: string,
  roundIndex: number,
): Promise<{
  winner: number;
  lockPrice: number;
  settlePrice: number;
  startPrice: number;
  endPrice: number;
  startTime: number;
  endTime: number;
}> {
  const row = await ensureRoundPrices(db, cfg, symbol, roundIndex);
  if (row.lockPrice == null || row.settlePrice == null) {
    throw new HttpError(502, `第 ${roundIndex} 轮价格还没齐（锁定价 / 开奖价）`);
  }

  return {
    winner: row.settlePrice >= row.lockPrice ? SIDE_UP : SIDE_DOWN,
    lockPrice: row.lockPrice,
    settlePrice: row.settlePrice,
    startPrice: row.lockPrice,
    endPrice: row.settlePrice,
    startTime: row.lockTime ?? 0,
    endTime: row.settleTime ?? 0,
  };
}
export interface SettleResult {
  marketId: number;
  symbol: string;
  betToken: string;
  roundIndex: number;
  winner: number;
  upAmount: string;
  downAmount: string;
  txHash: string | null;
  skipped?: string;
}

/** 结算单个市场某一轮。 */
export async function settleMarket(
  db: Db,
  cfg: ChainConfig,
  marketId: number,
  roundIndex: number,
  winner: number,
  prices?: { lockPrice?: number | null; settlePrice?: number | null },
): Promise<SettleResult> {
  const market = requireMarket(cfg);
  const row = listMarkets(db).find((item) => item.market_id === marketId);
  if (!row) throw new HttpError(404, `未知 marketId：${marketId}`);

  const [upAmount, downAmount, , settled] = (await publicClientFor().readContract({
    address: market,
    abi: POOL_MARKET_ABI,
    functionName: "pools",
    args: [BigInt(roundIndex), marketId],
  })) as readonly [bigint, bigint, number, boolean];

  if (settled) throw new HttpError(409, `marketId ${marketId} 第 ${roundIndex} 轮已经结算过了`);
  if (upAmount + downAmount === 0n) {
    return {
      marketId,
      symbol: row.symbol,
      betToken: row.bet_token,
      roundIndex,
      winner,
      upAmount: upAmount.toString(),
      downAmount: downAmount.toString(),
      txHash: null,
      skipped: "本轮没有下注，不需要结算（发交易也是空转）",
    };
  }

  const hash = await withAddressLock("operator", async () => {
    const operator = walletFor(requireOperator(cfg));
    return operator.writeContract({
      address: market,
      abi: POOL_MARKET_ABI,
      functionName: "settle",
      args: [marketId, BigInt(roundIndex), winner],
      chain: operator.chain,
      account: operator.account!,
    });
  });

  const txId = recordPendingTx(db, {
    userId: null,
    kind: "settle",
    txHash: hash,
    payload: { marketId, roundIndex, winner },
  });

  const receipt = await publicClientFor().waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    markTxFailed(db, txId, "settle 回滚");
    throw new HttpError(502, `结算交易回滚：marketId ${marketId} round ${roundIndex}`);
  }
  markTxConfirmed(db, txId);

  applySettlement(db, marketId, roundIndex, {
    winnerSide: winner,
    lockPrice: prices?.lockPrice ?? null,
    settlePrice: prices?.settlePrice ?? null,
    upWei: upAmount.toString(),
    downWei: downAmount.toString(),
    claimFeeBps: await readRoundClaimFeeBps(market, marketId, roundIndex),
  });

  // 结算完直接替用户代领（托管模式，用户不用自己点）
  if (process.env.AUTO_CLAIM !== "0") {
    await claimRoundForUsers(db, cfg, marketId, roundIndex);
  }

  return {
    marketId,
    symbol: row.symbol,
    betToken: row.bet_token,
    roundIndex,
    winner,
    upAmount: upAmount.toString(),
    downAmount: downAmount.toString(),
    txHash: hash,
  };
}

/**
 * 结算一整轮：每个「标的」判一次涨跌（同一标的的不同下注代币共用同一个结果），
 * 只对真正有下注的市场发交易。
 */
export async function settleRound(
  db: Db,
  cfg: ChainConfig,
  roundIndex: number,
  explicitWinners?: Record<string, string>,
): Promise<{ roundIndex: number; markets: SettleResult[]; prices: Record<string, unknown> }> {
  const market = requireMarket(cfg);
  const pools: SettleResult[] = [];
  const prices: Record<string, unknown> = {};

  const symbols = [...new Set(listMarkets(db).map((row) => row.symbol))];

  for (const symbol of symbols) {
    let winner: number;
    let roundPrices: { lockPrice?: number | null; settlePrice?: number | null } | undefined;
    if (explicitWinners?.[symbol]) {
      winner = winnerFromLabel(explicitWinners[symbol]);
    } else {
      try {
        const price = await priceWinner(db, cfg, symbol, roundIndex);
        winner = price.winner;
        roundPrices = { lockPrice: price.lockPrice, settlePrice: price.settlePrice };
        prices[symbol] = price;
      } catch (error) {
        // 只给了部分标的的显式结果时，其余标的拿不到价格就跳过，绝不瞎猜。
        prices[symbol] = { error: describe(error) };
        continue;
      }
    }

    for (const row of listMarkets(db).filter((item) => item.symbol === symbol)) {
      const result = await settleMarket(db, cfg, row.market_id, roundIndex, winner, roundPrices);
      pools.push(result);
    }
  }

  void market;
  return { roundIndex, markets: pools, prices };
}

export interface ClaimResult {
  txHash: string;
  marketId: number;
  roundIndex: number;
  amountWei: string;
}

/** 用户领奖：合约算好份额，后端只用用户托管私钥发 claim。 */
export async function claimForUser(
  db: Db,
  cfg: ChainConfig,
  address: string,
  marketId: number,
  roundIndex: number,
): Promise<ClaimResult> {
  const market = requireMarket(cfg);

  const user = db
    .prepare("SELECT id, address, enc_pkey FROM users WHERE env = ? AND LOWER(address) = LOWER(?)")
    .get(currentEnv(), address) as { id: number; address: Address; enc_pkey: string } | undefined;
  if (!user) throw new HttpError(404, `用户不存在：${address}`);

  const [, , , settled] = (await publicClientFor().readContract({
    address: market,
    abi: POOL_MARKET_ABI,
    functionName: "pools",
    args: [BigInt(roundIndex), marketId],
  })) as readonly [bigint, bigint, number, boolean];
  if (!settled) throw new HttpError(409, `第 ${roundIndex} 轮还没结算`);

  const alreadyClaimed = (await publicClientFor().readContract({
    address: market,
    abi: POOL_MARKET_ABI,
    functionName: "claimed",
    args: [BigInt(roundIndex), marketId, user.address],
  })) as boolean;
  if (alreadyClaimed) throw new HttpError(409, `第 ${roundIndex} 轮已经领过了（每轮只能领一次）`);

  const amountWei = (await publicClientFor().readContract({
    address: market,
    abi: POOL_MARKET_ABI,
    functionName: "previewClaim",
    args: [marketId, BigInt(roundIndex), user.address],
  })) as bigint;
  if (amountWei === 0n) throw new HttpError(400, "这一轮没有可领取的奖励");

  const row = listMarkets(db).find((item) => item.market_id === marketId);
  if (!row) throw new HttpError(404, `未知 marketId：${marketId}`);

  const pkey = decryptPrivateKey(user.enc_pkey);

  return withAddressLock(user.address, async () => {
    const wallet = walletFor(pkey);
    const hash = await wallet.writeContract({
      address: market,
      abi: POOL_MARKET_ABI,
      functionName: "claim",
      args: [marketId, BigInt(roundIndex)],
      chain: wallet.chain,
      account: wallet.account!,
    });

    const txId = recordPendingTx(db, {
      userId: user.id,
      kind: "claim",
      txHash: hash,
      payload: { marketId, roundIndex, amountWei: amountWei.toString() },
    });

    const receipt = await publicClientFor().waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      markTxFailed(db, txId, "claim 回滚");
      throw new HttpError(502, "领取交易回滚");
    }
    markTxConfirmed(db, txId);

    applyClaim(db, marketId, roundIndex, user.address, hash);

    return { txHash: hash, marketId, roundIndex, amountWei: amountWei.toString() };
  });
}

/** 轮询式自动结算：只处理「已经结束、有下注、还没结算」的轮次，拿不到价格就跳过。 */
export function startAutoSettler(
  db: Db,
  cfg: ChainConfig,
  intervalMs = 3_000,
  env = currentEnv(),
): void {
  let busy = false;
  /** 每个 (标的, 轮次) 最多 30s 试一次行情，避免每 3s 打一次接口。 */
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const info = await getRoundInfo(cfg);

      // 先把「当前轮」的锁定价格写下来（轮首那根 1m K 线收盘后就能写）
      const symbols = [...new Set(listMarkets(db).map((row) => row.symbol))];
      const priceAttempts = new Map<string, number>();
      const recentRounds = [
        info.currentRound,
        info.currentRound - 1,
        info.currentRound - 2,
        info.currentRound - 3,
      ].filter((round) => round >= 0);
      for (const symbol of symbols) {
        for (const roundIndex of recentRounds) {
          const key = `${symbol}:${roundIndex}`;
          if ((priceAttempts.get(key) ?? 0) + 30_000 > Date.now()) continue;
          priceAttempts.set(key, Date.now());
          try {
            // 当前轮只补锁定价；最近 3 轮补上开奖价，保证已开奖轮次 K 线有价格线
            await ensureRoundPrices(db, cfg, symbol, roundIndex);
          } catch {
            // 行情还没覆盖那一分钟就跳过，之后 tick 再补
          }
        }
      }

      const finishedRounds = [info.currentRound - 2, info.currentRound - 3].filter((r) => r >= 0);

      for (const roundIndex of finishedRounds) {
        const unsettled = await marketsWithUnsettledBets(db, cfg, roundIndex);

        if (unsettled.length > 0) {
          const result = await settleRound(db, cfg, roundIndex);
          const sent = result.markets.filter((item) => item.txHash);
          if (sent.length > 0) {
            console.log(
              `[settle] round ${roundIndex} 结算 ${sent.length} 个市场：` +
                sent.map((item) => `${item.symbol}/${item.betToken}=${item.winner === 0 ? "long" : "short"}`).join(", "),
            );
          }
        }

        // 兜底：不管这轮是刚结算的还是早结算过但有人没领到，都在这里补领一次
        if (process.env.AUTO_CLAIM !== "0") {
          for (const row of listMarkets(db)) {
            const again = await claimRoundForUsers(db, cfg, row.market_id, roundIndex);
            if (again.claimed > 0) {
              console.log(
                `[claim] round ${roundIndex} market ${row.market_id} 自动代领 ${again.claimed} 个地址`,
              );
            }
          }
        }
      }
    } catch (error) {
      console.warn("[settle] 自动结算跳过：", describe(error));
    } finally {
      busy = false;
    }
  };

  setInterval(() => void runWithEnv(env, tick), intervalMs);
  console.log(`[settle] 自动结算已启动（${env}，每 ${intervalMs / 1000}s 检查一次，RPC ${cfg.rpcUrl}）`);
}

export async function marketsWithUnsettledBets(
  db: Db,
  cfg: ChainConfig,
  roundIndex: number,
): Promise<number[]> {
  const market = requireMarket(cfg);
  const result: number[] = [];
  for (const row of listMarkets(db)) {
    const [upAmount, downAmount, , settled] = (await publicClientFor().readContract({
      address: market,
      abi: POOL_MARKET_ABI,
      functionName: "pools",
      args: [BigInt(roundIndex), row.market_id],
    })) as readonly [bigint, bigint, number, boolean];
    if (!settled && upAmount + downAmount > 0n) result.push(row.market_id);
  }
  return result;
}
/**
 * 启动时补齐历史下注结果：这一轮链上已经结算、但 bets 里还没有结果的，
 * 从合约读两边总额和 winner，用 round_prices 里的价格回填（幂等）。
 */
export async function backfillBetResults(db: Db, cfg: ChainConfig): Promise<number> {
  const market = requireMarket(cfg);
  const groups = db
    .prepare(
      "SELECT DISTINCT market_id, round_id, symbol FROM bets WHERE env = ? AND winner_side IS NULL",
    )
    .all(currentEnv()) as Array<{ market_id: number; round_id: number; symbol: string }>;

  let filled = 0;
  for (const group of groups) {
    const [upAmount, downAmount, winner, settled] = (await publicClientFor().readContract({
      address: market,
      abi: POOL_MARKET_ABI,
      functionName: "pools",
      args: [BigInt(group.round_id), group.market_id],
    })) as readonly [bigint, bigint, number, boolean];
    if (!settled) continue;

    const price = getRoundPrice(db, group.symbol, group.round_id);
    applySettlement(db, group.market_id, group.round_id, {
      winnerSide: Number(winner),
      lockPrice: price?.lockPrice ?? null,
      settlePrice: price?.settlePrice ?? null,
      upWei: upAmount.toString(),
      downWei: downAmount.toString(),
      claimFeeBps: await readRoundClaimFeeBps(market, group.market_id, group.round_id),
    });
    filled += 1;
  }
  return filled;
}
/** 自动领奖：结算后由后端用用户托管私钥代领，用户不用点。 */
const claimAttempts = new Map<string, number>();

export async function claimRoundForUsers(
  db: Db,
  cfg: ChainConfig,
  marketId: number,
  roundIndex: number,
): Promise<{ claimed: number; failed: number }> {
  const rows = db
    .prepare(
      "SELECT DISTINCT address FROM bets " +
        "WHERE env = ? AND market_id = ? AND round_id = ? AND claimed_at IS NULL " +
        "AND payout_wei IS NOT NULL AND payout_wei != '0'",
    )
    .all(currentEnv(), marketId, roundIndex) as Array<{ address: string }>;

  let claimed = 0;
  let failed = 0;

  for (const row of rows) {
    const key = `${marketId}:${roundIndex}:${row.address}`;
    if ((claimAttempts.get(key) ?? 0) + 60_000 > Date.now()) continue;
    claimAttempts.set(key, Date.now());

    try {
      await claimForUser(db, cfg, row.address, marketId, roundIndex);
      claimed += 1;
    } catch (error) {
      failed += 1;
      console.warn(
        `[claim] ${row.address} 第 ${roundIndex} 轮 market ${marketId} 代领失败：`,
        describe(error),
      );
    }
  }

  return { claimed, failed };
}
