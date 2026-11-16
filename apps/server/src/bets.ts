import type { Db } from "./db.ts";

/**
 * 用户下注记录（结构化版本，链上仍是最终真相）。
 *
 * 一笔 bet = 一行：下单时写入，结算时回填涨跌结果和两个价格，
 * 领奖时回填领取时间/tx。金额都用 TEXT 存最小单位十进制，避免 JS 精度问题。
 */

export interface BetRowInput {
  userId: number;
  address: string;
  marketId: number;
  symbol: string;
  betToken: string;
  roundId: number;
  side: number;
  amountWei: string;
  /** 下注手续费；仓位 = amountWei - feeWei。 */
  feeWei?: string;
  txHash: string;
  status: "confirmed" | "failed";
}

export function recordBet(db: Db, input: BetRowInput): void {
  db.prepare(
    "INSERT INTO bets (user_id, address, market_id, symbol, bet_token, round_id, side, amount_wei, fee_wei, tx_hash, status, created_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(tx_hash) DO UPDATE SET status = excluded.status",
  ).run(
    input.userId,
    input.address.toLowerCase(),
    input.marketId,
    input.symbol.toUpperCase(),
    input.betToken.toUpperCase(),
    input.roundId,
    input.side,
    input.amountWei,
    input.feeWei ?? "0",
    input.txHash,
    input.status,
    Date.now(),
  );
}

export interface SettlementInput {
  winnerSide: number;
  /** 锁定价格（轮首价），没有就留空。 */
  lockPrice?: number | null;
  /** 开奖价格（轮末价），没有就留空。 */
  settlePrice?: number | null;
  /** 本轮该市场两边总下注额（最小单位），用于算每笔应得的派奖。 */
  upWei: string;
  downWei: string;
  /** 结算时快照的领奖费率（bps），缺省按 0。 */
  claimFeeBps?: number;
}

/**
 * 结算后回填这一轮该市场的所有下注记录：
 * 赢的那一边按「总池 / 赢方总额」比例算每笔 payout，输的记 0。
 * 仓位用扣除下注费后的净额；派奖再扣掉结算时快照的领奖费（退款轮不收）。
 */
export function applySettlement(
  db: Db,
  marketId: number,
  roundId: number,
  input: SettlementInput,
): void {
  const rows = db
    .prepare(
      "SELECT id, side, amount_wei, fee_wei FROM bets WHERE market_id = ? AND round_id = ?",
    )
    .all(marketId, roundId) as Array<{
    id: number;
    side: number;
    amount_wei: string;
    fee_wei: string | null;
  }>;

  const upWei = BigInt(input.upWei);
  const downWei = BigInt(input.downWei);
  const pot = upWei + downWei;
  const winWei = input.winnerSide === 0 ? upWei : downWei;
  const isRefund = input.winnerSide === 2 || upWei === 0n || downWei === 0n;
  const claimFeeBps = BigInt(input.claimFeeBps ?? 0);

  const update = db.prepare(
    "UPDATE bets SET winner_side = ?, lock_price = ?, settle_price = ?, settled_at = ?, payout_wei = ? WHERE id = ?",
  );
  const now = Date.now();

  for (const row of rows) {
    const stake = BigInt(row.amount_wei) - BigInt(row.fee_wei ?? "0");
    const won = row.side === input.winnerSide;
    // 退款轮按净仓位原额退回，和合约保持一致。
    const gross = isRefund ? stake : won && winWei > 0n ? (pot * stake) / winWei : 0n;
    const payout = isRefund ? gross : gross - (gross * claimFeeBps) / 10_000n;
    update.run(
      input.winnerSide,
      input.lockPrice == null ? null : input.lockPrice.toFixed(10),
      input.settlePrice == null ? null : input.settlePrice.toFixed(10),
      now,
      payout.toString(),
      row.id,
    );
  }
}

/** 领奖成功后把这轮该地址的下注记录标记为已领取。 */
export function applyClaim(
  db: Db,
  marketId: number,
  roundId: number,
  address: string,
  txHash: string,
): void {
  db.prepare(
    "UPDATE bets SET claimed_at = ?, claim_tx_hash = ? " +
      "WHERE market_id = ? AND round_id = ? AND address = ? AND claimed_at IS NULL",
  ).run(Date.now(), txHash, marketId, roundId, address.toLowerCase());
}

export interface BetRow {
  id: number;
  user_id: number;
  address: string;
  market_id: number;
  symbol: string;
  bet_token: string;
  round_id: number;
  side: number;
  amount_wei: string;
  fee_wei: string | null;
  tx_hash: string;
  status: string;
  winner_side: number | null;
  lock_price: string | null;
  settle_price: string | null;
  payout_wei: string | null;
  claimed_at: number | null;
  claim_tx_hash: string | null;
  created_at: number;
  settled_at: number | null;
}

/** 查下注记录（按用户 id 或地址），默认最近 100 条。 */
export function listBets(
  db: Db,
  filter: { userId?: number; address?: string; limit?: number },
): BetRow[] {
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
  const where: string[] = [];
  if (filter.userId !== undefined) where.push("user_id = ?");
  if (filter.address) where.push("address = ?");
  const clause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  return db
    .prepare(
      `SELECT id, user_id, address, market_id, symbol, bet_token, round_id, side, amount_wei, fee_wei,
              tx_hash, status, winner_side, lock_price, settle_price, payout_wei,
              claimed_at, claim_tx_hash, created_at, settled_at
       FROM bets ${clause} ORDER BY id DESC LIMIT ${limit}`,
    )
    .all(
      ...(filter.userId !== undefined ? [filter.userId] : []),
      ...(filter.address ? [filter.address.toLowerCase()] : []),
    ) as unknown as BetRow[];
}
/**
 * 老库回填：以前只把下注写在 txs.payload 里，启动时把这批补进 bets（幂等）。
 */
export function backfillBetsFromTxs(db: Db): number {
  const rows = db
    .prepare(
      "SELECT t.user_id, t.tx_hash, t.status, t.payload, u.address " +
        "FROM txs t LEFT JOIN users u ON u.id = t.user_id " +
        "WHERE t.kind = 'bet' AND u.address IS NOT NULL " +
        "AND NOT EXISTS (SELECT 1 FROM bets b WHERE b.tx_hash = t.tx_hash)",
    )
    .all() as Array<{
    user_id: number;
    tx_hash: string;
    status: string;
    payload: string | null;
    address: string;
  }>;

  let inserted = 0;
  for (const row of rows) {
    if (!row.payload) continue;
    let parsed: { marketId?: number; roundIndex?: number; side?: number; amountWei?: string };
    try {
      parsed = JSON.parse(row.payload) as typeof parsed;
    } catch {
      continue;
    }
    if (parsed.marketId === undefined || parsed.roundIndex === undefined) continue;

    const market = db
      .prepare("SELECT symbol, bet_token FROM markets WHERE market_id = ?")
      .get(parsed.marketId) as
      | { symbol: string; bet_token: string }
      | undefined;
    if (!market) continue;

    recordBet(db, {
      userId: row.user_id,
      address: row.address,
      marketId: parsed.marketId,
      symbol: market.symbol,
      betToken: market.bet_token,
      roundId: parsed.roundIndex,
      side: parsed.side ?? 0,
      amountWei: parsed.amountWei ?? "0",
      txHash: row.tx_hash,
      status: row.status === "confirmed" ? "confirmed" : "failed",
    });
    inserted += 1;
  }
  return inserted;
}
