import { type Address } from "viem";
import { publicClient, RPC_URL } from "./chain.ts";
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
import type { Db } from "./db.ts";

export interface RoundInfo {
  blockNumber: number;
  currentRound: number;
  isBettingOpen: boolean;
  roundStartBlock: number;
  roundEndBlock: number;
  blocksLeftInWindow: number;
}

export async function getRoundInfo(cfg: ChainConfig): Promise<RoundInfo> {
  const market = requireMarket(cfg);
  const blockNumber = Number(await publicClient.getBlockNumber());
  const currentRound = Number(
    (await publicClient.readContract({
      address: market,
      abi: POOL_MARKET_ABI,
      functionName: "currentRound",
    })) as bigint,
  );
  const isBettingOpen = (await publicClient.readContract({
    address: market,
    abi: POOL_MARKET_ABI,
    functionName: "isBettingOpen",
  })) as boolean;
  const roundStartBlock = Number(
    (await publicClient.readContract({
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
 * 按链上区块时间取这一轮的开盘价 / 收盘价，判涨跌。
 * 一轮 = 600 块 ≈ 600 秒，所以拿「轮首那一分钟」和「轮末那一分钟」的收盘价对比即可。
 */
export async function priceWinner(
  cfg: ChainConfig,
  symbol: string,
  roundIndex: number,
): Promise<{ winner: number; startPrice: number; endPrice: number; startTime: number; endTime: number }> {
  const market = requireMarket(cfg);
  const startBlock = Number(
    (await publicClient.readContract({
      address: market,
      abi: POOL_MARKET_ABI,
      functionName: "roundStart",
      args: [BigInt(roundIndex)],
    })) as bigint,
  );
  const endBlock = startBlock + 600;

  const [start, end] = await Promise.all([
    publicClient.getBlock({ blockNumber: BigInt(startBlock) }),
    publicClient.getBlock({ blockNumber: BigInt(endBlock - 1) }),
  ]);
  const startTime = Number(start.timestamp);
  const endTime = Number(end.timestamp);

  const instId = `${symbol.toUpperCase()}-USDT`;
  const url =
    `https://www.okx.com/api/v5/market/history-candles?instId=${instId}&bar=1m` +
    `&after=${(endTime + 60) * 1000}&limit=30`;

  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new HttpError(502, `行情接口不可用：HTTP ${response.status}`);
  const payload = (await response.json()) as { code: string; data?: string[][]; msg?: string };
  if (payload.code !== "0" || !payload.data?.length) {
    throw new HttpError(502, `行情接口没有数据：${payload.msg ?? payload.code}`);
  }

  // OKX 返回 [ts, open, high, low, close, vol, ...]，按时间倒序。
  const candles = payload.data
    .map((row) => ({ ts: Number(row[0]) / 1000, close: Number(row[4]) }))
    .sort((a, b) => a.ts - b.ts);

  // 必须精确拿到「轮首那一分钟」和「轮末那一分钟」的 K 线；缺任何一根就报错，
  // 绝不用过期 K 线凑数（否则开盘价=收盘价，会永远判涨）。
  const minuteOf = (ts: number) => Math.floor(ts / 60) * 60;
  const openMinute = minuteOf(startTime);
  const closeMinute = minuteOf(endTime);
  const openCandle = candles.find((candle) => candle.ts === openMinute) ?? null;
  const closeCandle = candles.find((candle) => candle.ts === closeMinute) ?? null;

  if (!openCandle || !closeCandle) {
    throw new HttpError(
      502,
      `行情覆盖不到这一轮（${instId}）：需要 ${new Date(openMinute * 1000).toISOString()} 与 ` +
        `${new Date(closeMinute * 1000).toISOString()} 两根 1m K 线。` +
        `本地 anvil 快进会让链上时间跑到真实时间前面，这种情况请用显式 winner 结算。`,
    );
  }

  return {
    winner: closeCandle.close >= openCandle.close ? SIDE_UP : SIDE_DOWN,
    startPrice: openCandle.close,
    endPrice: closeCandle.close,
    startTime,
    endTime: Number(closeCandle.ts),
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
): Promise<SettleResult> {
  const market = requireMarket(cfg);
  const row = listMarkets(db).find((item) => item.market_id === marketId);
  if (!row) throw new HttpError(404, `未知 marketId：${marketId}`);

  const [upAmount, downAmount, , settled] = (await publicClient.readContract({
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

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    markTxFailed(db, txId, "settle 回滚");
    throw new HttpError(502, `结算交易回滚：marketId ${marketId} round ${roundIndex}`);
  }
  markTxConfirmed(db, txId);

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
    if (explicitWinners?.[symbol]) {
      winner = winnerFromLabel(explicitWinners[symbol]);
    } else {
      try {
        const price = await priceWinner(cfg, symbol, roundIndex);
        winner = price.winner;
        prices[symbol] = price;
      } catch (error) {
        // 只给了部分标的的显式结果时，其余标的拿不到价格就跳过，绝不瞎猜。
        prices[symbol] = { error: describe(error) };
        continue;
      }
    }

    for (const row of listMarkets(db).filter((item) => item.symbol === symbol)) {
      const result = await settleMarket(db, cfg, row.market_id, roundIndex, winner);
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
    .prepare("SELECT id, address, enc_pkey FROM users WHERE LOWER(address) = LOWER(?)")
    .get(address) as { id: number; address: Address; enc_pkey: string } | undefined;
  if (!user) throw new HttpError(404, `用户不存在：${address}`);

  const [, , , settled] = (await publicClient.readContract({
    address: market,
    abi: POOL_MARKET_ABI,
    functionName: "pools",
    args: [BigInt(roundIndex), marketId],
  })) as readonly [bigint, bigint, number, boolean];
  if (!settled) throw new HttpError(409, `第 ${roundIndex} 轮还没结算`);

  const alreadyClaimed = (await publicClient.readContract({
    address: market,
    abi: POOL_MARKET_ABI,
    functionName: "claimed",
    args: [BigInt(roundIndex), marketId, user.address],
  })) as boolean;
  if (alreadyClaimed) throw new HttpError(409, `第 ${roundIndex} 轮已经领过了（每轮只能领一次）`);

  const amountWei = (await publicClient.readContract({
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

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      markTxFailed(db, txId, "claim 回滚");
      throw new HttpError(502, "领取交易回滚");
    }
    markTxConfirmed(db, txId);

    return { txHash: hash, marketId, roundIndex, amountWei: amountWei.toString() };
  });
}

/** 轮询式自动结算：只处理「已经结束、有下注、还没结算」的轮次，拿不到价格就跳过。 */
export function startAutoSettler(db: Db, cfg: ChainConfig, intervalMs = 3_000): void {
  let busy = false;

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const info = await getRoundInfo(cfg);
      const finishedRounds = [info.currentRound - 2, info.currentRound - 3].filter((r) => r >= 0);

      for (const roundIndex of finishedRounds) {
        const unsettled = await marketsWithUnsettledBets(db, cfg, roundIndex);
        if (unsettled.length === 0) continue;

        const result = await settleRound(db, cfg, roundIndex);
        const sent = result.markets.filter((item) => item.txHash);
        if (sent.length > 0) {
          console.log(
            `[settle] round ${roundIndex} 结算 ${sent.length} 个市场：` +
              sent.map((item) => `${item.symbol}/${item.betToken}=${item.winner === 0 ? "long" : "short"}`).join(", "),
          );
        }
      }
    } catch (error) {
      console.warn("[settle] 自动结算跳过：", describe(error));
    } finally {
      busy = false;
    }
  };

  setInterval(() => void tick(), intervalMs);
  console.log(`[settle] 自动结算已启动（每 ${intervalMs / 1000}s 检查一次，RPC ${RPC_URL}）`);
}

export async function marketsWithUnsettledBets(
  db: Db,
  cfg: ChainConfig,
  roundIndex: number,
): Promise<number[]> {
  const market = requireMarket(cfg);
  const result: number[] = [];
  for (const row of listMarkets(db)) {
    const [upAmount, downAmount, , settled] = (await publicClient.readContract({
      address: market,
      abi: POOL_MARKET_ABI,
      functionName: "pools",
      args: [BigInt(roundIndex), row.market_id],
    })) as readonly [bigint, bigint, number, boolean];
    if (!settled && upAmount + downAmount > 0n) result.push(row.market_id);
  }
  return result;
}
