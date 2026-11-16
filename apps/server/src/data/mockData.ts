import type {
  Activity,
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
  TokenIcon,
} from "../../../../packages/shared/src/api-types.ts";

/* -------------------------------------------------------------------------- */
/*  Icons — stylised stand-ins for the real token marks                        */
/* -------------------------------------------------------------------------- */

const ICONS: Record<string, TokenIcon> = {
  BTC: { bg: "#f7931a", glyph: "₿" },
  ETH: { bg: "#627eea", glyph: "Ξ" },
  HYPE: { bg: "#0fbf8f", glyph: "H" },
  "S&P500": { bg: "#b91c1c", glyph: "500", fg: "#fff" },
  ZEC: { bg: "#f4b728", glyph: "Z", fg: "#201a00" },
  XYZ100: { bg: "#2563eb", glyph: "100" },
  WTICO: { bg: "#64748b", glyph: "W" },
  SKHYNIX: { bg: "#f97316", glyph: "S" },
  GOXL: { bg: "#3b82f6", glyph: "G" },
  NVDA: { bg: "#76b900", glyph: "N", fg: "#0b1500" },
  SNDK: { bg: "#e11d48", glyph: "S" },
  SOL: { bg: "#9945ff", glyph: "◎" },
  SILVER: { bg: "#cbd5e1", glyph: "Ag", fg: "#111827" },
  BRENTOIL: { bg: "#4d7c0f", glyph: "B" },
  SPCX: { bg: "#1f2937", glyph: "X" },
  NEAR: { bg: "#00c48c", glyph: "N", fg: "#001b12" },
  MU: { bg: "#0284c7", glyph: "M" },
  AMD: { bg: "#ef4444", glyph: "A" },
  DRAM: { bg: "#8b5cf6", glyph: "D" },
  GOLD: { bg: "#d4af37", glyph: "Au", fg: "#241c00" },
  LIT: { bg: "#22d3ee", glyph: "L", fg: "#00212a" },
  CASHCOAT: { bg: "#f472b6", glyph: "C", fg: "#2a0018" },
  GATO: { bg: "#fb923c", glyph: "G" },
  UNITY: { bg: "#111827", glyph: "U" },
  FPUMP: { bg: "#84cc16", glyph: "F", fg: "#0c1800" },
  EURUSD: { bg: "#3b82f6", glyph: "€" },
  OPENAI: { bg: "#10a37f", glyph: "AI" },
};

const FALLBACK_COLORS = ["#6d5df6", "#0ea5e9", "#f43f5e", "#f59e0b", "#10b981"];

export function tokenIcon(symbol: string): TokenIcon {
  const hit = ICONS[symbol];
  if (hit) return hit;
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) hash = (hash * 31 + symbol.charCodeAt(i)) >>> 0;
  return { bg: FALLBACK_COLORS[hash % FALLBACK_COLORS.length], glyph: symbol.slice(0, 1) };
}

/* -------------------------------------------------------------------------- */
/*  Navigation                                                                 */
/* -------------------------------------------------------------------------- */

export const SIDEBAR_MENU: SidebarMenu = {
  tabs: [
    { id: "watchlist", label: "自选" },
    { id: "market", label: "市场" },
    { id: "leaderboard", label: "排行榜" },
    { id: "activity", label: "动态" },
  ],
  categories: [
    { id: "all", label: "全部" },
    { id: "crypto", label: "加密货币" },
    { id: "meme", label: "MEME" },
    { id: "stocks", label: "股票" },
    { id: "commodities", label: "大宗商品" },
    { id: "indices", label: "指数" },
    { id: "preipo", label: "Pre-IPO" },
  ],
};

/* -------------------------------------------------------------------------- */
/*  XLayer bet tokens                                                          */
/* -------------------------------------------------------------------------- */

