import {
  activityFor,
  betPoolFor,
  BET_QUICK_AMOUNTS,
  BET_TOKENS,
  DEMO_PROFILE,
  feedFor,
  holdersFor,
  LEADERBOARD,
  makeCandles,
  makeEquity,
  marketActivityFor,
  MY_HOLDINGS,
  myBetFor,
  positionsFor,
  profileFor,
  SIDEBAR_MENU,
  TOKENS,
} from "./mockData";
import type {
  Activity,
  AuthUser,
  BetHolding,
  BetPool,
  BetToken,
  Candle,
  EquityPoint,
  FeedItem,
  Holder,
  LeaderboardEntry,
  MarketActivity,
  MyBet,
  Position,
  Profile,
  Range,
  SidebarMenu,
  Timeframe,
  Token,
} from "./types";

/**
 * Every screen talks to this module only. The functions are shaped like real
 * HTTP endpoints, but resolve against the fixtures in `mockData.ts` — swap the
 * bodies for `fetch()` calls later without touching the UI.
 */

const LATENCY = 240;

function wait(ms = LATENCY): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function respond<T>(data: T, ms = LATENCY): Promise<T> {
  await wait(ms);
  return structuredClone(data);
}

const QUICK_AMOUNTS_STORAGE_KEY = "fomo.demo.quickAmounts.v2";
const FALLBACK_QUICK_AMOUNTS = [0.1, 0.5, 1, 2, 3];

function readQuickAmountsStore(): Record<string, number[]> {
  const store: Record<string, number[]> = Object.fromEntries(
    Object.entries(BET_QUICK_AMOUNTS).map(([symbol, amounts]) => [symbol, [...amounts]]),
  );

  if (typeof window === "undefined") return store;

  try {
    const raw = window.localStorage.getItem(QUICK_AMOUNTS_STORAGE_KEY);
    if (!raw) return store;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return store;

    for (const [symbol, amounts] of Object.entries(parsed)) {
      if (
        Array.isArray(amounts) &&
        amounts.length === 5 &&
        amounts.every((value) => typeof value === "number" && Number.isFinite(value) && value > 0)
      ) {
        store[symbol] = amounts;
      }
    }
  } catch {
    // Ignore malformed local storage and fall back to the fixtures.
  }

  return store;
}

let quickAmountsStore = readQuickAmountsStore();

function persistQuickAmounts(): void {
  try {
    window.localStorage.setItem(QUICK_AMOUNTS_STORAGE_KEY, JSON.stringify(quickAmountsStore));
  } catch {
    // The mock still works for the current session if storage is unavailable.
  }
}

function requireToken(symbol: string): Token {
  const token = TOKENS.find((entry) => entry.symbol === symbol);
  if (!token) throw new Error(`未知交易对：${symbol}`);
  return token;
}

export async function getTokens(): Promise<Token[]> {
  return respond(TOKENS, 160);
}

export async function getBetTokens(): Promise<BetToken[]> {
  return respond(BET_TOKENS, 140);
}

export async function getBetPool(
  marketSymbol: string,
  betTokenSymbol: string,
  roundStartBlock: number,
): Promise<BetPool> {
  const market = marketSymbol.toUpperCase();
  requireToken(market);
  if (!BET_TOKENS.some((token) => token.symbol === betTokenSymbol)) {
    throw new Error(`未知下注代币：${betTokenSymbol}`);
  }

  const pool = betPoolFor(market, betTokenSymbol, roundStartBlock);
  if (!pool) {
    throw new Error(
      `暂无 ${market} / ${betTokenSymbol} / ${roundStartBlock} 的池子数据`,
    );
  }

  return respond(
    {
      marketSymbol: market,
      betTokenSymbol,
      roundStartBlock,
      ...pool,
    },
    180,
  );
}

