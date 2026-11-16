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
import { findMarket, listMarkets } from "./markets.ts";
import { placeBet, mintForUser } from "./betting.ts";
import { createUser } from "./users.ts";
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
import { getRoundPrice } from "./round-prices.ts";
import { readMarketActivity } from "./activity.ts";
import { readRoundHolders } from "./holders.ts";
import { createOpinion, readOpinions, readOpinionsBySymbol } from "./opinions.ts";
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
  activityFor,
  BET_QUICK_AMOUNTS,
  BET_TOKENS,
  betPoolFor,
  DEMO_PROFILE,
  feedFor,

  LEADERBOARD,
  makeCandles,
  makeEquity,

  MY_HOLDINGS,
  myBetFor,
  positionsFor,
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
    .prepare("SELECT amounts FROM quick_amounts WHERE symbol = ?")
    .get(symbol) as { amounts: string } | undefined;

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

export function registerRoutes(router: Router, db: Db): void {
  // ---- 交易对 / 侧栏 ----
  router.get("/api/tokens", () => TOKENS);
  router.get("/api/tokens/:symbol", ({ params }) => requireToken(params.symbol));
  router.get("/api/bet-tokens", () => BET_TOKENS);
  router.get("/api/sidebar-menu", () => SIDEBAR_MENU);
  router.get("/api/leaderboard", () => LEADERBOARD);

  // ---- 建号（托管地址 + 白名单 + gas）----
  router.post("/api/users", async ({ req }) => {
    const body = await readJson<{
      creator?: string;
      xUserId?: string;
      handle?: string;
      name?: string;
    }>(req);
    return createUser(db, body.creator, {
      xUserId: body.xUserId?.trim() || undefined,
      xHandle: body.handle?.trim() || undefined,
      xName: body.name?.trim() || undefined,
    });
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

  // ---- 领体验币（用户地址自己 mint）----
  router.post("/api/faucet", async ({ req }) => {
    const body = await readJson<{ address?: string; betToken?: string; amount?: string | number }>(req);
    if (!body.address) throw new HttpError(400, "缺少 address");
    if (!body.betToken) throw new HttpError(400, "缺少 betToken");
    if (body.amount === undefined) throw new HttpError(400, "缺少 amount");
    return mintForUser(db, body.address, body.betToken, String(body.amount));
  });

  // ---- 下注（后端代签，txHash 落库）----
  router.post("/api/bet", async ({ req }) => {
    const body = await readJson<{
      address?: string;
      market?: string;
      betToken?: string;
      side?: string;
      amount?: string | number;
    }>(req);
    if (!body.address) throw new HttpError(400, "缺少 address");
    if (!body.market) throw new HttpError(400, "缺少 market");
    if (!body.betToken) throw new HttpError(400, "缺少 betToken");
    if (!body.side) throw new HttpError(400, "缺少 side");
    if (body.amount === undefined) throw new HttpError(400, "缺少 amount");
    return placeBet(db, {
      address: body.address,
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
   * 某一轮的锁定价格 / 开奖价格（只读库里已写入的值，不触发行情请求）。
   * round 传轮次起始块，和池子接口用同一个口径。
   */
  router.get("/api/round-price", async ({ query }) => {
    const symbol = (query.get("symbol") ?? "BTC").toUpperCase();
    const roundStartBlock = readRoundBlock(query);
    const roundIndex = roundIndexFor(roundStartBlock);
    const row = getRoundPrice(db, symbol, roundIndex);
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
    const body = await readJson<{ roundIndex?: number; winners?: Record<string, string> }>(req);
    const cfg = readConfig();
    const roundIndex = body.roundIndex ?? (await defaultRound(cfg));
    return settleRound(db, cfg, roundIndex, body.winners);
  });

  // ---- 领奖 ----
  router.post("/api/claim", async ({ req }) => {
    const body = await readJson<{
      address?: string;
      market?: string;
      betToken?: string;
      roundIndex?: number;
    }>(req);
    if (!body.address) throw new HttpError(400, "缺少 address");
    if (!body.market) throw new HttpError(400, "缺少 market");
    if (!body.betToken) throw new HttpError(400, "缺少 betToken");
    if (body.roundIndex === undefined) throw new HttpError(400, "缺少 roundIndex");

    const row = findMarket(db, body.market.toUpperCase(), body.betToken.toUpperCase());
    if (!row) throw new HttpError(404, `未知市场：${body.market}/${body.betToken}`);

    return claimForUser(db, readConfig(), body.address, row.market_id, body.roundIndex);
  });
  // ---- 链上配置自检（人工触发一次即可）----
  router.post("/api/markets/sync", async () => syncMarkets(db));
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
    const body = await readJson<{ amounts?: unknown }>(req);
    if (!isQuickAmounts(body.amounts)) {
      throw new HttpError(400, "快捷金额必须是 5 个正数");
    }

    db.prepare(
      "INSERT INTO quick_amounts (symbol, amounts, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(symbol) DO UPDATE SET amounts = excluded.amounts, updated_at = excluded.updated_at",
    ).run(params.symbol, JSON.stringify(body.amounts), Date.now());

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
    const roundStartBlock = readRoundBlock(query);
    if (!readConfig().market) return [];

    const row = marketFor(db, symbol, betToken);
    return readRoundHolders(db, row, roundIndexFor(roundStartBlock));
  });

  // ---- 观点（市场级；发布时记录当时轮次）----
  router.get("/api/opinions", ({ query }) => {
    const symbol = requireToken(query.get("symbol") ?? "").symbol;
    const limit = Number(query.get("limit") ?? 50);
    if (!readConfig().market) return [];

    const rawToken = query.get("token");
    if (!rawToken) {
      // 没给代币 → 这个标的的全部观点（左侧动态用）
      return readOpinionsBySymbol(db, symbol, limit);
    }
    const betToken = requireBetToken(rawToken).symbol;
    const row = marketFor(db, symbol, betToken);
    return readOpinions(db, row, limit);
  });

  router.post("/api/opinions", async ({ req }) => {
    const body = await readJson<{
      address?: string;
      market?: string;
      betToken?: string;
      body?: string;
      side?: string | null;
    }>(req);
    if (!body.address) throw new HttpError(400, "缺少 address");
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
      address: body.address,
      body: body.body,
      side: body.side ?? null,
      roundId,
    });
  });
  router.get("/api/feed", ({ query }) =>
    feedFor(requireToken(query.get("symbol") ?? "").symbol, readRoundBlock(query)),
  );

  /**
   * 一轮活动流（市场级：标的 + 下注代币）：下注 / 开奖 / 自动领奖，全部读库。
   */
  router.get("/api/activity", ({ query }) => {
    const symbol = requireToken(query.get("symbol") ?? "").symbol;
    const betToken = requireBetToken(query.get("token") ?? "TEST").symbol;
    const roundStartBlock = readRoundBlock(query);
    const cfg = readConfig();
    if (!cfg.market) return [];

    const row = marketFor(db, symbol, betToken);
    return readMarketActivity(db, row, roundIndexFor(roundStartBlock));
  });

  // ---- 我的持仓 ----
  router.get("/api/holdings", async ({ query }) => {
    const address = query.get("address");
    const cfg = readConfig();
    if (cfg.market && address) return readHoldings(db, cfg, address);
    return MY_HOLDINGS;
  });

  // ---- 个人主页 ----
  router.get("/api/profiles/:handle", ({ params }) => profileFor(params.handle));
  router.get("/api/profiles/:handle/positions", ({ params }) => positionsFor(params.handle));
  router.get("/api/profiles/:handle/activity", ({ params }) => activityFor(params.handle));

  router.get("/api/profiles/:handle/equity", ({ params, query }) => {
    const raw = query.get("range") ?? "24h";
    const ranges: Range[] = ["24h", "7d", "30d"];
    if (!ranges.includes(raw as Range)) throw new HttpError(400, `未知区间：${raw}`);
    profileFor(params.handle);
    return makeEquity(raw as Range);
  });

  // ---- 登录 ----
  router.post("/api/auth/demo", () => ({
    name: DEMO_PROFILE.name,
    handle: DEMO_PROFILE.handle,
    email: "end@tiktap.demo",
    provider: "demo",
  }));

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

  /** 票据换资料，前端随后走「复用地址 / POST /api/users 建号」。 */
  router.post("/api/auth/x/session", async ({ req }) => {
    const body = await readJson<{ ticket?: string }>(req);
    const ticket = (body.ticket ?? "").trim();
    if (!ticket) throw new HttpError(400, "缺少登录票据");
    const profile = consumeXTicket(ticket);
    return {
      name: profile.name,
      handle: profile.handle,
      email: `${profile.handle}@x`,
      provider: "x",
      xId: profile.xId,
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
