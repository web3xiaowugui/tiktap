import { readJson, HttpError, type Router } from "./http.ts";
import {
  buildAuthorizeUrl,
  consumeXTicket,
  exchangeXCode,
  isXOAuthConfigured,
  readXConfig,
  safeReturnTo,
} from "./x-oauth.ts";
import type { Db } from "./db.ts";
import { currentEnv, enabledEnvs, ENV_LABELS } from "./runtime.ts";
import { findMarket, listMarkets } from "./markets.ts";
import { placeBet, mintForUser, readMintedAmount } from "./betting.ts";
import { createUser } from "./users.ts";
import { createSession, requireSession } from "./sessions.ts";
import { syncMarkets } from "./market-sync.ts";
import {
  claimForUser,
  getRoundInfo,
  priceWinner,
  settleMarket,
  settleRound,
  winnerFromLabel,
} from "./settlement.ts";
import { readConfig } from "./tx.ts";
import { readLeaderboard } from "./leaderboard.ts";
import { getRoundPrice, ensureRoundPrices } from "./round-prices.ts";
import { readMarketActivity } from "./activity.ts";
import { readHolders } from "./holders.ts";
import {
  createOpinion,
  readFollowingOpinions,
  readOpinions,
  readOpinionsBySymbol,
} from "./opinions.ts";
import {
  findProfileUser,
  readProfile,
  readProfileEquity,
  readProfileEvents,
  readProfileOpenRounds,
  readProfileRounds,
} from "./profiles.ts";
import { followCounts, followUser, isFollowing, unfollowUser } from "./follows.ts";
import { readFollowList } from "./follow-lists.ts";
import { addWatchlist, readWatchlist, removeWatchlist } from "./watchlist.ts";
import { listBets } from "./bets.ts";
import {
  marketFor,
  readMyBet,
  readHoldings,
  readPool,
  readWallet,
  roundIndexFor,
} from "./read-chain.ts";
import {
  BET_QUICK_AMOUNTS,
  BET_TOKENS,
  betPoolFor,
  DEMO_PROFILE,
  feedFor,

  makeCandles,

  MY_HOLDINGS,
  myBetFor,
  profileFor,
  SIDEBAR_MENU,
  TOKENS,
} from "./data/mockData.ts";
import type { Range, Timeframe } from "../../../packages/shared/src/api-types.ts";

const FALLBACK_QUICK_AMOUNTS = [0.1, 0.5, 1, 2, 3];

function requireToken(symbol: string) {
  const token = TOKENS.find((entry) => entry.symbol === symbol.toUpperCase());
  if (!token) throw new HttpError(404, `未知交易对：${symbol}`);
  return token;
}

function requireBetToken(symbol: string) {
  const token = BET_TOKENS.find((entry) => entry.symbol === symbol);
  if (!token) throw new HttpError(404, `未知下注代币：${symbol}`);
  return token;
}

/** 临时停用的下注代币（逗号分隔），例如 DISABLED_BET_TOKENS=OKB,BEM。 */
function disabledBetTokens(): Set<string> {
  return new Set(
    (process.env.DISABLED_BET_TOKENS ?? "")
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean),
  );
}

function isBetTokenDisabled(symbol: string): boolean {
  return disabledBetTokens().has(symbol.toUpperCase());
}

/** 结算属管理操作：除自动结算外，HTTP 触发必须带 X-Admin-Key。 */
function requireAdmin(req: { headers: Record<string, string | string[] | undefined> }): void {
  const expected = process.env.ADMIN_KEY?.trim() ?? "";
  const given = String(req.headers["x-admin-key"] ?? "").trim();
  if (!expected || given !== expected) {
    throw new HttpError(403, "无权限：该管理接口需要 X-Admin-Key");
  }
}

function readRoundBlock(query: URLSearchParams): number {
  const raw = query.get("round");
  const value = Number(raw);
  if (!raw || !Number.isFinite(value)) throw new HttpError(400, "缺少有效的 round 参数");
  return value;
}

