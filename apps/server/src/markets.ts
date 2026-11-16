import type { Db } from "./db.ts";
import { BET_TOKENS, TOKENS } from "./data/mockData.ts";

export interface MarketRow {
  market_id: number;
  symbol: string;
  bet_token: string;
  token_address: string | null;
  enabled: number;
  sort_order: number;
}

/**
 * 市场 = 标的 × 下注代币（类似交易所交易对），池子的最小单位是「某市场的某一轮」。
 *
 * 表里的行由 fixture 幂等 seed：已存在的 pair 保持原 market_id 不变，
 * 新增的 pair 拿递增 id。market_id 会作为链上 PoolMarket 的索引，
 * 所以一旦分配就不能改。
 */
export function seedMarkets(db: Db): void {
  const existing = new Set(
    (db.prepare("SELECT symbol, bet_token FROM markets").all() as Array<{
      symbol: string;
      bet_token: string;
    }>).map((row) => `${row.symbol}:${row.bet_token}`),
  );

  const maxRow = db.prepare("SELECT MAX(market_id) AS max FROM markets").get() as {
    max: number | null;
  };
  let nextId = Number(maxRow.max ?? 0) + 1;

  const insert = db.prepare(
    "INSERT INTO markets (market_id, symbol, bet_token, enabled, sort_order) " +
      "VALUES (?, ?, ?, 1, ?)",
  );

  let order = 0;
  for (const token of TOKENS) {
    for (const betToken of BET_TOKENS) {
      order += 1;
      const pair = `${token.symbol}:${betToken.symbol}`;
      if (existing.has(pair)) continue;
      insert.run(nextId, token.symbol, betToken.symbol, order);
      nextId += 1;
    }
  }
}

export function listMarkets(db: Db): MarketRow[] {
  return db
    .prepare(
      "SELECT market_id, symbol, bet_token, token_address, enabled, sort_order " +
        "FROM markets ORDER BY sort_order, market_id",
    )
    .all() as unknown as MarketRow[];
}

export function findMarket(db: Db, symbol: string, betToken: string): MarketRow | null {
  const row = db
    .prepare(
      "SELECT market_id, symbol, bet_token, token_address, enabled, sort_order " +
        "FROM markets WHERE symbol = ? AND bet_token = ?",
    )
    .get(symbol, betToken) as MarketRow | undefined;
  return row ?? null;
}