export const BET_TOKENS: BetToken[] = [
  {
    symbol: "BEM",
    name: "BEM",
    balance: 12_500,
    priceUsd: 0.012,
    icon: { bg: "linear-gradient(135deg,#c084fc,#6d28d9)", glyph: "B" },
  },
  {
    symbol: "OKB",
    name: "OKB",
    balance: 3.42,
    priceUsd: 48.5,
    icon: { bg: "linear-gradient(135deg,#3a3d48,#08080a 72%)", glyph: "O" },
  },
  {
    symbol: "TEST",
    name: "TEST",
    balance: 1_000,
    priceUsd: 1,
    icon: { bg: "linear-gradient(135deg,#94a3b8,#334155)", glyph: "T" },
  },
];

export const BET_QUICK_AMOUNTS: Record<string, number[]> = {
  BEM: [100, 500, 1_000, 2_500, 5_000],
  OKB: [0.1, 0.5, 1, 2, 3],
  TEST: [10, 50, 100, 250, 500],
};

/** Mock pari-mutuel pools keyed by `${marketSymbol}:${betTokenSymbol}`. */
export const BET_POOLS: Record<
  string,
  Pick<
    BetPool,
    "longAmount" | "shortAmount" | "longParticipants" | "shortParticipants"
  >
> = {
  "BTC:BEM": {
    longAmount: 1_250_000,
    shortAmount: 760_000,
    longParticipants: 128,
    shortParticipants: 74,
  },
  "BTC:OKB": {
    longAmount: 18_420,
    shortAmount: 12_860,
    longParticipants: 96,
    shortParticipants: 58,
  },
  "BTC:TEST": {
    longAmount: 9_200,
    shortAmount: 7_800,
    longParticipants: 88,
    shortParticipants: 71,
  },
  "ETH:BEM": {
    longAmount: 860_000,
    shortAmount: 1_040_000,
    longParticipants: 83,
    shortParticipants: 112,
  },
  "ETH:OKB": {
    longAmount: 9_640,
    shortAmount: 14_200,
    longParticipants: 61,
    shortParticipants: 87,
  },
  "ETH:TEST": {
    longAmount: 6_400,
    shortAmount: 5_200,
    longParticipants: 54,
    shortParticipants: 43,
  },
  "SOL:BEM": {
    longAmount: 420_000,
    shortAmount: 310_000,
    longParticipants: 47,
    shortParticipants: 36,
  },
  "SOL:OKB": {
    longAmount: 5_280,
    shortAmount: 4_960,
    longParticipants: 39,
    shortParticipants: 34,
  },
  "SOL:TEST": {
    longAmount: 3_800,
    shortAmount: 4_100,
    longParticipants: 36,
    shortParticipants: 39,
  },
  "HYPE:BEM": {
    longAmount: 680_000,
    shortAmount: 920_000,
    longParticipants: 66,
    shortParticipants: 91,
  },
  "HYPE:OKB": {
    longAmount: 7_400,
    shortAmount: 6_100,
    longParticipants: 44,
    shortParticipants: 37,
  },
  "HYPE:TEST": {
    longAmount: 820_000,
    shortAmount: 690_000,
    longParticipants: 58,
    shortParticipants: 47,
  },
};

export function betPoolFor(
  marketSymbol: string,
  betTokenSymbol: string,
  roundStartBlock: number,
): Pick<
  BetPool,
  | "longAmount"
  | "shortAmount"
  | "longParticipants"
  | "shortParticipants"
  | "winner"
> | null {
  const base = BET_POOLS[`${marketSymbol}:${betTokenSymbol}`];
  if (!base) return null;

  const rand = mulberry32(
    hashString(`bet-pool:${marketSymbol}:${betTokenSymbol}:${roundStartBlock}`),
  );
  const amountScale = 0.72 + rand() * 0.56;
  const longScale = 0.88 + rand() * 0.24;
  const shortScale = 0.88 + rand() * 0.24;
  const resultRand = mulberry32(
    hashString(`bet-result:${marketSymbol}:${betTokenSymbol}:${roundStartBlock}`),
  );

  return {
    longAmount: Math.max(1, Math.round(base.longAmount * amountScale * longScale)),
    shortAmount: Math.max(1, Math.round(base.shortAmount * amountScale * shortScale)),
    longParticipants: Math.max(1, Math.round(base.longParticipants * longScale)),
    shortParticipants: Math.max(1, Math.round(base.shortParticipants * shortScale)),
    winner: resultRand() < 0.5 ? "long" : "short",
  };
}

