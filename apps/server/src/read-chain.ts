import type { Address } from "viem";
import { publicClient } from "./chain.ts";
import { ERC20_ABI, POOL_MARKET_ABI, SIDE_DOWN, SIDE_UP, SIDE_VOID } from "./contracts.ts";
import { HttpError } from "./http.ts";
import { findMarket, listMarkets, type MarketRow } from "./markets.ts";
import { requireMarket, type ChainConfig } from "./tx.ts";
import type { Db } from "./db.ts";

const TOKEN_DECIMALS = 18;

function toTokenUnits(wei: bigint): number {
  return Number(wei) / 10 ** TOKEN_DECIMALS;
}

/** 合约里的 anchorBlock：第 0 轮的起始块。 */
export async function anchorBlock(cfg: ChainConfig): Promise<number> {
  return Number(
    (await publicClient.readContract({
      address: requireMarket(cfg),
      abi: POOL_MARKET_ABI,
      functionName: "roundStart",
      args: [0n],
    })) as bigint,
  );
}

/** 前端传 startBlock，这里换成合约的 roundIndex。 */
export async function roundIndexFor(cfg: ChainConfig, roundStartBlock: number): Promise<number> {
  const anchor = await anchorBlock(cfg);
  const delta = roundStartBlock - anchor;
  if (delta < 0 || delta % 600 !== 0) {
    throw new HttpError(
      400,
      `roundStartBlock ${roundStartBlock} 不在轮次网格上（anchor=${anchor}，每轮 600 块）`,
    );
  }
  return delta / 600;
}

export function marketFor(db: Db, marketSymbol: string, betTokenSymbol: string): MarketRow {
  const row = findMarket(db, marketSymbol.toUpperCase(), betTokenSymbol.toUpperCase());
  if (!row) throw new HttpError(404, `未知市场：${marketSymbol}/${betTokenSymbol}`);
  return row;
}

export interface ChainPool {
  marketId: number;
  roundIndex: number;
  roundStartBlock: number;
  longAmount: number;
  shortAmount: number;
  longParticipants: number;
  shortParticipants: number;
  winner: "long" | "short" | null;
  settled: boolean;
  refund: boolean;
}

interface BetTxPayload {
  marketId?: number;
  roundIndex?: number;
  side?: number;
}

/** 参与者数没上链（合约只记金额），从 txs 表里数已确认的下注。 */
function participantsFor(
  db: Db,
  marketId: number,
  roundIndex: number,
): { long: number; short: number } {
  const rows = db
    .prepare("SELECT user_id, payload FROM txs WHERE kind = 'bet' AND status = 'confirmed'")
    .all() as Array<{ user_id: number | null; payload: string | null }>;

  const longUsers = new Set<number>();
  const shortUsers = new Set<number>();
  for (const row of rows) {
    if (!row.payload) continue;
    let payload: BetTxPayload;
    try {
      payload = JSON.parse(row.payload) as BetTxPayload;
    } catch {
      continue;
    }
    if (payload.marketId !== marketId || payload.roundIndex !== roundIndex) continue;
    const userId = row.user_id ?? -1;
    if (payload.side === SIDE_UP) longUsers.add(userId);
    else if (payload.side === SIDE_DOWN) shortUsers.add(userId);
  }
  return { long: longUsers.size, short: shortUsers.size };
}

export async function readPool(
  db: Db,
  cfg: ChainConfig,
  marketRow: MarketRow,
  roundIndex: number,
  anchor: number,
): Promise<ChainPool> {
  const [upAmount, downAmount, winnerRaw, settled] = (await publicClient.readContract({
    address: requireMarket(cfg),
    abi: POOL_MARKET_ABI,
    functionName: "pools",
    args: [BigInt(roundIndex), marketRow.market_id],
  })) as readonly [bigint, bigint, number, boolean];

  const participants = participantsFor(db, marketRow.market_id, roundIndex);
  const refund = settled && (winnerRaw === SIDE_VOID || upAmount === 0n || downAmount === 0n);

  return {
    marketId: marketRow.market_id,
    roundIndex,
    roundStartBlock: anchor + roundIndex * 600,
    longAmount: toTokenUnits(upAmount),
    shortAmount: toTokenUnits(downAmount),
    longParticipants: participants.long,
    shortParticipants: participants.short,
    winner: !settled || refund ? null : winnerRaw === SIDE_UP ? "long" : "short",
    settled,
    refund,
  };
}

export interface ChainMyBet {
  count: number;
  amount: number;
  longCount: number;
  longAmount: number;
  shortCount: number;
  shortAmount: number;
  settled: boolean;
  refund: boolean;
  winner: "long" | "short" | null;
  claimable: number;
  claimed: boolean;
}

async function countFor(
  db: Db,
  marketId: number,
  roundIndex: number,
  userId: number | null,
): Promise<{ long: number; short: number }> {
  if (userId === null) return { long: 0, short: 0 };

  const rows = db
    .prepare(
      "SELECT payload FROM txs WHERE kind = 'bet' AND status = 'confirmed' AND user_id = ?",
    )
    .all(userId) as Array<{ payload: string | null }>;

  let long = 0;
  let short = 0;
  for (const row of rows) {
    if (!row.payload) continue;
    try {
      const payload = JSON.parse(row.payload) as BetTxPayload;
      if (payload.marketId !== marketId || payload.roundIndex !== roundIndex) continue;
      if (payload.side === SIDE_UP) long += 1;
      else if (payload.side === SIDE_DOWN) short += 1;
    } catch {
      // 坏数据忽略
    }
  }
  return { long, short };
}

