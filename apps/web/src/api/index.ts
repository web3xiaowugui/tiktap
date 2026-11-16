import type {
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
  MarketOpinion,
  MyBet,
  Profile,
  ProfileEvent,
  ProfileRound,
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
  address?: string | null,
): Promise<MyBet | null> {
  return request<MyBet | null>(
    `/my-bet${query({
      market: marketSymbol,
      token: betTokenSymbol,
      round: roundStartBlock,
      address: address ?? undefined,
    })}`,
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

export async function getHolders(
  symbol: string,
  betToken: string,
  roundStartBlock?: number,
): Promise<Holder[]> {
  return request<Holder[]>(
    `/holders${query({ symbol, token: betToken, round: roundStartBlock })}`,
  );
}

export async function getOpinions(
  symbol: string,
  betToken?: string | null,
  limit = 50,
): Promise<MarketOpinion[]> {
  return request<MarketOpinion[]>(
    `/opinions${query({ symbol, token: betToken ?? undefined, limit })}`,
  );
}

export async function postOpinion(input: {
  address: string;
  market: string;
  betToken: string;
  body: string;
  side?: "long" | "short" | null;
}): Promise<MarketOpinion> {
  return request<MarketOpinion>("/opinions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getFeed(symbol: string, roundStartBlock?: number): Promise<FeedItem[]> {
  return request<FeedItem[]>(`/feed${query({ symbol, round: roundStartBlock })}`);
}

export async function getMarketActivity(
  symbol: string,
  betToken: string,
  roundStartBlock?: number,
): Promise<MarketActivity[]> {
  return request<MarketActivity[]>(
    `/activity${query({ symbol, token: betToken, round: roundStartBlock })}`,
  );
}

export async function getHoldings(address?: string | null): Promise<BetHolding[]> {
  return request<BetHolding[]>(`/holdings${query({ address: address ?? undefined })}`);
}

export async function getProfile(handle: string): Promise<Profile> {
  return request<Profile>(`/profiles/${encodeURIComponent(handle)}`);
}

/** 某轮的锁定价格 / 开奖价格（后端已落库，读不到就是 null）。 */
export async function getRoundPrice(symbol: string, roundStartBlock: number): Promise<{
  symbol: string;
  roundIndex: number;
  roundStartBlock: number;
  lockPrice: number | null;
  lockTime: number | null;
  settlePrice: number | null;
  settleTime: number | null;
  updatedAt: number | null;
}> {
  return request(
    `/round-price?symbol=${encodeURIComponent(symbol)}&round=${roundStartBlock}`,
  );
}

export async function getPositions(handle: string): Promise<ProfileRound[]> {
  return request<ProfileRound[]>(`/profiles/${encodeURIComponent(handle)}/positions`);
}

/** 参与过的轮次（已结算 + 未结算，按时间倒序）。 */
export async function getProfileRounds(
  handle: string,
  limit = 100,
): Promise<ProfileRound[]> {
  return request<ProfileRound[]>(
    `/profiles/${encodeURIComponent(handle)}/rounds${query({ limit })}`,
  );
}

export async function getActivity(handle: string, limit = 100): Promise<ProfileEvent[]> {
  return request<ProfileEvent[]>(
    `/profiles/${encodeURIComponent(handle)}/activity${query({ limit })}`,
  );
}

export async function getEquityCurve(
  handle: string,
  range: Range,
  token: string,
): Promise<EquityPoint[]> {
  return request<EquityPoint[]>(
    `/profiles/${encodeURIComponent(handle)}/equity${query({ range, token })}`,
  );
}

/** 当前轮次真值（链上）。 */
export async function getRound(): Promise<{
  blockNumber: number;
  currentRound: number;
  isBettingOpen: boolean;
  roundStartBlock: number;
  roundEndBlock: number;
  blocksLeftInWindow: number;
}> {
  return request("/round");
}

/** 建托管号：生成地址、入白名单、打 gas，返回地址。 */
export async function createUser(profile?: {
  xUserId?: string;
  handle?: string;
  name?: string;
}): Promise<{
  id: number;
  address: string;
  allowTxHash: string | null;
  fundedWei: string;
  warning?: string;
}> {
  return request("/users", {
    method: "POST",
    body: JSON.stringify(profile ?? {}),
  });
}

export async function getUser(address: string): Promise<{ id: number; address: string } | null> {
  try {
    return await request(`/users/${encodeURIComponent(address)}`);
  } catch {
    return null;
  }
}

/** 链上余额（原生币 + 各下注代币）。 */
export async function getWallet(address: string): Promise<{
  address: string;
  native: number;
  tokens: Array<{ symbol: string; balance: number; tokenAddress: string }>;
}> {
  return request(`/wallet/${encodeURIComponent(address)}`);
}

export async function placeBet(input: {
  address: string;
  market: string;
  betToken: string;
  side: "long" | "short";
  amount: string;
}): Promise<{
  txHash: string;
  marketId: number;
  roundIndex: number;
  side: number;
  amountWei: string;
  status: string;
  approveTxHash: string | null;
}> {
  return request("/bet", { method: "POST", body: JSON.stringify(input) });
}

export async function claimBet(input: {
  address: string;
  market: string;
  betToken: string;
  roundIndex: number;
}): Promise<{ txHash: string; marketId: number; roundIndex: number; amountWei: string }> {
  return request("/claim", { method: "POST", body: JSON.stringify(input) });
}

export async function faucet(input: {
  address: string;
  betToken: string;
  amount: string;
}): Promise<{ txHash: string; amountWei: string }> {
  return request("/faucet", { method: "POST", body: JSON.stringify(input) });
}

/** 拿 X 授权页地址（state + PKCE 在服务端生成）。 */
export async function startXOAuth(returnTo = "/discover"): Promise<string> {
  const result = await request<{ url: string }>(
    `/auth/x/start?returnTo=${encodeURIComponent(returnTo)}`,
  );
  return result.url;
}

/** 用授权回跳带回来的一次性票据换账号资料。 */
export async function signInWithXTicket(ticket: string): Promise<AuthUser> {
  return request<AuthUser>("/auth/x/session", {
    method: "POST",
    body: JSON.stringify({ ticket }),
  });
}

export async function signInAsDemo(): Promise<AuthUser> {
  return request<AuthUser>("/auth/demo", { method: "POST", body: "{}" });
}

export async function signOut(): Promise<void> {
  await request<{ ok: boolean }>("/auth/signout", { method: "POST", body: "{}" });
}

/**
 * Live TradingView chart data：客户端直连 OKX 公共接口。
 * 免费额度按用户 IP 分摊，不压我们的服务器，也不需要在服务端存 K 线。
 */
export { getLiveCandles, LIVE_TIMEFRAME_LABEL } from "./liveMarket";
export type { LiveTimeframe } from "./liveMarket";
