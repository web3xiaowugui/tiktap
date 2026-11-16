import { readJson, HttpError, type Router } from "./http.ts";
import type { Db } from "./db.ts";
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

  // ---- 池子 ----
  router.get("/api/pools", ({ query }) => {
    const market = requireToken(query.get("market") ?? "").symbol;
    const betToken = requireBetToken(query.get("token") ?? "").symbol;
    const roundStartBlock = readRoundBlock(query);

    const pool = betPoolFor(market, betToken, roundStartBlock);
    if (!pool) {
      throw new HttpError(404, `暂无 ${market} / ${betToken} / ${roundStartBlock} 的池子数据`);
    }

    return { marketSymbol: market, betTokenSymbol: betToken, roundStartBlock, ...pool };
  });

  router.get("/api/my-bet", ({ query }) => {
    const market = requireToken(query.get("market") ?? "").symbol;
    const betToken = requireBetToken(query.get("token") ?? "").symbol;
    const roundStartBlock = readRoundBlock(query);
    return myBetFor(market, betToken, roundStartBlock);
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
  router.get("/api/holdings", () => MY_HOLDINGS);

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
