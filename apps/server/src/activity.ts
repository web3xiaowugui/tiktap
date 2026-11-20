import type { Db } from "./db.ts";
import { currentEnv } from "./runtime.ts";
import type { MarketRow } from "./markets.ts";
import { SIDE_DOWN, SIDE_UP } from "./contracts.ts";
import type { MarketActivity } from "../../../packages/shared/src/api-types.ts";

/**
 * 某一轮、某个市场（标的 + 下注代币）的活动流，全部来自本地库：
 *   bet    —— bets 表（逐笔，不合并）
 *   settle —— txs(kind='settle')，开奖结果
 *   claim  —— txs(kind='claim')，自动领奖
 * 按时间倒序，最多 100 条。
 */

const GRADIENTS = [
  "linear-gradient(135deg,#f97316,#7c2d12)",
  "linear-gradient(135deg,#38bdf8,#0c4a6e)",
  "linear-gradient(135deg,#a78bfa,#4c1d95)",
  "linear-gradient(135deg,#34d399,#065f46)",
  "linear-gradient(135deg,#fb7185,#881337)",
  "linear-gradient(135deg,#facc15,#713f12)",
  "linear-gradient(135deg,#22d3ee,#155e75)",
  "linear-gradient(135deg,#e879f9,#701a75)",
];

/** 地址决定渐变，同一个人头像稳定。 */
export function gradientFor(address: string): string {
  let hash = 0;
  for (let i = 2; i < address.length; i += 1) {
    hash = (hash * 31 + address.charCodeAt(i)) >>> 0;
  }
  return GRADIENTS[hash % GRADIENTS.length];
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** wei → 人类可读数量（最多 2 位小数，去掉多余的 0）。 */
export function formatAmount(amountWei: string): string {
  const value = Number(amountWei) / 1e18;
  if (!Number.isFinite(value)) return "0";
  const fixed = value.toFixed(2).replace(/\.?0+$/, "");
  return fixed === "" ? "0" : fixed;
}

export function relativeTime(timestamp: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时`;
  return `${Math.floor(hours / 24)}天`;
}

export function displayName(row: {
  address: string;
  x_name: string | null;
  x_handle: string | null;
}): string {
  if (row.x_name && row.x_name.trim()) return row.x_name.trim();
  if (row.x_handle && row.x_handle.trim()) return `@${row.x_handle.trim()}`;
  return shortAddress(row.address);
}

interface BetRow {
  address: string;
  side: number;
  amount_wei: string;
  bet_token: string;
  round_id: number;
  created_at: number;
  tx_hash: string;
  x_name: string | null;
  x_handle: string | null;
}

interface TxRow {
  tx_hash: string;
  created_at: number;
  payload: string | null;
  address: string | null;
  x_name: string | null;
  x_handle: string | null;
}

interface Payload {
  marketId?: number;
  roundIndex?: number;
  winner?: number;
  amountWei?: string;
}

function parsePayload(payload: string | null): Payload {
  if (!payload) return {};
  try {
    return JSON.parse(payload) as Payload;
  } catch {
    return {};
  }
}

export function readMarketActivity(
  db: Db,
  marketRow: MarketRow,
  _roundIndex?: number,
): MarketActivity[] {
  const entries: Array<{ at: number; item: MarketActivity }> = [];

  const bets = db
    .prepare(
      "SELECT b.address, b.side, b.amount_wei, b.bet_token, b.round_id, b.created_at, b.tx_hash, " +
        "u.x_name, u.x_handle " +
        "FROM bets b LEFT JOIN users u ON u.id = b.user_id " +
        "WHERE b.env = ? AND b.market_id = ? " +
        "ORDER BY b.created_at DESC LIMIT 150",
    )
    .all(currentEnv(), marketRow.market_id) as unknown as BetRow[];

  for (const bet of bets) {
    entries.push({
      at: bet.created_at,
      item: {
        id: `bet:${bet.tx_hash}`,
        kind: "bet",
        name: displayName(bet),
        address: bet.address,
        avatar: gradientFor(bet.address),
        side: bet.side === SIDE_DOWN ? "short" : "long",
        amount: `${formatAmount(bet.amount_wei)} ${bet.bet_token}`,
        time: relativeTime(bet.created_at),
        txHash: bet.tx_hash,
        followed: false,
        roundIndex: bet.round_id,
      },
    });
  }

  const settleTx = db
    .prepare(
      "SELECT t.tx_hash, t.created_at, t.payload, u.address, u.x_name, u.x_handle " +
        "FROM txs t LEFT JOIN users u ON u.id = t.user_id " +
        "WHERE t.env = ? AND t.kind = 'settle' AND t.status = 'confirmed' " +
        "ORDER BY t.created_at DESC LIMIT 200",
    )
    .all(currentEnv()) as unknown as TxRow[];

  for (const tx of settleTx) {
    const payload = parsePayload(tx.payload);
    if (payload.marketId !== marketRow.market_id) continue;
    if (typeof payload.roundIndex !== "number") continue;
    if (payload.winner === undefined) continue;

    const winner = Number(payload.winner);
    entries.push({
      at: tx.created_at,
      item: {
        id: `settle:${tx.tx_hash}`,
        kind: "settle",
        name: "系统结算",
        avatar: "linear-gradient(135deg,#6f5cf5,#312e81)",
        side: winner === SIDE_UP ? "long" : winner === SIDE_DOWN ? "short" : null,
        amount: "",
        time: relativeTime(tx.created_at),
        txHash: tx.tx_hash,
        followed: false,
        roundIndex: payload.roundIndex,
      },
    });
  }

  const claimTx = db
    .prepare(
      "SELECT t.tx_hash, t.created_at, t.payload, u.address, u.x_name, u.x_handle " +
        "FROM txs t LEFT JOIN users u ON u.id = t.user_id " +
        "WHERE t.env = ? AND t.kind = 'claim' AND t.status = 'confirmed' " +
        "ORDER BY t.created_at DESC LIMIT 200",
    )
    .all(currentEnv()) as unknown as TxRow[];

  for (const tx of claimTx) {
    const payload = parsePayload(tx.payload);
    if (payload.marketId !== marketRow.market_id) continue;
    if (typeof payload.roundIndex !== "number") continue;
    if (!tx.address) continue;

    entries.push({
      at: tx.created_at,
      item: {
        id: `claim:${tx.tx_hash}`,
        kind: "claim",
        name: displayName({
          address: tx.address,
          x_name: tx.x_name,
          x_handle: tx.x_handle,
        }),
        address: tx.address,
        avatar: gradientFor(tx.address),
        side: null,
        amount: payload.amountWei
          ? `${formatAmount(payload.amountWei)} ${marketRow.bet_token}`
          : "",
        time: relativeTime(tx.created_at),
        txHash: tx.tx_hash,
        followed: false,
        roundIndex: payload.roundIndex,
      },
    });
  }

  return entries
    .sort((a, b) => b.at - a.at)
    .slice(0, 100)
    .map((entry) => entry.item);
}
