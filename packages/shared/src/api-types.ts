export type MarketCategory =
  | "crypto"
  | "meme"
  | "stocks"
  | "commodities"
  | "indices"
  | "fx"
  | "preipo";

export type SidebarTabId =
  | "watchlist"
  | "market"
  | "leaderboard"
  | "activity";

export interface SidebarTabItem {
  id: SidebarTabId;
  label: string;
}

export interface SidebarCategoryItem {
  id: MarketCategory | "all";
  label: string;
}

export interface SidebarMenu {
  tabs: SidebarTabItem[];
  categories: SidebarCategoryItem[];
}

export type MarketKind = "spot" | "perp";

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export type Range = "24h" | "7d" | "30d";

export type Side = "long" | "short";

export interface TokenIcon {
  bg: string;
  glyph: string;
  fg?: string;
}

export interface Token {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap?: number;
  category: MarketCategory;
  kind: MarketKind;
  icon: TokenIcon;
}

/** Settlement token used for up/down bets on XLayer. */
export interface BetToken {
  symbol: string;
  name: string;
  balance: number;
  priceUsd: number;
  icon: TokenIcon;
}

/** Pari-mutuel pools for one market + settlement token round. */
export interface BetPool {
  marketSymbol: string;
  betTokenSymbol: string;
  roundStartBlock: number;
  longAmount: number;
  shortAmount: number;
  longParticipants: number;
  shortParticipants: number;
  /** Settled rounds only; `null` while the round is still open (or refunded). */
  winner: Side | null;
  /** 链上 marketId（配了合约时才有）。 */
  marketId?: number | null;
  /** 单边池 / 作废轮：按原额退款。 */
  refund?: boolean;
}

/** The current user's activity in one pari-mutuel round. */
export interface MyBet {
  marketSymbol: string;
  betTokenSymbol: string;
  roundStartBlock: number;
  count: number;
  amount: number;
  longCount: number;
  longAmount: number;
  shortCount: number;
  shortAmount: number;
  settled?: boolean;
  refund?: boolean;
  winner?: Side | null;
  /** 已结算时可领回的数量（代币单位）。 */
  claimable?: number;
  claimed?: boolean;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Holder {
  id: string;
  name: string;
  avatar: string;
  leverage: number;
  side: Side;
  holding: string;
  size: string;
  sizeUsd: number;
  pnl: number;
  pnlPct: number;
  avgPrice: number;
  note?: string;
  /** Whether the demo account follows this trader; drives 仅看已关注. */
  followed?: boolean;
}

export interface FeedItem {
  id: string;
  name: string;
  avatar: string;
  action: "已开仓" | "已平仓" | "买入" | "卖出";
  side?: Side;
  amountUsd: number;
  price: number;
  time: string;
  /** The trader's own words for this round; rendered in the 观点 list. */
  content?: string;
  /** Whether the demo account follows this trader; drives 仅看已关注. */
  followed?: boolean;
}

/** One row in the 活动 list: who bet which way, how much, how long ago. */
export interface MarketActivity {
  id: string;
  name: string;
  avatar: string;
  side: Side;
  amountUsd: number;
  time: string;
  /** Whether the demo account follows this trader; drives 仅看已关注. */
  followed?: boolean;
}

/** One row of 我的持仓: a bet the user already placed. */
export interface BetHolding {
  id: string;
  /** Underlying market, e.g. BTC. */
  marketSymbol: string;
  /** Settlement token, e.g. OKB. */
  betTokenSymbol: string;
  /** Bet size in bet-token units. */
  amount: number;
  /** Clock time the bet was placed. */
  time: string;
  /** Offset from the active round: 0 bets now, -1 waits for settlement, -2 settled. */
  roundOffset: number;
  /** 该轮的起始块（链上真值）。 */
  roundStartBlock?: number;
}

export interface Position {
  symbol: string;
  name: string;
  icon: TokenIcon;
  kind: "spot" | "perp";
  leverage: number;
  side: Side;
  avgPrice: number;
  size: string;
  sizeUnit: string;
  sizeUsd: number;
  pnl: number;
  pnlPct: number;
}

export interface Activity {
  id: string;
  symbol: string;
  name: string;
  icon: TokenIcon;
  kind: "spot" | "perp";
  action: "已开仓" | "已平仓" | "买入" | "卖出";
  side?: Side;
  amountUsd: number;
  price: number;
  marketCap?: number;
  time: string;
}

export interface Badge {
  label: string;
  tone: "gold" | "green" | "purple" | "neutral";
}

export interface Profile {
  handle: string;
  name: string;
  bio: string;
  avatar: string;
  followers: string;
  following: number;
  mutual: number;
  joined: string;
  badges: Badge[];
  cash: number;
  equity: number;
  equityChange24h: number;
  equityChangePct: number;
  rank: number;
}

export interface EquityPoint {
  t: number;
  v: number;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  handle: string;
  avatar: string;
  pnl: number;
  pnlPct: number;
}

export type AuthProvider = "okx" | "demo";

export interface AuthUser {
  name: string;
  handle: string;
  email: string;
  provider: AuthProvider;
  address?: string;
  chainId?: string;
}
