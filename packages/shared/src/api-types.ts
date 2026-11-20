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

export type Timeframe = "15s" | "30s" | "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

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
  /** 临时停用：按钮保留展示，但不可选中、后端也拒绝下注。 */
  disabled?: boolean;
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
  /** 领奖扣除的费率（bps），用于估算实际到手百分比。 */
  feeBps: number;
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
  address: string;
  /** 这条聚合记录对应的轮次 startBlock；「仅看本轮」用它过滤。 */
  roundId?: number;
  name: string;
  avatar: string;
  /** 买涨：笔数 / 金额（带单位）。 */
  longCount: number;
  longAmount: string;
  /** 买跌：笔数 / 金额（带单位）。 */
  shortCount: number;
  shortAmount: string;
  /** 结算后：是否获胜。 */
  won?: boolean;
  /** 结算后：这轮收到的数量（带单位）。 */
  received?: string;
  /** 结算后：盈亏（带单位和正负号）。 */
  pnl?: string;
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
export type ActivityKind = "bet" | "settle" | "claim";

export interface MarketActivity {
  id: string;
  kind: ActivityKind;
  name: string;
  avatar: string;
  /** 触发这条活动的托管地址；系统结算没有地址，头像不可点。 */
  address?: string;
  /** 下注方向 / 开奖结果；领取事件没有方向。 */
  side: Side | null;
  /** 带单位的金额，例如 "10 TEST"；结算事件为空串。 */
  amount: string;
  time: string;
  /** 对应链上交易，前端可展示缩略 hash。 */
  txHash: string;
  /** 这条活动属于哪一轮（「仅看本轮」筛选用）。 */
  roundIndex: number;
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

/** 单个下注代币的个人统计（金额用该代币数量，不再折 USD）。 */
export interface ProfileTokenStats {
  symbol: string;
  /** 总下注额（代币数量）。 */
  volume: number;
  /** 已结算累计盈亏（代币数量，未结算和退款轮不计）。 */
  pnl: number;
  /** 已结算累计盈亏折 USD，仅用于排序 / 兼容旧展示。 */
  pnlUsd: number;
  bets: number;
  rounds: number;
  wonRounds: number;
  lostRounds: number;
  drawRounds: number;
  settledRounds: number;
  openRounds: number;
  /** 胜率（0–100，按已分胜负的轮次算）。 */
  winRate: number;
}

/** 个人主页统计：按「地址 × 市场 × 轮次」从 bets 聚合；汇总保留 USD，同时按代币拆开。 */
export interface ProfileStats {
  /** 参与过的轮次数（市场 × 轮次去重）。 */
  rounds: number;
  /** 下注笔数。 */
  bets: number;
  /** 总下注额（USD）。 */
  volumeUsd: number;
  /** 已结算的累计盈亏（USD，未结算的不算）。 */
  pnlUsd: number;
  /** 胜率（0–100，按参与轮次算，净盈亏 > 0 记胜）。 */
  winRate: number;
  wonRounds: number;
  lostRounds: number;
  /** 已结算但不输不赢（双边对冲 / 单边退款后）。 */
  drawRounds: number;
  /** 已结算轮次总数（won + lost + draw，不含退款轮）。 */
  settledRounds: number;
  /** 还没结算的轮次。 */
  openRounds: number;
  /** 按下注代币拆开的统计，顺序为 OKB / BEM / TEST。 */
  byToken: ProfileTokenStats[];
}

export type ProfileRoundStatus = "open" | "settled" | "claimed" | "refunded";

/** 个人主页的一条「参与轮次」汇总。 */
export interface ProfileRound {
  id: string;
  symbol: string;
  betToken: string;
  roundId: number;
  roundStartBlock: number;
  /** 两边合计，带单位，例如 "15 TEST"。 */
  amount: string;
  longAmount?: string;
  shortAmount?: string;
  /** 只押了一边才有方向；两边都押是 null。 */
  side: Side | null;
  bets: number;
  status: ProfileRoundStatus;
  /** 本轮结算结果（涨/跌），未结算或退款是 null。 */
  winner: Side | null;
  /** 净盈亏 > 0 算赢；未结算/退款是 null。 */
  won: boolean | null;
  /** 实际收到（带单位），未结算为 null。 */
  payout: string | null;
  /** 带正负号，例如 "+2.5 TEST"。 */
  pnl: string | null;
  createdAt: number;
  settledAt: number | null;
}

export type ProfileEventKind = "bet" | "settle" | "claim" | "opinion";

/** 个人主页活动流的一条事件。 */
export interface ProfileEvent {
  id: string;
  kind: ProfileEventKind;
  symbol: string | null;
  betToken: string | null;
  roundId: number | null;
  side: Side | null;
  amount: string | null;
  /** 观点正文（kind = opinion 时）。 */
  body?: string | null;
  time: string;
  createdAt: number;
  txHash?: string | null;
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
  cash: number;
  equity: number;
  equityChange24h: number;
  equityChangePct: number;
  rank: number;
  /** 当前访问者是否已关注 TA（未登录 / 自己 / mock 用户时为 false）。 */
  isFollowing?: boolean;
  /** 排行榜里的老 mock 用户：没有真实账号，不能关注。 */
  isMock?: boolean;
  /** 托管地址（无链上记录 / mock 用户时为空）。 */
  address?: string;
  /** 真实下注统计。 */
  stats?: ProfileStats;
}

export interface EquityPoint {
  t: number;
  v: number;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  /** X handle（没绑 X 账号时为 null）。 */
  xHandle?: string | null;
  /** 个人页路由用：地址（个人页路由也支持地址）。 */
  handle: string;
  avatar: string;
  pnl: number;
  pnlPct: number;
}

/** 粉丝 / 关注列表里的一个用户。 */
export interface FollowEntry {
  /** 个人页路由用：X handle，没有则用地址。 */
  handle: string;
  name: string;
  avatar: string;
  address: string;
  /** TA 自己的粉丝数。 */
  followers: number;
  /** 当前访问者是否已关注 TA（未登录为 false）。 */
  isFollowing: boolean;
  /** 这一条是不是当前访问者自己。 */
  isSelf: boolean;
}

export interface FollowList {
  total: number;
  items: FollowEntry[];
}

export type AuthProvider = "x" | "demo";

export interface AuthUser {
  name: string;
  handle: string;
  email: string;
  provider: AuthProvider;
  /** X 的数字 id：稳定、改名不变，后端按它复用账号。 */
  xId?: string;
  address?: string;
  chainId?: string;
}
/** 市场级观点（一条帖子）。 */
export interface MarketOpinion {
  id: string;
  address: string;
  name: string;
  avatar: string;
  body: string;
  side: Side | null;
  /** 发布时所在轮次，前端用来筛「仅看本轮」。 */
  roundId: number | null;
  /** 观点所在市场：标的。 */
  symbol?: string;
  /** 这条观点发在哪个下注代币市场。 */
  betToken?: string;
  /** 作者在这个市场、这一轮的下注总额（带单位），没下注就是空。 */
  betAmount?: string;
  time: string;
  followed?: boolean;
}
