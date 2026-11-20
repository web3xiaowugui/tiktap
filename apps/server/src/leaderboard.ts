import type { Db } from "./db.ts";
import { currentEnv } from "./runtime.ts";
import { displayName, gradientFor } from "./activity.ts";
import type { LeaderboardEntry } from "../../../packages/shared/src/api-types.ts";
import { followingIds } from "./follows.ts";

interface LeaderboardRow {
  user_id: number;
  address: string;
  x_name: string | null;
  x_handle: string | null;
  payout: number;
  stake: number;
}

/**
 * 排行榜：当前环境下已结算下注的净盈利（payout - 下注额），按盈利从高到低排。
 * 亏损的人也在榜上（负盈亏标红）；viewerId 给定时只返回关注的人（rank 仍是全场名次）。
 */
export function readLeaderboard(
  db: Db,
  limit = 100,
  viewerId: number | null = null,
): LeaderboardEntry[] {
  const rows = db
    .prepare(
      "SELECT b.user_id AS user_id, MAX(b.address) AS address, MAX(u.x_name) AS x_name, " +
        "MAX(u.x_handle) AS x_handle, " +
        "SUM(CAST(b.payout_wei AS REAL)) AS payout, " +
        "SUM(CAST(b.amount_wei AS REAL)) AS stake " +
        "FROM bets b LEFT JOIN users u ON u.id = b.user_id " +
        "WHERE b.env = ? AND b.status = 'confirmed' AND b.winner_side IS NOT NULL " +
        "GROUP BY b.user_id",
    )
    .all(currentEnv()) as unknown as LeaderboardRow[];

  const ranked = rows
    .map((row) => {
      const pnl = row.payout - row.stake;
      const pnlPct = row.stake > 0 ? (pnl / row.stake) * 100 : 0;
      return { row, pnl, pnlPct };
    })
    .sort((a, b) => b.pnl - a.pnl);

  const followed = viewerId === null ? null : new Set(followingIds(db, viewerId));
  const entries: LeaderboardEntry[] = [];
  for (let index = 0; index < ranked.length; index += 1) {
    const item = ranked[index];
    if (followed && !followed.has(item.row.user_id)) continue;
    entries.push({
      rank: index + 1,
      name: displayName({
        address: item.row.address,
        x_name: item.row.x_name,
        x_handle: item.row.x_handle,
      }),
      // 用地址作为 handle：重名 X 账号不会串号，个人页路由也支持地址
      handle: item.row.address,
      avatar: gradientFor(item.row.address),
      pnl: Math.round(item.pnl) / 1e18,
      pnlPct: Math.round(item.pnlPct * 100) / 100,
    });
    if (entries.length >= limit) break;
  }
  return entries;
}
