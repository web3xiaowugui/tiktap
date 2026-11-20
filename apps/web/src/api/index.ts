import type {
  AuthUser,
  BetHolding,
  BetPool,
  BetToken,
  Candle,
  EquityPoint,
  FeedItem,
  FollowList,
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
import { readEnvironment } from "@/lib/environment";

/**
 * Every screen talks to this module only. All of it is now served by
 * `apps/server` over `/api`（同一个后端、同一个库，按 env 参数隔离）。
 *
 *   ?env=dev     -> 本地 Anvil
 *   ?env=testnet -> X Layer Testnet
 */
const API_BASE = "/api";

/** 会话 token：写接口（下注/领币/领奖）必须带，存 localStorage。 */
const SESSION_KEY = "tiktap.session.v1";

export function readSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function rememberSessionToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // 隐私模式下不可用，忽略
  }
}

function withEnvironment(path: string): string {
  const [pathname, search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  params.set("env", readEnvironment());
  return `${API_BASE}${pathname}?${params.toString()}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = readSessionToken();
  const response = await fetch(withEnvironment(path), {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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

/** 后端启用的环境列表（APP_ENVS 配置），前端下拉据此渲染。 */
export async function getEnvironments(): Promise<{
  environments: Array<{ id: string; label: string }>;
  defaultEnv: string;
}> {
  return request("/envs");
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

export async function getLeaderboard(options?: {
  following?: string | null;
  limit?: number;
}): Promise<LeaderboardEntry[]> {
  return request<LeaderboardEntry[]>(
    `/leaderboard${query({
      following: options?.following ?? undefined,
      limit: options?.limit ?? 100,
    })}`,
  );
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
  viewer?: string | null,
): Promise<MarketOpinion[]> {
  return request<MarketOpinion[]>(
    `/opinions${query({
      symbol,
      token: betToken ?? undefined,
      limit,
      viewer: viewer ?? undefined,
    })}`,
  );
}

/** 我关注的人的动态（跨标的）。 */
export async function getFollowingOpinions(
  address: string,
  limit = 50,
): Promise<MarketOpinion[]> {
  return request<MarketOpinion[]>(`/opinions${query({ following: address, limit })}`);
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

export async function getProfile(
  handle: string,
  viewer?: string | null,
): Promise<Profile> {
  const query = viewer ? `?viewer=${encodeURIComponent(viewer)}` : "";
  return request<Profile>(`/profiles/${encodeURIComponent(handle)}${query}`);
}

/** 关注 / 取关某人；返回对方最新的粉丝数和当前状态。 */
export async function setFollow(
  address: string,
  handle: string,
  follow: boolean,
): Promise<{
  followers: number;
  following: number;
  mutual: number;
  isFollowing: boolean;
}> {
  return request("/follow", {
    method: "POST",
    body: JSON.stringify({ address, handle, follow }),
  });
}

/** 粉丝 / 关注列表；viewer 决定每条数据的「已关注」状态。 */
export async function getFollowList(
  handle: string,
  kind: "followers" | "following",
  options?: { viewer?: string | null; limit?: number; offset?: number },
): Promise<FollowList> {
  return request<FollowList>(
    `/profiles/${encodeURIComponent(handle)}/${kind}${query({
      viewer: options?.viewer ?? undefined,
      limit: options?.limit,
      offset: options?.offset,
    })}`,
  );
}

/** 自选市场（按账号存库，跨环境共用）。 */
export async function getWatchlist(address: string): Promise<{ symbols: string[] }> {
  return request<{ symbols: string[] }>(`/watchlist${query({ address })}`);
}

export async function setWatchlist(
  address: string,
  symbol: string,
  watched: boolean,
): Promise<{ symbols: string[] }> {
  return request<{ symbols: string[] }>("/watchlist", {
    method: "POST",
    body: JSON.stringify({ address, symbol, watched }),
  });
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

/** 建托管号：有 X id 时按 id 复用（必要时补当前链的白名单/gas），否则新建。 */
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
  /** true = 这个 X id 之前建过号，直接复用原地址。 */
  reused?: boolean;
  /** 登录会话 token，之后的写接口都要带上。 */
  token?: string;
}> {
  const created = await request<{
    id: number;
    address: string;
    allowTxHash: string | null;
    fundedWei: string;
    warning?: string;
    reused?: boolean;
    token?: string;
  }>("/users", {
    method: "POST",
    body: JSON.stringify(profile ?? {}),
  });
  if (created.token) rememberSessionToken(created.token);
  return created;
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

/** 领取进度：累计已领数量（新版 TEST 不限量，不再有上限）。 */
export async function getFaucetStatus(address: string): Promise<{ claimed: number }> {
  return request(`/faucet/status?address=${encodeURIComponent(address)}`);
}

/** 拿 X 授权页地址（state + PKCE 在服务端生成）。 */
export async function startXOAuth(returnTo = "/discover"): Promise<string> {
  const result = await request<{ url: string }>(
    `/auth/x/start?returnTo=${encodeURIComponent(returnTo)}`,
  );
  return result.url;
}

/** 用授权回跳带回来的一次性票据换账号资料；服务端建号并签发会话 token。 */
export async function signInWithXTicket(
  ticket: string,
): Promise<AuthUser & { address: string; warning?: string }> {
  const result = await request<
    AuthUser & { address: string; warning?: string; token?: string }
  >("/auth/x/session", {
    method: "POST",
    body: JSON.stringify({ ticket }),
  });
  if (result.token) rememberSessionToken(result.token);
  return result;
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
