import { publicClientFor } from "./chain.ts";
import { POOL_MARKET_ABI } from "./contracts.ts";
import { HttpError } from "./http.ts";
import { requireMarket, type ChainConfig } from "./tx.ts";
import { listMarkets } from "./markets.ts";
import type { Db } from "./db.ts";
import { currentEnv } from "./runtime.ts";

/**
 * 每轮的「锁定价格」和「开奖价格」落库。
 *
 * 定义（和前端口径一致）：
 *   锁定价格 = 这一轮**开始**那一分钟 K 线的收盘价（roundStart 块所在分钟）
 *   开奖价格 = 这一轮**结束**那一分钟 K 线的收盘价（roundStart + 600 - 1 块所在分钟）
 * 涨跌判定 = 开奖价格 >= 锁定价格 ?
 *
 * 只存过一次就不再向 OKX 拉，接口和结算读同一份数据，便于对账。
 */

export interface RoundPriceRow {
  symbol: string;
  roundId: number;
  startBlock: number | null;
  /** 锁定价格（轮次开始价）。 */
  lockPrice: number | null;
  lockTime: number | null;
  /** 开奖价格（轮次结束价）。 */
  settlePrice: number | null;
  settleTime: number | null;
  updatedAt: number | null;
}

const SOURCE = "okx-1m";

interface Row {
  symbol: string;
  round_id: number;
  start_block: number | null;
  lock_time: number | null;
  lock_price: string | null;
  settle_time: number | null;
  settle_price: string | null;
  updated_at: number | null;
}

function toRow(row: Row | undefined): RoundPriceRow | null {
  if (!row) return null;
  return {
    symbol: row.symbol,
    roundId: row.round_id,
    startBlock: row.start_block,
    lockPrice: row.lock_price === null ? null : Number(row.lock_price),
    lockTime: row.lock_time,
    settlePrice: row.settle_price === null ? null : Number(row.settle_price),
    settleTime: row.settle_time,
    updatedAt: row.updated_at,
  };
}

const SELECT =
  "SELECT symbol, round_id, start_block, lock_time, lock_price, settle_time, settle_price, updated_at " +
  "FROM round_prices WHERE env = ? AND symbol = ? AND round_id = ?";

export function getRoundPrice(db: Db, symbol: string, roundId: number): RoundPriceRow | null {
  const row = db.prepare(SELECT).get(currentEnv(), symbol.toUpperCase(), roundId) as Row | undefined;
  return toRow(row);
}

function upsert(
  db: Db,
  symbol: string,
  roundId: number,
  patch: {
    startBlock?: number;
    lockPrice?: number;
    lockTime?: number;
    settlePrice?: number;
    settleTime?: number;
  },
): void {
  db.prepare(
    "INSERT INTO round_prices (env, symbol, round_id, start_block, lock_time, lock_price, settle_time, settle_price, source, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(env, symbol, round_id) DO UPDATE SET " +
      "start_block = COALESCE(excluded.start_block, round_prices.start_block), " +
      "lock_time = COALESCE(excluded.lock_time, round_prices.lock_time), " +
      "lock_price = COALESCE(excluded.lock_price, round_prices.lock_price), " +
      "settle_time = COALESCE(excluded.settle_time, round_prices.settle_time), " +
      "settle_price = COALESCE(excluded.settle_price, round_prices.settle_price), " +
      "updated_at = excluded.updated_at",
  ).run(
    currentEnv(),
    symbol.toUpperCase(),
    roundId,
    patch.startBlock ?? null,
    patch.lockTime ?? null,
    patch.lockPrice === undefined ? null : patch.lockPrice.toFixed(10),
    patch.settleTime ?? null,
    patch.settlePrice === undefined ? null : patch.settlePrice.toFixed(10),
    SOURCE,
    Date.now(),
  );
}

/** 轮首 / 轮末的链上时间（块时间戳，不用本地时钟）。 */
async function roundTimeline(
  cfg: ChainConfig,
  roundIndex: number,
): Promise<{ startBlock: number; endTime: number; startTime: number }> {
  const market = requireMarket(cfg);
  const startBlock = Number(
    (await publicClientFor().readContract({
      address: market,
      abi: POOL_MARKET_ABI,
      functionName: "roundStart",
      args: [BigInt(roundIndex)],
    })) as bigint,
  );
  const start = await publicClientFor().getBlock({ blockNumber: BigInt(startBlock) });

  // 轮末那块可能还没出（当前轮），先用「轮首 + 600s」估算；等真的结束了再精确重算
  let endTimestamp = Number(start.timestamp) + 600;
  try {
    const end = await publicClientFor().getBlock({ blockNumber: BigInt(startBlock + 599) });
    endTimestamp = Number(end.timestamp);
  } catch {
    // 还没出块，保留估算值
  }

  return {
    startBlock,
    startTime: Number(start.timestamp),
    endTime: endTimestamp,
  };
}

