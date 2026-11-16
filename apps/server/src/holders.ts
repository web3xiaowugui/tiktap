import type { Db } from "./db.ts";
import type { MarketRow } from "./markets.ts";
import { SIDE_DOWN } from "./contracts.ts";
import type { Holder } from "../../../packages/shared/src/api-types.ts";
import { displayName, formatAmount, gradientFor } from "./activity.ts";

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
  x_name: string | null;
  x_handle: string | null;
}

interface Aggregate {
  address: string;
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

export function readRoundHolders(
  db: Db,
  marketRow: MarketRow,
  roundIndex: number,
): Holder[] {
  const rows = db
    .prepare(
      "SELECT b.address, b.side, b.amount_wei, b.payout_wei, b.winner_side, b.created_at, " +
        "u.x_name, u.x_handle " +
        "FROM bets b LEFT JOIN users u ON u.id = b.user_id " +
        "WHERE b.market_id = ? AND b.round_id = ? " +
        "ORDER BY b.created_at DESC LIMIT 500",
    )
    .all(marketRow.market_id, roundIndex) as unknown as BetRow[];

  const byAddress = new Map<string, Aggregate>();

  for (const row of rows) {
    const current =
      byAddress.get(row.address) ??
      ({
        address: row.address,
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
    byAddress.set(row.address, current);
  }

  return [...byAddress.values()]
    .sort((a, b) => b.lastAt - a.lastAt)
    .map((row) => {
      const settled = row.winnerSide !== null;
      const winner = row.winnerSide;
      const pnl = row.payoutWei - row.stakeWei;
      const unit = marketRow.bet_token;

      const won =
        settled &&
        ((winner === 0 && row.longWei > 0n) || (winner === SIDE_DOWN && row.shortWei > 0n));

      return {
        id: row.address,
        address: row.address,
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
