import type { Db } from "./db.ts";
import { currentEnv } from "./runtime.ts";
import type { MarketRow } from "./markets.ts";
import type { MarketOpinion } from "../../../packages/shared/src/api-types.ts";
import { displayName, formatAmount, gradientFor, relativeTime } from "./activity.ts";
import { HttpError } from "./http.ts";

/**
 * 市场级观点。发布时把「当时的仓位」快照进这一行（bet_amount_wei / bet_side / bet_count），
 * 之后不可变；列表只读 opinions 表，不再实时聚合 bets。
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
  bet_amount_wei: string | null;
  bet_count: number | null;
  created_at: number;
  x_name: string | null;
  x_handle: string | null;
}

const SELECT_COLUMNS =
  "o.id, o.address, o.symbol, o.market_id, o.bet_token, o.body, o.side, o.round_id, " +
  "o.bet_amount_wei, o.bet_count, o.created_at, u.x_name, u.x_handle";

function toOpinion(row: OpinionRow): MarketOpinion {
  const amountWei = row.bet_amount_wei;
  const betAmount =
    amountWei && amountWei !== "0"
      ? `${formatAmount(amountWei)} ${row.bet_token}`
      : undefined;

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
    betAmount,
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
      `SELECT ${SELECT_COLUMNS} FROM opinions o LEFT JOIN users u ON u.id = o.user_id ` +
        "WHERE o.env = ? AND o.market_id = ? ORDER BY o.created_at DESC LIMIT ?",
    )
    .all(
      currentEnv(),
      marketRow.market_id,
      Math.min(Math.max(limit, 1), 200),
    ) as unknown as OpinionRow[];

  return rows.map(toOpinion);
}

/** 跨下注代币：某个标的的全部观点（左侧动态用）。 */
export function readOpinionsBySymbol(
  db: Db,
  symbol: string,
  limit = 50,
): MarketOpinion[] {
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM opinions o LEFT JOIN users u ON u.id = o.user_id ` +
        "WHERE o.env = ? AND o.symbol = ? ORDER BY o.created_at DESC LIMIT ?",
    )
    .all(
      currentEnv(),
      symbol.toUpperCase(),
      Math.min(Math.max(limit, 1), 200),
    ) as unknown as OpinionRow[];

  return rows.map(toOpinion);
}

interface PositionSnapshot {
  amountWei: string | null;
  side: number | null;
  count: number;
}

/**
 * 某地址在该市场该轮的仓位快照；`before` 给了就只算这个时间点之前的下注，
 * 老数据回填时用它还原「发布那一刻」的仓位。
 */
function readPosition(
  db: Db,
  marketId: number,
  roundId: number,
  address: string,
  before?: number,
): PositionSnapshot {
  const bets = (
    before === undefined
      ? db
          .prepare(
            "SELECT side, amount_wei FROM bets WHERE env = ? AND market_id = ? AND round_id = ? AND address = ?",
          )
          .all(currentEnv(), marketId, roundId, address.toLowerCase())
      : db
          .prepare(
            "SELECT side, amount_wei FROM bets WHERE env = ? AND market_id = ? AND round_id = ? AND address = ? " +
              "AND created_at <= ?",
          )
          .all(currentEnv(), marketId, roundId, address.toLowerCase(), before)
  ) as Array<{
    side: number;
    amount_wei: string;
  }>;

  if (bets.length === 0) return { amountWei: null, side: null, count: 0 };

  let total = 0n;
  const sides = new Set<number>();
  for (const bet of bets) {
    total += BigInt(bet.amount_wei || "0");
    sides.add(bet.side);
  }

  return {
    amountWei: total.toString(),
    // 只押了一边才记方向，两边都押就是 null
    side: sides.size === 1 ? [...sides][0] : null,
    count: bets.length,
  };
}

/** 发布这一刻这个地址在该市场该轮的仓位快照。 */
function snapshotPosition(
  db: Db,
  marketId: number,
  roundId: number | null,
  address: string,
): PositionSnapshot {
  if (roundId === null) return { amountWei: null, side: null, count: 0 };
  return readPosition(db, marketId, roundId, address);
}

/**
 * 老数据补快照：改版前发布的观点 bet_count 为 NULL，按「发布时刻之前」的下注还原一次。
 * 新观点即使是空仓也会写 bet_count = 0，所以这个迁移只会跑一遍。
 */
export function backfillOpinionSnapshots(db: Db): number {
  const rows = db
    .prepare(
      "SELECT id, market_id, round_id, address, created_at FROM opinions " +
        "WHERE env = ? AND bet_count IS NULL AND round_id IS NOT NULL",
    )
    .all(currentEnv()) as Array<{
    id: number;
    market_id: number;
    round_id: number;
    address: string;
    created_at: number;
  }>;
  if (rows.length === 0) return 0;

  const update = db.prepare(
    "UPDATE opinions SET bet_amount_wei = ?, bet_side = ?, bet_count = ? WHERE env = ? AND id = ?",
  );
  for (const row of rows) {
    const position = readPosition(
      db,
      row.market_id,
      row.round_id,
      row.address,
      row.created_at,
    );
    update.run(position.amountWei ?? "0", position.side, position.count, currentEnv(), row.id);
  }
  return rows.length;
}

export function createOpinion(
  db: Db,
  marketRow: MarketRow,
  input: { address: string; body: string; side?: string | null; roundId?: number | null },
): MarketOpinion {
  const user = db
    .prepare("SELECT id, address, x_name, x_handle FROM users WHERE env = ? AND LOWER(address) = LOWER(?)")
    .get(currentEnv(), input.address) as
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

  const roundId = input.roundId ?? null;
  const snapshot = snapshotPosition(db, marketRow.market_id, roundId, user.address);

  const result = db
    .prepare(
      "INSERT INTO opinions (env, user_id, address, market_id, symbol, bet_token, round_id, " +
        "bet_amount_wei, bet_side, bet_count, body, side, created_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      currentEnv(),
      user.id,
      user.address.toLowerCase(),
      marketRow.market_id,
      marketRow.symbol,
      marketRow.bet_token,
      roundId,
      snapshot.amountWei,
      snapshot.side,
      snapshot.count,
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
    roundId,
    symbol: marketRow.symbol,
    betToken: marketRow.bet_token,
    betAmount:
      snapshot.amountWei && snapshot.amountWei !== "0"
        ? `${formatAmount(snapshot.amountWei)} ${marketRow.bet_token}`
        : undefined,
    time: relativeTime(now),
    followed: false,
  };
}