export function myBetFor(
  marketSymbol: string,
  betTokenSymbol: string,
  roundStartBlock: number,
): MyBet | null {
  const token = BET_TOKENS.find((entry) => entry.symbol === betTokenSymbol);
  if (!token || Math.floor(roundStartBlock / 300) % 17 === 0) return null;

  const rand = mulberry32(
    hashString(`my-bet:${marketSymbol}:${betTokenSymbol}:${roundStartBlock}`),
  );
  const count = 1 + Math.floor(rand() * 3);
  const maxAmount = token.symbol === "BEM" ? 5_000 : 3;
  const roundAmount =
    token.symbol === "BEM"
      ? (value: number) => Math.round(value)
      : (value: number) => Math.round(value * 100) / 100;
  const amount = roundAmount((0.15 + rand() * 0.8) * maxAmount);
  const bothSides = count > 1 && rand() < 0.45;

  if (!bothSides) {
    const side = rand() < 0.55 ? "long" : "short";
    return {
      marketSymbol,
      betTokenSymbol,
      roundStartBlock,
      count,
      amount,
      longCount: side === "long" ? count : 0,
      longAmount: side === "long" ? amount : 0,
      shortCount: side === "short" ? count : 0,
      shortAmount: side === "short" ? amount : 0,
    };
  }

  const longCount = 1 + Math.floor(rand() * (count - 1));
  const shortCount = count - longCount;
  const longAmount = roundAmount(amount * (0.3 + rand() * 0.4));
  const shortAmount = roundAmount(amount - longAmount);

  return {
    marketSymbol,
    betTokenSymbol,
    roundStartBlock,
    count,
    amount: longAmount + shortAmount,
    longCount,
    longAmount,
    shortCount,
    shortAmount,
  };
}

/* -------------------------------------------------------------------------- */
/*  Markets                                                                    */
/* -------------------------------------------------------------------------- */

export const TOKENS: Token[] = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    price: 78325.0,
    change24h: 1.88,
    volume24h: 3_430_000_000,
    category: "crypto",
    kind: "perp",
    icon: ICONS.BTC,
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    price: 2315.09,
    change24h: 2.83,
    volume24h: 1_300_000_000,
    category: "crypto",
    kind: "perp",
    icon: ICONS.ETH,
  },
  {
    symbol: "SOL",
    name: "Solana",
    price: 692.959,
    change24h: 0.88,
    volume24h: 260_000_000,
    category: "crypto",
    kind: "perp",
    icon: ICONS.SOL,
  },
  {
    symbol: "HYPE",
    name: "Hyperliquid",
    price: 60.498,
    change24h: 2.37,
    volume24h: 520_000_000,
    category: "crypto",
    kind: "perp",
    icon: ICONS.HYPE,
  },
];