export async function readMyBet(
  db: Db,
  cfg: ChainConfig,
  address: string,
  marketRow: MarketRow,
  roundIndex: number,
): Promise<ChainMyBet> {
  const market = requireMarket(cfg);
  const user = db
    .prepare("SELECT id, address FROM users WHERE LOWER(address) = LOWER(?)")
    .get(address) as { id: number; address: Address } | undefined;
  const holder = (user?.address ?? address) as Address;

  const [up, down] = (await publicClient.readContract({
    address: market,
    abi: POOL_MARKET_ABI,
    functionName: "stakeOf",
    args: [marketRow.market_id, BigInt(roundIndex), holder],
  })) as readonly [bigint, bigint];

  const [upPool, downPool, winnerRaw, settled] = (await publicClient.readContract({
    address: market,
    abi: POOL_MARKET_ABI,
    functionName: "pools",
    args: [BigInt(roundIndex), marketRow.market_id],
  })) as readonly [bigint, bigint, number, boolean];

  const counts = await countFor(db, marketRow.market_id, roundIndex, user?.id ?? null);
  const refund = settled && (winnerRaw === SIDE_VOID || upPool === 0n || downPool === 0n);

  let claimable = 0;
  let claimed = false;
  if (settled && (up > 0n || down > 0n)) {
    const preview = (await publicClient.readContract({
      address: market,
      abi: POOL_MARKET_ABI,
      functionName: "previewClaim",
      args: [marketRow.market_id, BigInt(roundIndex), holder],
    })) as bigint;
    claimable = toTokenUnits(preview);
    claimed = (await publicClient.readContract({
      address: market,
      abi: POOL_MARKET_ABI,
      functionName: "claimed",
      args: [BigInt(roundIndex), marketRow.market_id, holder],
    })) as boolean;
  }

  return {
    count: counts.long + counts.short,
    amount: toTokenUnits(up + down),
    longCount: counts.long,
    longAmount: toTokenUnits(up),
    shortCount: counts.short,
    shortAmount: toTokenUnits(down),
    settled,
    refund,
    winner: !settled || refund ? null : winnerRaw === SIDE_UP ? "long" : "short",
    claimable,
    claimed,
  };
}

export interface WalletSnapshot {
  address: string;
  native: number;
  tokens: Array<{ symbol: string; balance: number; tokenAddress: string }>;
}

export async function readWallet(cfg: ChainConfig, address: string): Promise<WalletSnapshot> {
  const tokens: WalletSnapshot["tokens"] = [];
  const seen = new Set<string>();

  for (const [symbol, tokenAddress] of Object.entries(cfg.tokens)) {
    if (!tokenAddress) continue;
    const key = tokenAddress.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const balance = (await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address as Address],
    })) as bigint;

    tokens.push({ symbol, balance: toTokenUnits(balance), tokenAddress });
  }

  const native = Number(await publicClient.getBalance({ address: address as Address })) / 1e18;
  return { address, native, tokens };
}

export interface ChainHolding {
  id: string;
  marketSymbol: string;
  betTokenSymbol: string;
  amount: number;
  time: string;
  roundOffset: number;
  roundStartBlock: number;
}

/** 我的持仓：只返回还活着的轮（当前轮 + 上一轮待开奖），已开奖的不再列。 */
export async function readHoldings(
  db: Db,
  cfg: ChainConfig,
  address: string,
): Promise<ChainHolding[]> {
  const market = requireMarket(cfg);
  const anchor = await anchorBlock(cfg);
  const currentRound = Number(
    (await publicClient.readContract({
      address: market,
      abi: POOL_MARKET_ABI,
      functionName: "currentRound",
    })) as bigint,
  );

  const user = db
    .prepare("SELECT address FROM users WHERE LOWER(address) = LOWER(?)")
    .get(address) as { address: Address } | undefined;
  const holder = (user?.address ?? address) as Address;

  const live: Array<{ roundIndex: number; roundOffset: number }> = [{ roundIndex: currentRound, roundOffset: 0 }];
  if (currentRound > 0) live.push({ roundIndex: currentRound - 1, roundOffset: -1 });

  const rows: ChainHolding[] = [];
  for (const row of listMarkets(db)) {
    for (const { roundIndex, roundOffset } of live) {
      // 已结算的轮不再算「持仓」：要领取的去「我的下注」里领。
      const [, , , settled] = (await publicClient.readContract({
        address: market,
        abi: POOL_MARKET_ABI,
        functionName: "pools",
        args: [BigInt(roundIndex), row.market_id],
      })) as readonly [bigint, bigint, number, boolean];
      if (settled) continue;

      const [up, down] = (await publicClient.readContract({
        address: market,
        abi: POOL_MARKET_ABI,
        functionName: "stakeOf",
        args: [row.market_id, BigInt(roundIndex), holder],
      })) as readonly [bigint, bigint];

      if (up + down === 0n) continue;
      rows.push({
        id: `${row.market_id}-${roundIndex}`,
        marketSymbol: row.symbol,
        betTokenSymbol: row.bet_token,
        amount: toTokenUnits(up + down),
        time: new Date().toISOString(),
        roundOffset,
        roundStartBlock: anchor + roundIndex * 600,
      });
    }
  }

  return rows;
}