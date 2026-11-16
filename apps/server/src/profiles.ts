import type { Db } from "./db.ts";
import { BET_TOKENS } from "./data/mockData.ts";
import { displayName, formatAmount, gradientFor, relativeTime, shortAddress } from "./activity.ts";
import type {
  EquityPoint,
  Profile,
  ProfileEvent,
  ProfileRound,
  ProfileStats,
  Range,
  Side,
} from "../../../packages/shared/src/api-types.ts";

/**
 * 个人主页：全部从 bets 表现算，不维护汇总表。
 *
 * 聚合粒度是「地址 × 市场 × 轮次」——market = 标的 × 下注代币，各自结算、各自派奖，
 * BTC/TEST 和 BTC/OKB 必须分开算。金额是 TEXT 存的 wei（> 2^53），
 * 所以 SQL 里不做 SUM，统一取出来用 BigInt 聚合。
 *
 * bets 已经是事实表：结算回填 winner_side / payout_wei / settled_at，
 * 领奖回填 claimed_at。这里只做只读派生，不引入第二份真相。
 */

const RANGE_MS: Record<Range, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const PRICE_USD = new Map(BET_TOKENS.map((token) => [token.symbol, token.priceUsd]));

const SIDE_VOID = 2;

export interface ProfileUser {
  id: number;
  address: string;
  x_name: string | null;
  x_handle: string | null;
  created_at: number;
}

/** 按地址或 X handle 找人（都忽略大小写）。 */
export function findProfileUser(db: Db, handle: string): ProfileUser | undefined {
  return db
    .prepare(
      "SELECT id, address, x_name, x_handle, created_at FROM users " +
        "WHERE LOWER(address) = LOWER(?) OR LOWER(x_handle) = LOWER(?) LIMIT 1",
    )
    .get(handle, handle) as ProfileUser | undefined;
}

interface BetLite {
  id: number;
  market_id: number;
  symbol: string;
  bet_token: string;
  round_id: number;
  side: number;
  amount_wei: string;
  winner_side: number | null;
  payout_wei: string | null;
  claimed_at: number | null;
  claim_tx_hash: string | null;
  tx_hash: string;
  created_at: number;
  settled_at: number | null;
}

interface RoundGroup {
  id: string;
  marketId: number;
  symbol: string;
  betToken: string;
  roundId: number;
  amountWei: bigint;
  longWei: bigint;
  shortWei: bigint;
  payoutWei: bigint;
  bets: number;
  winnerSide: number | null;
  claimed: boolean;
  firstAt: number;
  settledAt: number | null;
}