function isQuickAmounts(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === 5 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item) && item > 0)
  );
}

function readQuickAmounts(db: Db, symbol: string): number[] {
  const row = db
    .prepare("SELECT amounts FROM quick_amounts WHERE env = ? AND symbol = ?")
    .get(currentEnv(), symbol) as { amounts: string } | undefined;

  if (row) {
    try {
      const parsed: unknown = JSON.parse(row.amounts);
      if (isQuickAmounts(parsed)) return parsed;
    } catch {
      // 数据坏了就回落到默认值。
    }
  }

  return [...(BET_QUICK_AMOUNTS[symbol] ?? FALLBACK_QUICK_AMOUNTS)];
}

/** 演示登录开关：只有显式 ALLOW_DEMO_LOGIN=1 才允许匿名/demo 账号（本地开发用）。 */
function demoLoginEnabled(): boolean {
  return (process.env.ALLOW_DEMO_LOGIN ?? "").trim() === "1";
}

export function registerRoutes(router: Router, db: Db): void {
  // ---- 统一登录守卫：除公开入口外，所有业务接口都要求会话 token ----
  router.useGuard((req, pathname) => {
    if (pathname === "/api/health") return;
    if (pathname.startsWith("/api/auth/")) return;
    // 建号入口只给 demo 模式用（handler 里还会再校验开关）
    if (pathname === "/api/users" && (req.method ?? "GET").toUpperCase() === "POST") {
      return;
    }
    // 管理接口用 X-Admin-Key 鉴权（handler 内部校验），不走会话
    if (pathname === "/api/markets/sync" || pathname.startsWith("/api/settle")) return;
    // 前端外壳需要的静态元数据（登录前后都要渲染）
    if (
      pathname === "/api/envs" ||
      pathname === "/api/tokens" ||
      pathname.startsWith("/api/tokens/") ||
      pathname === "/api/bet-tokens" ||
      pathname === "/api/sidebar-menu"
    ) {
      return;
    }
    const who = requireSession(db, req);
    // 生产（关闭 demo）只认 X 授权账号：没有 x_user_id 的旧 demo 账号一律拒绝
    if (!demoLoginEnabled()) {
      const row = db
        .prepare("SELECT x_user_id FROM users WHERE id = ?")
        .get(who.userId) as { x_user_id: string | null } | undefined;
      if (!row?.x_user_id) throw new HttpError(403, "请先使用 X 账号登录");
    }
  });

  // ---- 环境列表（前端下拉用它，部署时只暴露 APP_ENVS 里配置的环境）----
  router.get("/api/envs", () => {
    const environments = enabledEnvs();
    return {
      environments: environments.map((id) => ({ id, label: ENV_LABELS[id] })),
      defaultEnv: environments[0]!,
    };
  });

  // ---- 交易对 / 侧栏 ----
  router.get("/api/tokens", () => TOKENS);
  router.get("/api/tokens/:symbol", ({ params }) => requireToken(params.symbol));
  router.get("/api/bet-tokens", () => {
    const enabled = new Set(
      (
        db
          .prepare(
            "SELECT DISTINCT bet_token FROM markets WHERE env = ? AND enabled = 1 AND token_address IS NOT NULL",
          )
          .all(currentEnv()) as Array<{ bet_token: string }>
      ).map((row) => row.bet_token),
    );
    const disabled = disabledBetTokens();
    // 停用的代币仍然返回（按钮保留），带 disabled 标记，由前端置灰、后端拒绝下注。
    return BET_TOKENS.filter((token) => enabled.has(token.symbol)).map((token) => ({
      ...token,
      disabled: disabled.has(token.symbol),
    }));
  });

  router.get("/api/sidebar-menu", () => SIDEBAR_MENU);
  // 排行榜：当前环境下按净盈利排前 100；following=地址 时只返回关注的人
  router.get("/api/leaderboard", ({ query }) => {
    const limit = Math.min(Math.max(Number(query.get("limit") ?? 100), 1), 100);
    const followingAddress = query.get("following");
    const viewerId = followingAddress
      ? (findProfileUser(db, followingAddress)?.id ?? null)
      : null;
    if (followingAddress && viewerId === null) return [];
    return readLeaderboard(db, limit, viewerId);
  });

  // ---- 建号（demo 模式专用；生产走 /api/auth/x/session，由服务端建号）----
  router.post("/api/users", async ({ req }) => {
    if (!demoLoginEnabled()) {
      throw new HttpError(403, "匿名建号已关闭，请使用 X 账号登录");
    }
    const body = await readJson<{
      handle?: string;
      name?: string;
    }>(req);
    // 注意：不接受客户端传的 xUserId，避免冒充别人的 X 身份。
    const created = await createUser(db, undefined, {
      xHandle: body.handle?.trim() || undefined,
      xName: body.name?.trim() || undefined,
    });
    return { ...created, token: createSession(db, created.id, created.address) };
  });

  router.get("/api/users/:address", async ({ params }) => {
    const row = db
      .prepare(
        "SELECT id, address, x_user_id, x_handle, x_name, created_at FROM users WHERE LOWER(address) = LOWER(?)",
      )
      .get(params.address) as
      | {
          id: number;
          address: string;
          x_user_id: string | null;
          x_handle: string | null;
          x_name: string | null;
          created_at: number;
        }
      | undefined;
    if (!row) throw new HttpError(404, `用户不存在：${params.address}`);
    return {
      id: row.id,
      address: row.address,
      xUserId: row.x_user_id,
      handle: row.x_handle,
      name: row.x_name,
      created_at: row.created_at,
    };
  });

  // ---- 领体验币：只发 TEST ----
  router.get("/api/faucet/status", ({ query }) => {
    const address = query.get("address");
    if (!address) throw new HttpError(400, "缺少 address");
    const user = db
      .prepare("SELECT id FROM users WHERE LOWER(address) = LOWER(?)")
      .get(address) as { id: number } | undefined;
    if (!user) throw new HttpError(404, `用户不存在：${address}`);
    // 新版 TEST 不限量：只报当前这枚币的累计已领，供弹框展示。
    const tokenRow = db
      .prepare(
        "SELECT token_address FROM markets WHERE env = ? AND bet_token = 'TEST' AND token_address IS NOT NULL LIMIT 1",
      )
      .get(currentEnv()) as { token_address: string } | undefined;
    return { claimed: readMintedAmount(db, user.id, tokenRow?.token_address) };
  });

  router.post("/api/faucet", async ({ req }) => {
    if (currentEnv() === "mainnet") {
      throw new HttpError(400, "主网不发放测试币");
    }
    const who = requireSession(db, req);
    const body = await readJson<{ address?: string; betToken?: string }>(req);
    if (!body.betToken) throw new HttpError(400, "缺少 betToken");
    if (body.betToken.trim().toUpperCase() !== "TEST") {
      throw new HttpError(400, "领测试币只发 TEST");
    }

    // 每地址冷却，防止同一账号反复刷 mint 消耗 operator gas。
    const cooldownSec = Number(process.env.FAUCET_COOLDOWN_SEC ?? "300");
    if (Number.isFinite(cooldownSec) && cooldownSec > 0) {
      const last = db
        .prepare(
          "SELECT created_at FROM txs WHERE user_id = ? AND env = ? AND kind = 'mint' AND status = 'confirmed' ORDER BY created_at DESC LIMIT 1",
        )
        .get(who.userId, currentEnv()) as { created_at: number } | undefined;
      const waitMs = last ? last.created_at + cooldownSec * 1000 - Date.now() : 0;
      if (waitMs > 0) {
        throw new HttpError(429, `刚领过，${Math.ceil(waitMs / 1000)} 秒后再试`);
      }
    }

    // 服务端硬性限额：每次固定 1000 TEST，不信任客户端传来的金额，
    // 避免有人直接调接口铸出任意数量的币。
    return mintForUser(db, who.address, "TEST", "1000");
  });

  // ---- 下注（后端代签，txHash 落库）----
  router.post("/api/bet", async ({ req }) => {
    const who = requireSession(db, req);
    const body = await readJson<{
      market?: string;
      betToken?: string;
      side?: string;
      amount?: string | number;
    }>(req);
    if (!body.market) throw new HttpError(400, "缺少 market");
    if (!body.betToken) throw new HttpError(400, "缺少 betToken");
    if (!body.side) throw new HttpError(400, "缺少 side");
    if (body.amount === undefined) throw new HttpError(400, "缺少 amount");
    if (isBetTokenDisabled(body.betToken)) {
      throw new HttpError(400, `${body.betToken.toUpperCase()} 已暂停下注`);
    }
    return placeBet(db, {
      address: who.address,
      market: body.market,
      betToken: body.betToken,
      side: body.side,
      amount: String(body.amount),
    });
  });

  // ---- 轮次真值 ----
  router.get("/api/round", async () => getRoundInfo(readConfig()));

  /** 下注记录：按地址查（或用 ?userId=），默认最近 100 条。 */
  router.get("/api/bets", async ({ query }) => {
    const address = query.get("address") ?? undefined;
    const userIdRaw = query.get("userId");
    const userId = userIdRaw ? Number(userIdRaw) : undefined;
    const limit = Number(query.get("limit") ?? 100);
    if (!address && userId === undefined) throw new HttpError(400, "缺少 address 或 userId");
    return {
      bets: listBets(db, { address, userId, limit }),
    };
  });

  /**
   * 某一轮的锁定价格 / 开奖价格。
   * round 传轮次起始块，和池子接口用同一个口径。
   * 已结束但库里还缺开奖价的轮次（例如本轮没人下注，自动结算不会碰它），
   * 这里按需补一次；补不到就保持 null，不影响页面加载。
   */
  router.get("/api/round-price", async ({ query }) => {
    const symbol = (query.get("symbol") ?? "BTC").toUpperCase();
    const roundStartBlock = readRoundBlock(query);
    const roundIndex = roundIndexFor(roundStartBlock);
    let row = getRoundPrice(db, symbol, roundIndex);
    const cfg = readConfig();
    if (cfg.market && (row === null || row.settlePrice === null)) {
      try {
        row = await ensureRoundPrices(db, cfg, symbol, roundIndex);
      } catch {
        // 行情还没覆盖 / 链上还没结束：保留已有值，下次请求再试
      }
    }
    return {
      symbol,
      roundIndex,
      roundStartBlock,
      lockPrice: row?.lockPrice ?? null,
      lockTime: row?.lockTime ?? null,
      settlePrice: row?.settlePrice ?? null,
      settleTime: row?.settleTime ?? null,
      updatedAt: row?.updatedAt ?? null,
    };
  });

  // ---- 结算（单个市场 / 一整轮）----
  router.post("/api/settle", async ({ req }) => {
    requireAdmin(req);
    const body = await readJson<{
      market?: string;
      betToken?: string;
      roundIndex?: number;
      winner?: string;
    }>(req);
    if (!body.market) throw new HttpError(400, "缺少 market");
    if (!body.betToken) throw new HttpError(400, "缺少 betToken");

    const row = findMarket(db, body.market.toUpperCase(), body.betToken.toUpperCase());
    if (!row) throw new HttpError(404, `未知市场：${body.market}/${body.betToken}`);

    const cfg = readConfig();
    const roundIndex = body.roundIndex ?? (await defaultRound(cfg));
    const decided = body.winner
      ? { winner: winnerFromLabel(body.winner), lockPrice: null, settlePrice: null }
      : await priceWinner(db, cfg, row.symbol, roundIndex);

    return settleMarket(db, cfg, row.market_id, roundIndex, decided.winner, {
      lockPrice: decided.lockPrice,
      settlePrice: decided.settlePrice,
    });
  });

  router.post("/api/settle/round", async ({ req }) => {
    requireAdmin(req);
    const body = await readJson<{ roundIndex?: number; winners?: Record<string, string> }>(req);
    const cfg = readConfig();
    const roundIndex = body.roundIndex ?? (await defaultRound(cfg));
    return settleRound(db, cfg, roundIndex, body.winners);
  });

  // ---- 领奖 ----
  router.post("/api/claim", async ({ req }) => {
    const who = requireSession(db, req);
    const body = await readJson<{
      market?: string;
      betToken?: string;
      roundIndex?: number;
    }>(req);
    if (!body.market) throw new HttpError(400, "缺少 market");
    if (!body.betToken) throw new HttpError(400, "缺少 betToken");
    if (body.roundIndex === undefined) throw new HttpError(400, "缺少 roundIndex");

    const row = findMarket(db, body.market.toUpperCase(), body.betToken.toUpperCase());
    if (!row) throw new HttpError(404, `未知市场：${body.market}/${body.betToken}`);

    return claimForUser(db, readConfig(), who.address, row.market_id, body.roundIndex);
  });
  // ---- 链上配置自检（人工触发一次即可）----
  router.post("/api/markets/sync", async ({ req }) => {
    requireAdmin(req);
    return syncMarkets(db);
  });
  // ---- 市场（标的 × 下注代币）----
  router.get("/api/markets", () => listMarkets(db));

  // ---- 池子：配了合约就读链上真值，没配就回退到 mock ----
  router.get("/api/pools", async ({ query }) => {
    const market = requireToken(query.get("market") ?? "").symbol;
    const betToken = requireBetToken(query.get("token") ?? "").symbol;
    const roundStartBlock = readRoundBlock(query);
    const cfg = readConfig();

    if (cfg.market) {
      const row = marketFor(db, market, betToken);
      const roundIndex = roundIndexFor(roundStartBlock);
      const pool = await readPool(db, cfg, row, roundIndex);
      return { marketSymbol: market, betTokenSymbol: betToken, ...pool };
    }

    const pool = betPoolFor(market, betToken, roundStartBlock);
    if (!pool) {
      throw new HttpError(404, `暂无 ${market} / ${betToken} / ${roundStartBlock} 的池子数据`);
    }

    const row = findMarket(db, market, betToken);
    return {
      marketId: row?.market_id ?? null,
      marketSymbol: market,
      betTokenSymbol: betToken,
      roundStartBlock,
      ...pool,
      feeBps: 0,
    };
  });

  // ---- 我的仓位：有地址且配了合约就读链上 ----
  router.get("/api/my-bet", async ({ query }) => {
    const market = requireToken(query.get("market") ?? "").symbol;
    const betToken = requireBetToken(query.get("token") ?? "").symbol;
    const roundStartBlock = readRoundBlock(query);
    const address = query.get("address");
    const cfg = readConfig();

    if (cfg.market && address) {
      const row = marketFor(db, market, betToken);
      const roundIndex = roundIndexFor(roundStartBlock);
      const myBet = await readMyBet(db, cfg, address, row, roundIndex);
      return {
        marketSymbol: market,
        betTokenSymbol: betToken,
        roundStartBlock,
        ...myBet,
      };
    }

    return myBetFor(market, betToken, roundStartBlock);
  });

  // ---- 钱包余额（真值）----
  router.get("/api/wallet/:address", async ({ params }) => {
    const cfg = readConfig();
    if (!cfg.market) throw new HttpError(503, "未配置 POOL_MARKET_ADDRESS");
    return readWallet(cfg, params.address);
  });

  // ---- 快捷金额 ----
  router.get("/api/quick-amounts/:symbol", ({ params }) => readQuickAmounts(db, params.symbol));

  router.put("/api/quick-amounts/:symbol", async ({ req, params }) => {
    requireSession(db, req);
    const body = await readJson<{ amounts?: unknown }>(req);
    if (!isQuickAmounts(body.amounts)) {
      throw new HttpError(400, "快捷金额必须是 5 个正数");
    }

    db.prepare(
      "INSERT INTO quick_amounts (env, symbol, amounts, updated_at) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(env, symbol) DO UPDATE SET amounts = excluded.amounts, updated_at = excluded.updated_at",
    ).run(currentEnv(), params.symbol, JSON.stringify(body.amounts), Date.now());

    return body.amounts;
  });

  // ---- 行情 ----
  router.get("/api/candles", ({ query }) => {
    const token = requireToken(query.get("symbol") ?? "");
    const timeframe = (query.get("timeframe") ?? "1m") as Timeframe;
    return makeCandles(token, timeframe);
  });

  // ---- 市场面板 ----
  /** 一轮参与者（市场级）：按下注记录按地址聚合。 */
  router.get("/api/holders", ({ query }) => {
    const symbol = requireToken(query.get("symbol") ?? "").symbol;
    const betToken = requireBetToken(query.get("token") ?? "TEST").symbol;
    const roundRaw = query.get("round");
    if (!readConfig().market) return [];

    const row = marketFor(db, symbol, betToken);
    const roundIndex = roundRaw ? roundIndexFor(readRoundBlock(query)) : null;
    return readHolders(db, row, roundIndex);
  });

  // ---- 观点（市场级；发布时记录当时轮次）----
  router.get("/api/opinions", ({ query }) => {
    const limit = Number(query.get("limit") ?? 50);
    // 左侧动态「已关注」：按当前用户的关注关系，跨标的全量返回
    const following = query.get("following");
    if (following) {
      return readFollowingOpinions(db, following, limit);
    }

    const symbol = requireToken(query.get("symbol") ?? "").symbol;
    if (!readConfig().market) return [];

    const rawToken = query.get("token");
    if (!rawToken) {
      // 没给代币 → 这个标的的全部观点（左侧动态用）
      return readOpinionsBySymbol(db, symbol, limit);
    }
    const betToken = requireBetToken(rawToken).symbol;
    const row = marketFor(db, symbol, betToken);
    // viewer 存在时给每条观点打「是否已关注」标记，供「仅看已关注」筛选
    const viewerAddress = query.get("viewer");
    const viewerId = viewerAddress
      ? (findProfileUser(db, viewerAddress)?.id ?? null)
      : null;
    return readOpinions(db, row, limit, viewerId);
  });

  router.post("/api/opinions", async ({ req }) => {
    const who = requireSession(db, req);
    const body = await readJson<{
      address?: string;
      market?: string;
      betToken?: string;
      body?: string;
      side?: string | null;
    }>(req);
    if (!body.market) throw new HttpError(400, "缺少 market");
    if (!body.betToken) throw new HttpError(400, "缺少 betToken");
    if (!body.body) throw new HttpError(400, "缺少正文");

    const row = marketFor(db, body.market.toUpperCase(), body.betToken.toUpperCase());
    const cfg = readConfig();
    let roundId: number | null = null;
    if (cfg.market) {
      try {
        roundId = (await getRoundInfo(cfg)).currentRound;
      } catch {
        roundId = null;
      }
    }

    return createOpinion(db, row, {
      address: who.address,
      body: body.body,
      side: body.side ?? null,
      roundId,
    });
  });
  router.get("/api/feed", ({ query }) =>
    feedFor(requireToken(query.get("symbol") ?? "").symbol, readRoundBlock(query)),
  );

  /**
   * 活动流（市场级：标的 + 下注代币）：下注 / 开奖 / 自动领奖，全部读库。
   * 默认返回最近多轮，「仅看本轮」由前端按 roundIndex 过滤。
   */
  router.get("/api/activity", ({ query }) => {
    const symbol = requireToken(query.get("symbol") ?? "").symbol;
    const betToken = requireBetToken(query.get("token") ?? "TEST").symbol;
    const cfg = readConfig();
    if (!cfg.market) return [];

    const row = marketFor(db, symbol, betToken);
    return readMarketActivity(db, row);
  });

  // ---- 我的持仓 ----
  router.get("/api/holdings", async ({ query }) => {
    const address = query.get("address");
    const cfg = readConfig();
    if (cfg.market && address) return readHoldings(db, cfg, address);
    return MY_HOLDINGS;
  });

  // ---- 个人主页（读库：bets / opinions / users）----
  router.get("/api/profiles/:handle", ({ params, query }) => {
    const user = findProfileUser(db, params.handle);
    // 老 mock 交易者（排行榜/搜索里还没接库的 handle）退回 mock 身份，统计为空。
    if (!user) return { ...profileFor(params.handle), isMock: true };
    const viewerAddress = query.get("viewer");
    const viewer = viewerAddress ? findProfileUser(db, viewerAddress) : undefined;
    return readProfile(db, user, viewer?.id ?? null);
  });

  // ---- 粉丝 / 关注列表（分页，带访问者的关注状态）----
  const followList = (
    handle: string,
    kind: "followers" | "following",
    query: URLSearchParams,
  ) => {
    const user = findProfileUser(db, handle);
    if (!user) return { total: 0, items: [] };
    const viewerAddress = query.get("viewer");
    const viewer = viewerAddress ? findProfileUser(db, viewerAddress) : undefined;
    const rawLimit = Number.parseInt(query.get("limit") ?? "", 10);
    const rawOffset = Number.parseInt(query.get("offset") ?? "", 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 50;
    const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;
    return readFollowList(db, user, kind, viewer?.id ?? null, limit, offset);
  };

  router.get("/api/profiles/:handle/followers", ({ params, query }) =>
    followList(params.handle, "followers", query),
  );

  router.get("/api/profiles/:handle/following", ({ params, query }) =>
    followList(params.handle, "following", query),
  );

  // ---- 关注 / 取关（全局身份，不按 env 拆）----
  router.post("/api/follow", async ({ req }) => {
    const who = requireSession(db, req);
    const body = await readJson<{
      handle?: string;
      follow?: boolean;
    }>(req);
    if (!body.handle) throw new HttpError(400, "缺少 handle");

    const viewer = findProfileUser(db, who.address);
    if (!viewer) throw new HttpError(404, "当前用户不存在");
    const target = findProfileUser(db, body.handle);
    if (!target) throw new HttpError(404, "用户不存在");
    if (viewer.id === target.id) throw new HttpError(400, "不能关注自己");

    if (body.follow === false) {
      unfollowUser(db, viewer.id, target.id);
    } else {
      followUser(db, viewer.id, target.id);
    }

    const counts = followCounts(db, target.id);
    return {
      followers: counts.followers,
      following: counts.following,
      mutual: counts.mutual,
      isFollowing: isFollowing(db, viewer.id, target.id),
    };
  });

  // ---- 自选（按账号存库，跨环境共用）----
  router.get("/api/watchlist", ({ query }) => {
    const address = query.get("address");
    if (!address) throw new HttpError(400, "缺少 address");
    const user = findProfileUser(db, address);
    return { symbols: user ? readWatchlist(db, user.id) : [] };
  });

  router.post("/api/watchlist", async ({ req }) => {
    const who = requireSession(db, req);
    const body = await readJson<{
      symbol?: string;
      watched?: boolean;
    }>(req);
    if (!body.symbol) throw new HttpError(400, "缺少 symbol");

    const user = findProfileUser(db, who.address);
    if (!user) throw new HttpError(404, "用户不存在");
    const symbol = requireToken(body.symbol).symbol;
    if (body.watched === false) {
      removeWatchlist(db, user.id, symbol);
    } else {
      addWatchlist(db, user.id, symbol);
    }
    return { symbols: readWatchlist(db, user.id) };
  });

  router.get("/api/profiles/:handle/positions", ({ params }) => {
    const user = findProfileUser(db, params.handle);
    return user ? readProfileOpenRounds(db, user.address) : [];
  });  router.get("/api/profiles/:handle/rounds", ({ params, query }) => {
    const user = findProfileUser(db, params.handle);
    if (!user) return [];
    const limit = Number(query.get("limit") ?? 100);
    return readProfileRounds(db, user.address, Number.isFinite(limit) ? limit : 100);
  });
  router.get("/api/profiles/:handle/activity", ({ params, query }) => {
    const user = findProfileUser(db, params.handle);
    if (!user) return [];
    const limit = Number(query.get("limit") ?? 100);
    return readProfileEvents(db, user.address, Number.isFinite(limit) ? limit : 100);
  });
  router.get("/api/profiles/:handle/equity", ({ params, query }) => {
    const raw = query.get("range") ?? "24h";
    const ranges: Range[] = ["24h", "7d", "30d"];
    if (!ranges.includes(raw as Range)) throw new HttpError(400, `未知区间：${raw}`);
    const rawToken = query.get("token");
    if (!rawToken) throw new HttpError(400, "缺少 token 参数");
    const betToken = requireBetToken(rawToken.toUpperCase()).symbol;
    const user = findProfileUser(db, params.handle);
    return user ? readProfileEquity(db, user.address, raw as Range, betToken) : [];
  });

  // ---- 登录 ----
  router.post("/api/auth/demo", () => {
    if (!demoLoginEnabled()) {
      throw new HttpError(403, "演示登录已关闭，请使用 X 账号登录");
    }
    return {
      name: DEMO_PROFILE.name,
      handle: DEMO_PROFILE.handle,
      email: "end@tiktap.demo",
      provider: "demo",
    };
  });

  /** 真·X OAuth：返回授权地址，前端 window.location 跳过去。 */
  router.get("/api/auth/x/start", async ({ query }) => {
    const returnTo = safeReturnTo(query.get("returnTo"));
    return { url: buildAuthorizeUrl(returnTo), configured: isXOAuthConfigured() };
  });

  /** X 授权回调：code 换 token → users/me → 302 回前端，带一次性票据。 */
  router.get("/api/auth/x/callback", async ({ query, res }) => {
    const cfg = readXConfig();
    const denied = query.get("error");
    if (denied) {
      const reason = query.get("error_description") ?? denied;
      res.writeHead(302, {
        Location: `${cfg.webUrl}/?x_error=${encodeURIComponent(reason)}`,
      });
      res.end();
      return;
    }

    const code = query.get("code");
    const state = query.get("state");
    if (!code || !state) throw new HttpError(400, "X 回调缺少 code 或 state");

    const result = await exchangeXCode(code, state);
    res.writeHead(302, {
      Location: `${result.webUrl}/?x_ticket=${result.ticket}&x_next=${encodeURIComponent(result.returnTo)}`,
    });
    res.end();
    return;
  });

  /**
   * 票据换资料 + 服务端建号：xId 只来自刚才验证过的一次性票据，
   * 客户端无法伪造。返回地址和会话 token，前端直接用。
   */
  router.post("/api/auth/x/session", async ({ req }) => {
    const body = await readJson<{ ticket?: string }>(req);
    const ticket = (body.ticket ?? "").trim();
    if (!ticket) throw new HttpError(400, "缺少登录票据");
    const profile = consumeXTicket(ticket);

    const created = await createUser(db, undefined, {
      xUserId: profile.xId,
      xHandle: profile.handle,
      xName: profile.name,
    });

    return {
      name: profile.name,
      handle: profile.handle,
      email: `${profile.handle}@x`,
      provider: "x",
      xId: profile.xId,
      address: created.address,
      warning: created.warning,
      token: createSession(db, created.id, created.address),
    };
  });

  router.post("/api/auth/signout", () => ({ ok: true }));
}
/** 默认结算「上一轮」（当前轮的上一轮一定已经结束了）。 */
async function defaultRound(cfg: ReturnType<typeof readConfig>): Promise<number> {
  const info = await getRoundInfo(cfg);
  if (info.currentRound < 2) throw new HttpError(400, "还没有已完成的轮次（一轮要 600 块才结算）");
  return info.currentRound - 2;
}