/** Synchronous snapshot used where a round's pool must be known immediately. */
export function getBetPoolSnapshot(
  marketSymbol: string,
  betTokenSymbol: string,
  roundStartBlock: number,
): BetPool | null {
  const market = marketSymbol.toUpperCase();
  if (!TOKENS.some((entry) => entry.symbol === market)) return null;
  if (!BET_TOKENS.some((token) => token.symbol === betTokenSymbol)) return null;

  const pool = betPoolFor(market, betTokenSymbol, roundStartBlock);
  if (!pool) return null;

  return {
    marketSymbol: market,
    betTokenSymbol,
    roundStartBlock,
    ...pool,
  };
}

export async function getMyBet(
  marketSymbol: string,
  betTokenSymbol: string,
  roundStartBlock: number,
): Promise<MyBet | null> {
  const market = marketSymbol.toUpperCase();
  requireToken(market);
  if (!BET_TOKENS.some((token) => token.symbol === betTokenSymbol)) {
    throw new Error(`未知下注代币：${betTokenSymbol}`);
  }

  return respond(myBetFor(market, betTokenSymbol, roundStartBlock), 160);
}

export async function getBetQuickAmounts(symbol: string): Promise<number[]> {
  const amounts = quickAmountsStore[symbol] ?? FALLBACK_QUICK_AMOUNTS;
  return respond([...amounts], 120);
}

export async function saveBetQuickAmounts(
  symbol: string,
  amounts: number[],
): Promise<number[]> {
  const next = amounts.map((value) => Math.round(Number(value) * 100) / 100);
  if (next.length !== 5 || next.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("快捷金额需要 5 个大于 0 的数字");
  }

  quickAmountsStore = { ...quickAmountsStore, [symbol]: next };
  persistQuickAmounts();
  return respond([...next], 220);
}

export async function getSidebarMenu(): Promise<SidebarMenu> {
  return respond(SIDEBAR_MENU, 100);
}

export async function getToken(symbol: string): Promise<Token> {
  return respond(requireToken(symbol), 120);
}

export async function getCandles(
  symbol: string,
  timeframe: Timeframe,
): Promise<Candle[]> {
  const token = requireToken(symbol);
  return respond(makeCandles(token, timeframe), 200);
}

export async function getHolders(
  symbol: string,
  roundStartBlock?: number,
): Promise<Holder[]> {
  return respond(holdersFor(symbol, roundStartBlock), 220);
}

export async function getFeed(
  symbol: string,
  roundStartBlock?: number,
): Promise<FeedItem[]> {
  return respond(feedFor(symbol, roundStartBlock), 220);
}

export async function getMarketActivity(
  symbol: string,
  roundStartBlock?: number,
): Promise<MarketActivity[]> {
  return respond(marketActivityFor(symbol, roundStartBlock), 200);
}

/** The demo account's placed bets, newest first. */
export async function getHoldings(): Promise<BetHolding[]> {
  return respond(MY_HOLDINGS, 180);
}

export async function getProfile(handle: string): Promise<Profile> {
  return respond(profileFor(handle), 180);
}

export async function getPositions(handle: string): Promise<Position[]> {
  return respond(positionsFor(handle), 200);
}

export async function getActivity(handle: string): Promise<Activity[]> {
  return respond(activityFor(handle), 220);
}

export async function getEquityCurve(
  handle: string,
  range: Range,
): Promise<EquityPoint[]> {
  void handle;
  return respond(makeEquity(range), 220);
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  return respond(LEADERBOARD, 160);
}

export async function signInWithOkx(
  address: string,
  chainId?: string,
): Promise<AuthUser> {
  await wait(320);
  return {
    name: DEMO_PROFILE.name,
    handle: DEMO_PROFILE.handle,
    email: "",
    provider: "okx",
    address,
    chainId,
  };
}

export async function signInAsDemo(): Promise<AuthUser> {
  await wait(280);
  return {
    name: DEMO_PROFILE.name,
    handle: DEMO_PROFILE.handle,
    email: "end@tiktap.demo",
    provider: "demo",
  };
}

export async function signOut(): Promise<void> {
  await wait(180);
}

/** Live TradingView chart data (OKX public REST API, 1m only). */
export { getLiveCandles } from "./liveMarket";
export type { LiveTimeframe } from "./liveMarket";
