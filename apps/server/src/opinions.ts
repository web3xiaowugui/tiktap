import type { Db } from "./db.ts";
import type { MarketRow } from "./markets.ts";
import type { MarketOpinion } from "../../../packages/shared/src/api-types.ts";
import { displayName, formatAmount, gradientFor, relativeTime } from "./activity.ts";
import { HttpError } from "./http.ts";

/**
 * 市场级观点：存在 opinions 表，发布时顺带记录当时所在轮次（round_id）。
 * 列表默认返回这个市场的全部观点，前端可再按轮次筛选。
 */

const MAX_BODY = 280;

/** 同一地址 10s 内只能发一条，避免刷屏。 */
const lastPost = new Map<string, number>();

interface OpinionRow {
  id: number;
  address: string;
  symbol: string;
  market_id: number;
  bet_token: string;
  body: string;
  side: number | null;
  round_id: number | null;
  created_at: number;
  x_name: string | null;
  x_handle: string | null;
}

/**
 * 每条观点作者在「这个市场 + 这一轮」的下注总额（含单位），没有下注就不返回。
 */
function stakesForOpinions(db: Db, rows: OpinionRow[]): Map<string, string> {
  const pairs = new Map<string, { marketId: number; roundId: number; symbol: string; token: string }>();
  for (const row of rows) {
    if (row.round_id === null) continue;
    pairs.set(`${row.market_id}:${row.round_id}`, {
      marketId: row.market_id,
      roundId: row.round_id,
      symbol: row.symbol,
      token: row.bet_token,
    });
  }

  const result = new Map<string, string>();
  for (const pair of pairs.values()) {
    const bets = db
      .prepare(
        "SELECT address, amount_wei FROM bets WHERE market_id = ? AND round_id = ?",
      )
      .all(pair.marketId, pair.roundId) as Array<{ address: string; amount_wei: string }>;

    const byAddress = new Map<string, bigint>();
    for (const bet of bets) {
      const key = bet.address.toLowerCase();
      byAddress.set(key, (byAddress.get(key) ?? 0n) + BigInt(bet.amount_wei || "0"));
    }
    for (const [address, wei] of byAddress) {
      if (wei > 0n) {
        result.set(`${address}:${pair.marketId}:${pair.roundId}`, `${formatAmount(wei.toString())} ${pair.token}`);
      }
    }
  }
  return result;
}

function toOpinion(row: OpinionRow, stakes: Map<string, string>): MarketOpinion {
  const stake =
    row.round_id === null
      ? undefined
      : stakes.get(`${row.address.toLowerCase()}:${row.market_id}:${row.round_id}`);

  return {
    id: String(row.id),
    address: row.address,
    name: displayName({
      address: row.address,
      x_name: row.x_name,
      x_handle: row.x_handle,
    }),
    avatar: gradientFor(row.address),
    body: row.body,
    side: row.side === null ? null : row.side === 0 ? "long" : "short",
    roundId: row.round_id,
    symbol: row.symbol,
    betToken: row.bet_token,
    betAmount: stake,
    time: relativeTime(row.created_at),
    followed: false,
  };
}

export function readOpinions(
  db: Db,
  marketRow: MarketRow,
  limit = 50,
): MarketOpinion[] {
  const rows = db
    .prepare(
      "SELECT o.id, o.address, o.symbol, o.market_id, o.bet_token, o.body, o.side, o.round_id, o.created_at, " +
        "u.x_name, u.x_handle " +
        "FROM opinions o LEFT JOIN users u ON u.id = o.user_id " +
        "WHERE o.market_id = ? ORDER BY o.created_at DESC LIMIT ?",
    )
    .all(marketRow.market_id, Math.min(Math.max(limit, 1), 200)) as unknown as OpinionRow[];

  const stakes = stakesForOpinions(db, rows);
  return rows.map((row) => toOpinion(row, stakes));
}

/** 跨下注代币：某个标的的全部观点（左侧动态用）。 */
export function readOpinionsBySymbol(
  db: Db,
  symbol: string,
  limit = 50,
): MarketOpinion[] {
  const rows = db
    .prepare(
      "SELECT o.id, o.address, o.symbol, o.market_id, o.bet_token, o.body, o.side, o.round_id, o.created_at, " +
        "u.x_name, u.x_handle " +
        "FROM opinions o LEFT JOIN users u ON u.id = o.user_id " +
        "WHERE o.symbol = ? ORDER BY o.created_at DESC LIMIT ?",
    )
    .all(
      symbol.toUpperCase(),
      Math.min(Math.max(limit, 1), 200),
    ) as unknown as OpinionRow[];

  const stakes = stakesForOpinions(db, rows);
  return rows.map((row) => toOpinion(row, stakes));
}

export function createOpinion(
  db: Db,
  marketRow: MarketRow,
  input: { address: string; body: string; side?: string | null; roundId?: number | null },
): MarketOpinion {
  const user = db
    .prepare("SELECT id, address, x_name, x_handle FROM users WHERE LOWER(address) = LOWER(?)")
    .get(input.address) as
    | { id: number; address: string; x_name: string | null; x_handle: string | null }
    | undefined;
  if (!user) throw new HttpError(404, `用户不存在：${input.address}，先登录`);

  const body = input.body.trim();
  if (body.length === 0) throw new HttpError(400, "观点不能为空");
  if (body.length > MAX_BODY) throw new HttpError(400, `观点最多 ${MAX_BODY} 字`);

  const key = user.address.toLowerCase();
  const now = Date.now();
  const last = lastPost.get(key) ?? 0;
  if (now - last < 10_000) throw new HttpError(429, "发得太快了，休息 10 秒再来");

  let side: number | null = null;
  if (input.side === "long") side = 0;
  else if (input.side === "short") side = 1;

  const result = db
    .prepare(
      "INSERT INTO opinions (user_id, address, market_id, symbol, bet_token, round_id, body, side, created_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      user.id,
      user.address.toLowerCase(),
      marketRow.market_id,
      marketRow.symbol,
      marketRow.bet_token,
      input.roundId ?? null,
      body,
      side,
      now,
    );
  lastPost.set(key, now);

  return {
    id: String(Number(result.lastInsertRowid)),
    address: user.address.toLowerCase(),
    name: displayName({
      address: user.address,
      x_name: user.x_name,
      x_handle: user.x_handle,
    }),
    avatar: gradientFor(user.address),
    body,
    side: side === null ? null : side === 0 ? "long" : "short",
    roundId: input.roundId ?? null,
    symbol: marketRow.symbol,
    betToken: marketRow.bet_token,
    time: relativeTime(now),
    followed: false,
  };
}
