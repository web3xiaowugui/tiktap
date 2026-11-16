import { readJson, HttpError, type Router } from "./http.ts";
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
    const body = await readJson<{ creator?: string }>(req);
    return createUser(db, body.creator);
  });

  router.get("/api/users/:address", async ({ params }) => {
    const row = db
      .prepare("SELECT id, address, created_at FROM users WHERE LOWER(address) = LOWER(?)")
      .get(params.address) as { id: number; address: string; created_at: number } | undefined;
    if (!row) throw new HttpError(404, `用户不存在：${params.address}`);
    return row;
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
    const winner = body.winner
      ? winnerFromLabel(body.winner)
      : (await priceWinner(cfg, row.symbol, roundIndex)).winner;

    return settleMarket(db, cfg, row.market_id, roundIndex, winner);
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
  router.get("/api/holders", ({ query }) =>
    holdersFor(requireToken(query.get("symbol") ?? "").symbol, readRoundBlock(query)),
  );

  router.get("/api/feed", ({ query }) =>
    feedFor(requireToken(query.get("symbol") ?? "").symbol, readRoundBlock(query)),
  );

  router.get("/api/activity", ({ query }) =>
    marketActivityFor(requireToken(query.get("symbol") ?? "").symbol, readRoundBlock(query)),
  );

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

  router.post("/api/auth/okx", async ({ req }) => {
    const body = await readJson<{ address?: string; chainId?: string }>(req);
    if (!body.address) throw new HttpError(400, "缺少钱包地址");

    return {
      name: DEMO_PROFILE.name,
      handle: DEMO_PROFILE.handle,
      email: "",
      provider: "okx",
      address: body.address,
      chainId: body.chainId,
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