function loadGroups(db: Db, address: string): RoundGroup[] {
  const rows = db
    .prepare(
      "SELECT id, market_id, symbol, bet_token, round_id, side, amount_wei, winner_side, " +
        "payout_wei, claimed_at, claim_tx_hash, tx_hash, created_at, settled_at " +
        "FROM bets WHERE address = ? AND status = 'confirmed' ORDER BY id",
    )
    .all(address.toLowerCase()) as unknown as BetLite[];

  const groups = new Map<string, RoundGroup>();
  for (const row of rows) {
    const key = `${row.market_id}:${row.round_id}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        id: key,
        marketId: row.market_id,
        symbol: row.symbol,
        betToken: row.bet_token,
        roundId: row.round_id,
        amountWei: 0n,
        longWei: 0n,
        shortWei: 0n,
        payoutWei: 0n,
        bets: 0,
        winnerSide: null,
        claimed: true,
        firstAt: row.created_at,
        settledAt: null,
      };
      groups.set(key, group);
    }

    const amount = BigInt(row.amount_wei || "0");
    const payout = BigInt(row.payout_wei || "0");
    group.amountWei += amount;
    if (row.side === 0) group.longWei += amount;
    else group.shortWei += amount;
    group.payoutWei += payout;
    group.bets += 1;
    group.firstAt = Math.min(group.firstAt, row.created_at);
    if (row.winner_side !== null) group.winnerSide = row.winner_side;
    if (row.settled_at !== null) {
      group.settledAt = Math.max(group.settledAt ?? 0, row.settled_at);
    }
    if (row.claimed_at === null) group.claimed = false;
  }

  return [...groups.values()];
}

/** 退款轮（SIDE_VOID）：本金原额退回，净盈亏记 0。 */
function isRefund(group: RoundGroup): boolean {
  return group.winnerSide === SIDE_VOID;
}

function netWei(group: RoundGroup): bigint {
  if (group.winnerSide === null) return 0n;
  if (isRefund(group)) return 0n;
  return group.payoutWei - group.amountWei;
}

function usd(wei: bigint, token: string): number {
  return Number(wei) / 1e18 * (PRICE_USD.get(token) ?? 1);
}

function amountText(wei: bigint, token: string): string {
  return `${formatAmount(wei.toString())} ${token}`;
}

function signedText(wei: bigint, token: string): string {
  const abs = wei < 0n ? -wei : wei;
  const text = formatAmount(abs.toString());
  // 合约逐笔取整会差几 wei，四舍五入后是 0 就别显示 "+0 / -0"
  if (text === "0") return `0 ${token}`;
  return `${wei >= 0n ? "+" : "-"}${text} ${token}`;
}

/** 小于 1 美分的差额按持平处理（逐笔取整的余数别算成输赢）。 */
const DRAW_USD = 0.01;

function sideOf(raw: number | null): Side | null {
  if (raw === 0) return "long";
  if (raw === 1) return "short";
  return null;
}

function toProfileRound(group: RoundGroup): ProfileRound {
  const settled = group.winnerSide !== null;
  const refund = isRefund(group);
  const pnl = netWei(group);
  const netUsd = usd(pnl, group.betToken);
  const draw = Math.abs(netUsd) < DRAW_USD;
  const won = settled && !refund && !draw ? netUsd > 0 : null;
  const status: ProfileRound["status"] = !settled
    ? "open"
    : refund
      ? "refunded"
      : group.claimed && group.payoutWei > 0n
        ? "claimed"
        : "settled";

  return {
    id: group.id,
    symbol: group.symbol,
    betToken: group.betToken,
    roundId: group.roundId,
    roundStartBlock: group.roundId * 300,
    amount: amountText(group.amountWei, group.betToken),
    longAmount: group.longWei > 0n ? amountText(group.longWei, group.betToken) : undefined,
    shortAmount: group.shortWei > 0n ? amountText(group.shortWei, group.betToken) : undefined,
    side: group.longWei > 0n && group.shortWei === 0n
      ? "long"
      : group.shortWei > 0n && group.longWei === 0n
        ? "short"
        : null,
    bets: group.bets,
    status,
    winner: sideOf(group.winnerSide),
    won,
    payout: settled ? amountText(group.payoutWei, group.betToken) : null,
    pnl: settled ? signedText(pnl, group.betToken) : null,
    createdAt: group.firstAt,
    settledAt: group.settledAt,
  };
}

export function readProfileStats(db: Db, address: string): ProfileStats {
  const groups = loadGroups(db, address);
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let open = 0;
  let volumeUsd = 0;
  let pnlUsd = 0;
  let bets = 0;

  for (const group of groups) {
    bets += group.bets;
    volumeUsd += usd(group.amountWei, group.betToken);

    if (group.winnerSide === null) {
      open += 1;
      continue;
    }
    if (isRefund(group)) continue;

    const net = usd(netWei(group), group.betToken);
    if (Math.abs(net) < DRAW_USD) {
      draws += 1;
      continue;
    }

    pnlUsd += net;
    if (net > 0) wins += 1;
    else losses += 1;
  }

  const settled = wins + losses;
  return {
    rounds: groups.length,
    bets,
    volumeUsd,
    pnlUsd,
    winRate: settled > 0 ? (wins / settled) * 100 : 0,
    wonRounds: wins,
    lostRounds: losses,
    drawRounds: draws,
    settledRounds: wins + losses + draws,
    openRounds: open,
  };
}

/** 参与轮次历史（已结算的在前，按结算/下注时间倒序）。 */
export function readProfileRounds(db: Db, address: string, limit = 100): ProfileRound[] {
  return loadGroups(db, address)
    .map(toProfileRound)
    .sort((a, b) => (b.settledAt ?? b.createdAt) - (a.settledAt ?? a.createdAt))
    .slice(0, Math.min(Math.max(limit, 1), 200));
}

/** 还活着的仓位：本轮下注中 / 上一轮待开奖。 */
export function readProfileOpenRounds(db: Db, address: string): ProfileRound[] {
  return loadGroups(db, address)
    .filter((group) => group.winnerSide === null)
    .map(toProfileRound)
    .sort((a, b) => b.roundId - a.roundId);
}

interface OpinionLite {
  id: number;
  symbol: string;
  bet_token: string;
  round_id: number | null;
  body: string;
  side: number | null;
  created_at: number;
}

/** 活动流：下注 / 开奖 / 自动领奖 / 发观点，按时间倒序。 */
export function readProfileEvents(db: Db, address: string, limit = 100): ProfileEvent[] {
  const groups = loadGroups(db, address);
  const events: ProfileEvent[] = [];

  for (const group of groups) {
    if (group.winnerSide !== null) {
      events.push({
        id: `settle-${group.id}`,
        kind: "settle",
        symbol: group.symbol,
        betToken: group.betToken,
        roundId: group.roundId,
        side: sideOf(group.winnerSide),
        amount: null,
        time: relativeTime(group.settledAt ?? group.firstAt),
        createdAt: group.settledAt ?? group.firstAt,
      });
    }
    if (group.claimed && group.payoutWei > 0n && group.settledAt !== null) {
      events.push({
        id: `claim-${group.id}`,
        kind: "claim",
        symbol: group.symbol,
        betToken: group.betToken,
        roundId: group.roundId,
        side: null,
        amount: amountText(group.payoutWei, group.betToken),
        time: relativeTime(group.settledAt),
        createdAt: group.settledAt,
      });
    }
  }

  const rows = db
    .prepare(
      "SELECT id, market_id, symbol, bet_token, round_id, side, amount_wei, tx_hash, created_at " +
        "FROM bets WHERE address = ? AND status = 'confirmed' ORDER BY id DESC",
    )
    .all(address.toLowerCase()) as Array<{
    id: number;
    symbol: string;
    bet_token: string;
    round_id: number;
    side: number;
    amount_wei: string;
    tx_hash: string;
    created_at: number;
  }>;

  for (const row of rows) {
    events.push({
      id: `bet-${row.id}`,
      kind: "bet",
      symbol: row.symbol,
      betToken: row.bet_token,
      roundId: row.round_id,
      side: sideOf(row.side),
      amount: `${formatAmount(row.amount_wei)} ${row.bet_token}`,
      time: relativeTime(row.created_at),
      createdAt: row.created_at,
      txHash: row.tx_hash,
    });
  }

  const opinions = db
    .prepare(
      "SELECT id, symbol, bet_token, round_id, body, side, created_at FROM opinions " +
        "WHERE address = ? ORDER BY id DESC",
    )
    .all(address.toLowerCase()) as unknown as OpinionLite[];

  for (const row of opinions) {
    events.push({
      id: `opinion-${row.id}`,
      kind: "opinion",
      symbol: row.symbol,
      betToken: row.bet_token,
      roundId: row.round_id,
      side: sideOf(row.side),
      amount: null,
      body: row.body,
      time: relativeTime(row.created_at),
      createdAt: row.created_at,
    });
  }

  return events
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, Math.min(Math.max(limit, 1), 200));
}

/** 区间内的累计已实现盈亏（USD），用于个人主页曲线。 */
export function readProfileEquity(db: Db, address: string, range: Range): EquityPoint[] {
  const since = Date.now() - RANGE_MS[range];
  const settled = loadGroups(db, address)
    .filter(
      (group) =>
        group.winnerSide !== null &&
        (group.settledAt ?? group.firstAt) >= since,
    )
    .sort((a, b) => (a.settledAt ?? a.firstAt) - (b.settledAt ?? b.firstAt));

  let cumulative = 0;
  const points: EquityPoint[] = [{ t: since, v: 0 }];
  for (const group of settled) {
    cumulative += isRefund(group) ? 0 : usd(netWei(group), group.betToken);
    points.push({ t: group.settledAt ?? group.firstAt, v: cumulative });
  }
  return points;
}

/** 组装个人主页资料；没有链上记录的用户由调用方给 mock 资料。 */
export function readProfile(db: Db, user: ProfileUser): Profile {
  const stats = readProfileStats(db, user.address);
  const badges: Profile["badges"] = [];
  if (stats.rounds > 0) badges.push({ label: "已入场", tone: "neutral" });
  if (stats.wonRounds >= 10) badges.push({ label: "十胜", tone: "gold" });
  if (stats.pnlUsd > 0) badges.push({ label: "盈利中", tone: "green" });

  const joined = new Date(user.created_at).toISOString().slice(0, 10);
  return {
    handle: user.x_handle ?? shortAddress(user.address),
    name: displayName(user),
    bio: "TikTap 二元彩池玩家",
    avatar: gradientFor(user.address),
    followers: "0",
    following: 0,
    mutual: 0,
    joined,
    badges,
    cash: 0,
    equity: stats.pnlUsd,
    equityChange24h: 0,
    equityChangePct: 0,
    rank: 0,
    address: user.address,
    stats,
  };
}