/** OKX 1m K 线，按 [ts, open, high, low, close]。 */
async function fetchCandles(
  symbol: string,
  afterMs: number,
): Promise<Array<{ ts: number; close: number }>> {
  const instId = `${symbol.toUpperCase()}-USDT`;
  const url =
    `https://www.okx.com/api/v5/market/history-candles?instId=${instId}&bar=1m` +
    `&after=${afterMs}&limit=30`;

  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new HttpError(502, `行情接口不可用：HTTP ${response.status}`);
  const payload = (await response.json()) as { code: string; data?: string[][]; msg?: string };
  if (payload.code !== "0" || !payload.data?.length) {
    throw new HttpError(502, `行情接口没有数据：${payload.msg ?? payload.code}`);
  }
  return payload.data
    .map((row) => ({ ts: Number(row[0]) / 1000, close: Number(row[4]) }))
    .sort((a, b) => a.ts - b.ts);
}

const minuteOf = (ts: number) => Math.floor(ts / 60) * 60;

/**
 * 补齐（或读）某一轮的价格：
 *   - 轮次开始那一分钟的 K 线收盘后 → 写入锁定价格
 *   - 轮次结束那一分钟的 K 线收盘后 → 写入开奖价格
 * 已经有值就不重复请求行情。
 */
export async function ensureRoundPrices(
  db: Db,
  cfg: ChainConfig,
  symbol: string,
  roundIndex: number,
): Promise<RoundPriceRow> {
  const upper = symbol.toUpperCase();
  const existing = getRoundPrice(db, upper, roundIndex);
  // 锁定价 + 开奖价都齐了直接返回，不用再为历史轮次做链上 / 行情请求。
  if (existing?.lockPrice != null && existing.settlePrice != null) {
    return existing;
  }

  const timeline = await roundTimeline(cfg, roundIndex);
  const openMinute = minuteOf(timeline.startTime);
  const closeMinute = minuteOf(timeline.endTime);

  // 这一轮在链上还没结束（当前轮）：开奖价先不要求
  const blockNumber = Number(await publicClientFor().getBlockNumber());
  const finished = blockNumber >= timeline.startBlock + 600;

  const needLock = existing?.lockPrice == null;
  const needSettle = finished && existing?.settlePrice == null;
  if (!needLock && !needSettle) return existing!;

  // 只请求到「轮末那一分钟 + 1 分钟」为止，拿不到的就不硬凑
  const candles = await fetchCandles(upper, (Math.max(closeMinute, openMinute) + 60) * 1000);

  const openCandle = needLock ? candles.find((candle) => candle.ts === openMinute) : undefined;
  const closeCandle = needSettle
    ? candles.find((candle) => candle.ts === closeMinute)
    : undefined;

  if (needLock && !openCandle) {
    throw new HttpError(
      502,
      `行情还没覆盖这一轮的开盘价（${upper}-USDT 缺 ${new Date(openMinute * 1000).toISOString()} 这根 1m K 线），等一分钟再试。`,
    );
  }
  if (needSettle && !closeCandle) {
    throw new HttpError(
      502,
      `行情还没覆盖这一轮的开奖价（${upper}-USDT 缺 ${new Date(closeMinute * 1000).toISOString()} 这根 1m K 线），等一分钟再试。`,
    );
  }

  upsert(db, upper, roundIndex, {
    startBlock: timeline.startBlock,
    ...(openCandle ? { lockPrice: openCandle.close, lockTime: openCandle.ts } : {}),
    ...(closeCandle ? { settlePrice: closeCandle.close, settleTime: closeCandle.ts } : {}),
  });

  const row = getRoundPrice(db, upper, roundIndex);
  if (!row) throw new HttpError(500, `写入 round_prices 失败：${upper} #${roundIndex}`);
  return row;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 回填库里已经出现过、但价格没齐的已结束轮次，不看这一轮有没有人下注。
 *
 * 只扫描 `round_prices` 里实际记录过的轮次，不枚举链上全部历史：
 * X Layer 测试网区块高度已经几千万，从 round 0 全量回填会打出几十万次请求。
 *
 * 行情接口有频率限制，按 delayMs 节流串行跑；已经写齐的轮次直接跳过，
 * 所以正常重启时几乎不产生行情请求。服务启动后在后台调用即可。
 */
export async function backfillRoundPrices(
  db: Db,
  cfg: ChainConfig,
  currentRound: number,
  delayMs = 120,
): Promise<{ attempted: number; filled: number; failed: number }> {
  const symbols = [...new Set(listMarkets(db).map((row) => row.symbol))];
  const missing = db
    .prepare(
      "SELECT DISTINCT round_id FROM round_prices " +
        "WHERE env = ? AND round_id <= ? AND settle_price IS NULL ORDER BY round_id",
    )
    .all(currentEnv(), currentRound - 2) as Array<{ round_id: number }>;
  let attempted = 0;
  let filled = 0;
  let failed = 0;

  for (const { round_id: roundIndex } of missing) {
    for (const symbol of symbols) {
      const before = getRoundPrice(db, symbol, roundIndex);
      if (before?.lockPrice != null && before.settlePrice != null) continue;

      attempted += 1;
      try {
        const after = await ensureRoundPrices(db, cfg, symbol, roundIndex);
        if (after.settlePrice != null) filled += 1;
      } catch {
        failed += 1;
      }
      if (delayMs > 0) await sleep(delayMs);
    }
  }

  return { attempted, filled, failed };
}
