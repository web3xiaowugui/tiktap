import type { Db } from "./db.ts";
import type { MarketRow } from "./markets.ts";
import type { MarketOpinion } from "../../../packages/shared/src/api-types.ts";
import { displayName, gradientFor, relativeTime } from "./activity.ts";
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
  body: string;
  side: number | null;
  round_id: number | null;
  created_at: number;
  x_name: string | null;
  x_handle: string | null;
}

export function readOpinions(
  db: Db,
  marketRow: MarketRow,
  limit = 50,
): MarketOpinion[] {
  const rows = db
    .prepare(
      "SELECT o.id, o.address, o.body, o.side, o.round_id, o.created_at, " +
        "u.x_name, u.x_handle " +
        "FROM opinions o LEFT JOIN users u ON u.id = o.user_id " +
        "WHERE o.market_id = ? ORDER BY o.created_at DESC LIMIT ?",
    )
    .all(marketRow.market_id, Math.min(Math.max(limit, 1), 200)) as unknown as OpinionRow[];

  return rows.map((row) => ({
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
    time: relativeTime(row.created_at),
    followed: false,
  }));
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
    time: relativeTime(now),
    followed: false,
  };
}