const TIMEFRAME_MS: Record<Timeframe, number> = {
  "15s": 15_000,
  "30s": 30_000,
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

function hashString(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 1_831_565_813) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const candleCache = new Map<string, Candle[]>();

export function makeCandles(token: Token, timeframe: Timeframe, count = 110): Candle[] {
  const cacheKey = `${token.symbol}:${timeframe}:${count}`;
  const cached = candleCache.get(cacheKey);
  if (cached) return cached;

  const rand = mulberry32(hashString(cacheKey));
  const step = TIMEFRAME_MS[timeframe];
  const startTime = Math.floor(Date.now() / step) * step - (count - 1) * step;
  const volatility =
    timeframe === "1d"
      ? 0.018
      : timeframe === "4h"
        ? 0.011
        : timeframe === "1h"
          ? 0.006
          : timeframe === "15s"
            ? 0.0006
            : timeframe === "30s"
              ? 0.001
              : 0.0028;
  const drift = (token.change24h / 100 / count) * 1.6;
  let previous = token.price * (1 - token.change24h / 100);
  const candles: Candle[] = [];

  for (let index = 0; index < count; index++) {
    const change = drift + (rand() - 0.5) * volatility;
    const open = previous;
    const close = Math.max(0.000001, open * (1 + change));
    const wick = volatility * (0.25 + rand() * 0.8);
    const high = Math.max(open, close) * (1 + wick * rand());
    const low = Math.min(open, close) * (1 - wick * rand());
    const volume =
      (token.volume24h / 1440) *
      (TIMEFRAME_MS[timeframe] / 60_000) *
      (0.35 + rand() * 1.6);

    candles.push({
      time: startTime + index * step,
      open,
      high,
      low,
      close,
      volume,
    });
    previous = close;
  }

  const scale = token.price / candles[candles.length - 1].close;
  const normalized = candles.map((candle) => ({
    time: candle.time,
    open: candle.open * scale,
    high: candle.high * scale,
    low: candle.low * scale,
    close: candle.close * scale,
    volume: candle.volume,
  }));

  candleCache.set(cacheKey, normalized);
  return normalized;
}



const FEED: FeedItem[] = [
  {
    id: "f1",
    name: "NORH7",
    avatar: "linear-gradient(135deg,#f97316,#7c2d12)",
    action: "已开仓",
    side: "short",
    amountUsd: 86_898_818,
    price: 78_415,
    time: "5分钟",
    content: "78,400 上方全是诱多，这里是顶，别恋战。",
  },
  {
    id: "f2",
    name: "Crumpet_Eth",
    avatar: "linear-gradient(135deg,#60a5fa,#312e81)",
    action: "已平仓",
    side: "long",
    amountUsd: 7_182_642,
    price: 78_413,
    time: "7分钟",
    content: "这一段反抽吃到了，止盈走人，剩下的不赌。",
  },
  {
    id: "f3",
    name: "DoctorFait",
    avatar: "linear-gradient(135deg,#34d399,#064e3b)",
    action: "已平仓",
    side: "short",
    amountUsd: 15_415_130,
    price: 78_429,
    time: "8分钟",
    content: "空单先平了，等它再冲一次前高再说。",
  },
  {
    id: "f4",
    name: "kamaaride",
    avatar: "linear-gradient(135deg,#facc15,#78350f)",
    action: "已开仓",
    side: "long",
    amountUsd: 4_264_446,
    price: 78_362,
    time: "15分钟",
    content: "周线结构没破，回踩就是机会，先建个底仓。",
  },
  {
    id: "f5",
    name: "McMillionaire",
    avatar: "linear-gradient(135deg,#e879f9,#581c87)",
    action: "已开仓",
    side: "short",
    amountUsd: 1_235_890,
    price: 78_370,
    time: "15分钟",
    content: "量能跟不上，涨得再漂亮也是假突破。",
  },
  {
    id: "f6",
    name: "kamaaride",
    avatar: "linear-gradient(135deg,#facc15,#78350f)",
    action: "已平仓",
    side: "long",
    amountUsd: 7_685_885,
    price: 78_387,
    time: "16分钟",
    content: "先落袋，这一波节奏比我预想的快。",
  },
];

/* -------------------------------------------------------------------------- */
/*  Market activity                                                            */
/* -------------------------------------------------------------------------- */


/* -------------------------------------------------------------------------- */
/*  My holdings                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Rows shown under 我的持仓. `roundOffset` is relative to the active round, so
 * the status column keeps rotating as the block clock advances instead of
 * freezing on a fixed date.
 */
export const MY_HOLDINGS: BetHolding[] = [
  {
    id: "hold-1",
    marketSymbol: "BTC",
    betTokenSymbol: "OKB",
    amount: 0.5,
    time: "14:32",
    roundOffset: 0,
  },
  {
    id: "hold-2",
    marketSymbol: "BTC",
    betTokenSymbol: "BEM",
    amount: 2_000,
    time: "13:58",
    roundOffset: -1,
  },
  {
    id: "hold-3",
    marketSymbol: "ETH",
    betTokenSymbol: "OKB",
    amount: 0.25,
    time: "13:41",
    roundOffset: -2,
  },
  {
    id: "hold-4",
    marketSymbol: "SOL",
    betTokenSymbol: "TEST",
    amount: 500,
    time: "14:05",
    roundOffset: 0,
  },
];

/* -------------------------------------------------------------------------- */
/*  Profile                                                                    */
/* -------------------------------------------------------------------------- */

export const DEMO_PROFILE: Profile = {
  handle: "end837",
  name: "end",
  bio: "the last dance",
  avatar: "linear-gradient(135deg,#5eead4,#2563eb 55%,#4c1d95)",
  followers: "12.8万",
  following: 17,
  mutual: 0,
  joined: "2026年4月",
  badges: [
    { label: "前100", tone: "gold" },
    { label: "平均持有 6 小时", tone: "neutral" },
    { label: "20 笔交易", tone: "neutral" },
    { label: "加入于 2026年4月", tone: "neutral" },
  ],
  cash: 114_051.44,
  equity: 623_470.28,
  equityChange24h: 31_258.84,
  equityChangePct: 5.28,
  rank: 1328,
};

const POSITIONS: Position[] = [
  {
    symbol: "GOLD",
    name: "Gold",
    icon: ICONS.GOLD,
    kind: "perp",
    leverage: 20,
    side: "long",
    avgPrice: 3_945.1,
    size: "519.76 GOLD",
    sizeUnit: "GOLD",
    sizeUsd: 2_050_574.49,
    pnl: 1_333.85,
    pnlPct: 0.65,
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    icon: ICONS.ETH,
    kind: "perp",
    leverage: 20,
    side: "long",
    avgPrice: 2_315.3,
    size: "431.96 ETH",
    sizeUnit: "ETH",
    sizeUsd: 1_001_043.89,
    pnl: -950.01,
    pnlPct: -1.9,
  },
  {
    symbol: "LIT",
    name: "Litentry",
    icon: ICONS.LIT,
    kind: "perp",
    leverage: 20,
    side: "short",
    avgPrice: 3_364.3,
    size: "20.67 LIT",
    sizeUnit: "LIT",
    sizeUsd: 681_928.88,
    pnl: 13_408.53,
    pnlPct: 9.43,
  },
  {
    symbol: "CASHCOAT",
    name: "Cashcoat",
    icon: ICONS.CASHCOAT,
    kind: "perp",
    leverage: 20,
    side: "short",
    avgPrice: 0.11557,
    size: "12.3万 CASHCOAT",
    sizeUnit: "CASHCOAT",
    sizeUsd: 139_507.23,
    pnl: 7_866.07,
    pnlPct: 16.21,
  },
  {
    symbol: "SOL",
    name: "Solana",
    icon: ICONS.SOL,
    kind: "spot",
    leverage: 1,
    side: "long",
    avgPrice: 574.5,
    size: "0.049 SOL",
    sizeUnit: "SOL",
    sizeUsd: 416.0,
    pnl: -0.13,
    pnlPct: -2.92,
  },
  {
    symbol: "GATO",
    name: "Gato",
    icon: ICONS.GATO,
    kind: "spot",
    leverage: 1,
    side: "long",
    avgPrice: 0.00037,
    size: "279.53 GATO",
    sizeUnit: "GATO",
    sizeUsd: 2.99,
    pnl: 1.99,
    pnlPct: 199.31,
  },
  {
    symbol: "UNITY",
    name: "Unity",
    icon: ICONS.UNITY,
    kind: "spot",
    leverage: 1,
    side: "long",
    avgPrice: 142_000,
    size: "171.4 UNITY",
    sizeUnit: "UNITY",
    sizeUsd: 2.32,
    pnl: -0.01,
    pnlPct: -4.57,
  },
];

const ACTIVITY: Activity[] = [
  {
    id: "a1",
    symbol: "ETH",
    name: "Ethereum",
    icon: ICONS.ETH,
    kind: "perp",
    action: "已开仓",
    side: "short",
    amountUsd: 159_099.97,
    price: 2_314.6,
    time: "1小时",
  },
  {
    id: "a2",
    symbol: "ETH",
    name: "Ethereum",
    icon: ICONS.ETH,
    kind: "perp",
    action: "已平仓",
    side: "short",
    amountUsd: 208_998.96,
    price: 2_316.4,
    time: "1小时",
  },
  {
    id: "a3",
    symbol: "FPUMP",
    name: "TikTap pump",
    icon: ICONS.FPUMP,
    kind: "spot",
    action: "卖出",
    amountUsd: 1_027.37,
    price: 0.000_001,
    marketCap: 259_000,
    time: "4天",
  },
  {
    id: "a4",
    symbol: "FPUMP",
    name: "TikTap pump",
    icon: ICONS.FPUMP,
    kind: "spot",
    action: "买入",
    amountUsd: 987.0,
    price: 0.000_000_6,
    marketCap: 3_821_000,
    time: "1周",
  },
  {
    id: "a5",
    symbol: "FPUMP",
    name: "TikTap pump",
    icon: ICONS.FPUMP,
    kind: "spot",
    action: "买入",
    amountUsd: 987.0,
    price: 0.000_000_6,
    marketCap: 3_948_000,
    time: "1周",
  },
  {
    id: "a6",
    symbol: "FPUMP",
    name: "TikTap pump",
    icon: ICONS.FPUMP,
    kind: "spot",
    action: "买入",
    amountUsd: 987.0,
    price: 0.000_000_6,
    marketCap: 4_320_000,
    time: "1周",
  },
  {
    id: "a7",
    symbol: "FPUMP",
    name: "TikTap pump",
    icon: ICONS.FPUMP,
    kind: "spot",
    action: "买入",
    amountUsd: 987.0,
    price: 0.000_000_6,
    marketCap: 5_460_000,
    time: "1周",
  },
  {
    id: "a8",
    symbol: "FPUMP",
    name: "TikTap pump",
    icon: ICONS.FPUMP,
    kind: "spot",
    action: "买入",
    amountUsd: 987.0,
    price: 0.000_000_6,
    marketCap: 5_590_000,
    time: "1周",
  },
  {
    id: "a9",
    symbol: "FPUMP",
    name: "TikTap pump",
    icon: ICONS.FPUMP,
    kind: "spot",
    action: "买入",
    amountUsd: 987.0,
    price: 0.000_000_6,
    marketCap: 5_240_000,
    time: "1周",
  },
  {
    id: "a10",
    symbol: "FPUMP",
    name: "TikTap pump",
    icon: ICONS.FPUMP,
    kind: "spot",
    action: "买入",
    amountUsd: 987.0,
    price: 0.000_000_6,
    marketCap: 4_821_000,
    time: "1周",
  },
  {
    id: "a11",
    symbol: "FPUMP",
    name: "TikTap pump",
    icon: ICONS.FPUMP,
    kind: "spot",
    action: "买入",
    amountUsd: 987.0,
    price: 0.000_000_6,
    marketCap: 4_770_000,
    time: "1周",
  },
];

export const LEADERBOARD: LeaderboardEntry[] = [
  {
    rank: 1,
    name: "sats69",
    handle: "sats69",
    avatar: "linear-gradient(135deg,#c084fc,#4c1d95)",
    pnl: 1_304_332.91,
    pnlPct: 7_751.21,
  },
  {
    rank: 2,
    name: "Rowdy",
    handle: "rowdy",
    avatar: "linear-gradient(135deg,#38bdf8,#1e3a8a)",
    pnl: 342_880.11,
    pnlPct: 859.01,
  },
  {
    rank: 3,
    name: "NORH7",
    handle: "norh7",
    avatar: "linear-gradient(135deg,#f97316,#7c2d12)",
    pnl: 148_764.76,
    pnlPct: 59.82,
  },
  {
    rank: 4,
    name: "Arkive_sabb",
    handle: "arkive_sabb",
    avatar: "linear-gradient(135deg,#f59e0b,#7c2d12)",
    pnl: 97_751.21,
    pnlPct: 42.16,
  },
  {
    rank: 5,
    name: "ceralbertraders",
    handle: "ceralbertraders",
    avatar: "linear-gradient(135deg,#a3e635,#14532d)",
    pnl: 84_008.4,
    pnlPct: 31.09,
  },
  {
    rank: 6,
    name: "Hodlz",
    handle: "hodlz",
    avatar: "linear-gradient(135deg,#fb7185,#7f1d1d)",
    pnl: 61_338.5,
    pnlPct: 24.0,
  },
];

/* -------------------------------------------------------------------------- */
/*  Derived time series                                                        */
/* -------------------------------------------------------------------------- */

const equityCache = new Map<string, EquityPoint[]>();

export function makeEquity(range: Range): EquityPoint[] {
  const cached = equityCache.get(range);
  if (cached) return cached;

  const spec: Record<Range, { points: number; step: number; change: number }> = {
    "24h": {
      points: 96,
      step: 15 * 60_000,
      change: DEMO_PROFILE.equityChange24h,
    },
    "7d": { points: 84, step: 2 * 3_600_000, change: DEMO_PROFILE.equity * 0.16 },
    "30d": { points: 90, step: 8 * 3_600_000, change: DEMO_PROFILE.equity * 0.38 },
  };
  const { points, step, change } = spec[range];
  const rand = mulberry32(hashString(`equity:${range}`));
  const end = Math.floor(Date.now() / step) * step;
  const endValue = DEMO_PROFILE.equity;
  const startValue = endValue - change;
  const amplitude = Math.max(1_500, (endValue - startValue) * 0.12);

  // Build a noisy walk that is pinned to the start/end values: the sine
  // envelope fades the noise to zero at both edges, so the headline change
  // and the chart always agree.
  let walk = 0;
  const out: EquityPoint[] = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    walk = walk * 0.82 + (rand() - 0.5) * amplitude;
    const base = startValue + (endValue - startValue) * t;
    const envelope = Math.sin(Math.PI * t);
    out.push({
      t: end - (points - 1 - i) * step,
      v: Math.max(1, base + walk * envelope),
    });
  }
  out[0].v = startValue;
  out[out.length - 1].v = endValue;

  equityCache.set(range, out);
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Getters used by the mock API                                               */
/* -------------------------------------------------------------------------- */

function rotatedForRound<T>(items: T[], roundStartBlock?: number): T[] {
  if (roundStartBlock === undefined || items.length === 0) return items;

  const shift = Math.abs(Math.floor(roundStartBlock / 300)) % items.length;
  return [...items.slice(shift), ...items.slice(0, shift)];
}

/**
 * Traders the demo account follows. Kept as one list instead of a flag on every
 * fixture so the three 仅看已关注 filters always agree with each other.
 */
const FOLLOWED_TRADERS = new Set(["Rowdy", "kamaaride", "sats69", "NORH7"]);

function withFollow<T extends { name: string }>(items: T[]): Array<T & { followed: boolean }> {
  return items.map((item) => ({ ...item, followed: FOLLOWED_TRADERS.has(item.name) }));
}

export function feedFor(_symbol: string, roundStartBlock?: number): FeedItem[] {
  return withFollow(rotatedForRound(FEED, roundStartBlock));
}

export function positionsFor(_handle: string): Position[] {
  return POSITIONS;
}

export function activityFor(_handle: string): Activity[] {
  return ACTIVITY;
}

export function profileFor(handle: string): Profile {
  if (handle === DEMO_PROFILE.handle) return DEMO_PROFILE;

  const trader = LEADERBOARD.find((entry) => entry.handle === handle);
  if (!trader) return { ...DEMO_PROFILE, handle };

  return {
    ...DEMO_PROFILE,
    handle: trader.handle,
    name: trader.name,
    avatar: trader.avatar,
    bio: "在 TikTap 寻找下一次机会",
    followers: trader.rank === 1 ? "4.2万" : "1.8万",
    following: 32 + trader.rank,
  };
}
