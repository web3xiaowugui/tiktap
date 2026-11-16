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
 * Every screen talks to this module only. All of it is now served by
 * `apps/server` over `/api` (同一份 mock 数据在后端生成)。
 */

const API_BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...init,
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`响应不是合法 JSON（HTTP ${response.status}）`);
    }
  }

  if (!response.ok) {
    const message =
      (payload as { message?: string } | null)?.message ?? `请求失败（HTTP ${response.status}）`;
    throw new Error(message);
  }

  return payload as T;
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export async function getTokens(): Promise<Token[]> {
  return request<Token[]>("/tokens");
}

export async function getToken(symbol: string): Promise<Token> {
  return request<Token>(`/tokens/${encodeURIComponent(symbol)}`);
}

export async function getBetTokens(): Promise<BetToken[]> {
  return request<BetToken[]>("/bet-tokens");
}

export async function getSidebarMenu(): Promise<SidebarMenu> {
  return request<SidebarMenu>("/sidebar-menu");
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  return request<LeaderboardEntry[]>("/leaderboard");
}

export async function getBetPool(
  marketSymbol: string,
  betTokenSymbol: string,
  roundStartBlock: number,
): Promise<BetPool> {
  return request<BetPool>(
    `/pools${query({ market: marketSymbol, token: betTokenSymbol, round: roundStartBlock })}`,
  );
}

export async function getMyBet(
  marketSymbol: string,
  betTokenSymbol: string,
  roundStartBlock: number,
): Promise<MyBet | null> {
  return request<MyBet | null>(
    `/my-bet${query({ market: marketSymbol, token: betTokenSymbol, round: roundStartBlock })}`,
  );
}

export async function getBetQuickAmounts(symbol: string): Promise<number[]> {
  return request<number[]>(`/quick-amounts/${encodeURIComponent(symbol)}`);
}

export async function saveBetQuickAmounts(
  symbol: string,
  amounts: number[],
): Promise<number[]> {
  return request<number[]>(`/quick-amounts/${encodeURIComponent(symbol)}`, {
    method: "PUT",
    body: JSON.stringify({ amounts }),
  });
}

export async function getCandles(
  symbol: string,
  timeframe: Timeframe,
): Promise<Candle[]> {
  return request<Candle[]>(`/candles${query({ symbol, timeframe })}`);
}

export async function getHolders(symbol: string, roundStartBlock?: number): Promise<Holder[]> {
  return request<Holder[]>(`/holders${query({ symbol, round: roundStartBlock })}`);
}

export async function getFeed(symbol: string, roundStartBlock?: number): Promise<FeedItem[]> {
  return request<FeedItem[]>(`/feed${query({ symbol, round: roundStartBlock })}`);
}

export async function getMarketActivity(
  symbol: string,
  roundStartBlock?: number,
): Promise<MarketActivity[]> {
  return request<MarketActivity[]>(`/activity${query({ symbol, round: roundStartBlock })}`);
}

export async function getHoldings(): Promise<BetHolding[]> {
  return request<BetHolding[]>("/holdings");
}

export async function getProfile(handle: string): Promise<Profile> {
  return request<Profile>(`/profiles/${encodeURIComponent(handle)}`);
}

export async function getPositions(handle: string): Promise<Position[]> {
  return request<Position[]>(`/profiles/${encodeURIComponent(handle)}/positions`);
}

export async function getActivity(handle: string): Promise<Activity[]> {
  return request<Activity[]>(`/profiles/${encodeURIComponent(handle)}/activity`);
}

export async function getEquityCurve(handle: string, range: Range): Promise<EquityPoint[]> {
  return request<EquityPoint[]>(
    `/profiles/${encodeURIComponent(handle)}/equity${query({ range })}`,
  );
}

export async function signInWithOkx(address: string, chainId?: string): Promise<AuthUser> {
  return request<AuthUser>("/auth/okx", {
    method: "POST",
    body: JSON.stringify({ address, chainId }),
  });
}

export async function signInAsDemo(): Promise<AuthUser> {
  return request<AuthUser>("/auth/demo", { method: "POST", body: "{}" });
}

export async function signOut(): Promise<void> {
  await request<{ ok: boolean }>("/auth/signout", { method: "POST", body: "{}" });
}

/** Live TradingView chart data：后端代理 OKX 公共接口（1m 只有一种）。 */
export type LiveTimeframe = "1m";

export async function getLiveCandles(
  symbol: string,
  timeframe: LiveTimeframe = "1m",
  limit?: number,
): Promise<Candle[]> {
  return request<Candle[]>(`/live-candles${query({ symbol, timeframe, limit })}`);
}
