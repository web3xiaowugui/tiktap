import type { Db } from "./db.ts";
import { currentEnv } from "./runtime.ts";
import type { MarketRow } from "./markets.ts";
import { SIDE_DOWN } from "./contracts.ts";
import type { Holder } from "../../../packages/shared/src/api-types.ts";
import { displayName, formatAmount, gradientFor } from "./activity.ts";

/** 参与者列表最多返回多少条（按下注时间从新到旧）。 */
const HOLDER_ROW_LIMIT = 100;

/**
 * 某一轮、某个市场（标的 + 下注代币）的参与者：按地址聚合下注记录。
 * 结算过的轮次再带上是否获胜、本轮收到多少、盈亏多少。
 *
 * 金额全程用 BigInt 聚合（wei 超过 64 位整数，不能在 SQL 里 SUM）。
 */

interface BetRow {
  address: string;
  side: number;
  amount_wei: string;
  payout_wei: string | null;
  winner_side: number | null;
  created_at: number;
  round_id: number;
  x_name: string | null;
  x_handle: string | null;
}

interface Aggregate {
  address: string;
  roundId: number;
  x_name: string | null;
  x_handle: string | null;
  longCount: number;
  longWei: bigint;
  shortCount: number;
  shortWei: bigint;
  stakeWei: bigint;
  payoutWei: bigint;
  winnerSide: number | null;
  lastAt: number;
}

/**
 * 参与者：按地址 + 轮次聚合下注记录。
 * roundIndex 传 null 时返回所有轮次的参与者（前端「仅看本轮」关掉时用）。
 * 最多返回最近 HOLDER_ROW_LIMIT 条参与者记录。
 */
export function readHolders(
  db: Db,
  marketRow: MarketRow,
  roundIndex: number | null,
): Holder[] {
  const rows = (
    roundIndex === null
      ? db
          .prepare(
            "SELECT b.address, b.side, b.amount_wei, b.payout_wei, b.winner_side, b.created_at, b.round_id, " +
              "u.x_name, u.x_handle " +
              "FROM bets b LEFT JOIN users u ON u.id = b.user_id " +
              "WHERE b.env = ? AND b.market_id = ? " +
              "ORDER BY b.created_at DESC LIMIT 500",
          )
          .all(currentEnv(), marketRow.market_id)
      : db
          .prepare(
            "SELECT b.address, b.side, b.amount_wei, b.payout_wei, b.winner_side, b.created_at, b.round_id, " +
              "u.x_name, u.x_handle " +
              "FROM bets b LEFT JOIN users u ON u.id = b.user_id " +
              "WHERE b.env = ? AND b.market_id = ? AND b.round_id = ? " +
              "ORDER BY b.created_at DESC LIMIT 500",
          )
          .all(currentEnv(), marketRow.market_id, roundIndex)
  ) as unknown as BetRow[];

  const byKey = new Map<string, Aggregate>();

  for (const row of rows) {
    const key = `${row.address}:${row.round_id}`;
    const current =
      byKey.get(key) ??
      ({
        address: row.address,
        roundId: row.round_id,
        x_name: row.x_name,
        x_handle: row.x_handle,
        longCount: 0,
        longWei: 0n,
        shortCount: 0,
        shortWei: 0n,
        stakeWei: 0n,
        payoutWei: 0n,
        winnerSide: null,
        lastAt: 0,
      } satisfies Aggregate);

    const amount = BigInt(row.amount_wei || "0");
    current.stakeWei += amount;
    if (row.side === SIDE_DOWN) {
      current.shortCount += 1;
      current.shortWei += amount;
    } else {
      current.longCount += 1;
      current.longWei += amount;
    }
    if (row.payout_wei) current.payoutWei += BigInt(row.payout_wei);
    if (row.winner_side !== null) current.winnerSide = row.winner_side;
    current.lastAt = Math.max(current.lastAt, row.created_at);
    byKey.set(key, current);
  }

  return [...byKey.values()]
    .sort((a, b) => b.lastAt - a.lastAt)
    .slice(0, HOLDER_ROW_LIMIT)
    .map((row) => {
      const settled = row.winnerSide !== null;
      const winner = row.winnerSide;
      const pnl = row.payoutWei - row.stakeWei;
      const unit = marketRow.bet_token;

      const won =
        settled &&
        ((winner === 0 && row.longWei > 0n) || (winner === SIDE_DOWN && row.shortWei > 0n));

      return {
        id: `${row.address}:${row.roundId}`,
        address: row.address,
        roundId: row.roundId,
        name: displayName({
          address: row.address,
          x_name: row.x_name,
          x_handle: row.x_handle,
        }),
        avatar: gradientFor(row.address),
        longCount: row.longCount,
        longAmount: `${formatAmount(row.longWei.toString())} ${unit}`,
        shortCount: row.shortCount,
        shortAmount: `${formatAmount(row.shortWei.toString())} ${unit}`,
        won,
        received: settled ? `${formatAmount(row.payoutWei.toString())} ${unit}` : undefined,
        pnl: settled ? formatPnl(pnl, unit) : undefined,
        followed: false,
      } satisfies Holder;
    });
}
/** 盈亏文本：四舍五入到 0 时不要显示 "-0"。 */
function formatPnl(pnl: bigint, unit: string): string {
  const abs = pnl < 0n ? -pnl : pnl;
  const text = formatAmount(abs.toString());
  if (text === "0") return `+0 ${unit}`;
  return `${pnl < 0n ? "-" : "+"}${text} ${unit}`;
}
