import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Check,
  CircleDollarSign,
  Copy,
  Loader2,
  MessageSquare,
  Trophy,
} from "lucide-react";
import {
  faucet,
  getActivity,
  getBetTokens,
  getEquityCurve,
  getPositions,
  getProfile,
  getProfileRounds,
  getWallet,
} from "@/api";
import type {
  BetToken,
  EquityPoint,
  Profile as ProfileType,
  ProfileEvent,
  ProfileRound,
  ProfileStats,
  Range,
} from "@/api/types";
import { Avatar } from "@/components/Avatar";
import { AreaChart } from "@/components/charts/AreaChart";
import { TokenIcon } from "@/components/TokenIcon";
import { useAuth } from "@/context/AuthContext";
import { useBetToken } from "@/context/BetTokenContext";
import { useToast } from "@/context/ToastContext";
import { cn } from "@/lib/cn";
import { fmtSignedUsd, fmtUsd, shortAddress } from "@/lib/format";
import { useApi } from "@/lib/useApi";

const EMPTY_STATS: ProfileStats = {
  rounds: 0,
  bets: 0,
  volumeUsd: 0,
  pnlUsd: 0,
  winRate: 0,
  wonRounds: 0,
  lostRounds: 0,
  drawRounds: 0,
  settledRounds: 0,
  openRounds: 0,
};

function ago(ts: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - ts) / 60_000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export default function Profile() {
  const { handle = "end837" } = useParams();
  const [range, setRange] = useState<Range>("24h");

  const profileState = useApi(() => getProfile(handle), [handle]);
  const roundsState = useApi(() => getProfileRounds(handle), [handle]);
  const positionsState = useApi(() => getPositions(handle), [handle]);
  const activityState = useApi(() => getActivity(handle), [handle]);
  const equityState = useApi(() => getEquityCurve(handle, range), [handle, range]);
  const profileAddress = profileState.data?.address ?? null;
  const tokensState = useApi(getBetTokens, []);
  const walletState = useApi(
    () => (profileAddress ? getWallet(profileAddress) : Promise.resolve(null)),
    [profileAddress],
  );

  if (!profileState.data) return <ProfileSkeleton />;

  const stats = profileState.data.stats ?? EMPTY_STATS;

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="px-3 pb-3 pt-4">
        <ProfileHeader profile={profileState.data} />

        <StatsRow stats={stats} />

        <div className="mt-3 grid grid-cols-1 gap-3 min-[1400px]:grid-cols-[minmax(0,1.13fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-3">
            <BalanceCard
              address={profileAddress}
              wallet={walletState.data}
              tokens={tokensState.data ?? []}
              loading={walletState.loading}
              onRefresh={walletState.reload}
            />
            <EquityCard
              stats={stats}
              equity={equityState.data ?? []}
              range={range}
              onRangeChange={setRange}
              loading={equityState.loading}
            />
            <PositionsCard
              rounds={positionsState.data ?? []}
              loading={positionsState.loading}
            />
            <RoundsCard rounds={roundsState.data ?? []} loading={roundsState.loading} />
          </div>
          <ActivityCard
            events={activityState.data ?? []}
            loading={activityState.loading}
          />
        </div>
      </div>
    </div>
  );
}

function ProfileHeader({ profile }: { profile: ProfileType }) {
  const { push } = useToast();
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    if (!profile.address) return;
    void navigator.clipboard.writeText(profile.address).then(() => {
      setCopied(true);
      push("地址已复制", "success");
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <section>
      <div
        data-testid="profile-banner"
        className="relative -mx-3 h-[76px] overflow-hidden border-b border-white/[0.04] bg-[#0c0c11]"
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(110deg, #141622 0%, #2e234c 38%, #1a1730 66%, #0c0c11 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 12% 0%, rgba(111,92,245,0.35), transparent 55%), radial-gradient(ellipse at 55% 120%, rgba(94,234,212,0.12), transparent 45%)",
          }}
        />
        <div className="landing-grid absolute inset-0 opacity-30" />
        <div className="absolute -right-16 -top-28 h-64 w-64 rounded-full bg-brand/20 blur-3xl" />
        <div className="absolute left-1/3 top-0 h-px w-1/2 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      </div>

      <div className="relative z-10 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-1">
        <div className="flex min-w-0 items-end gap-3">
          <div
            data-testid="profile-avatar"
            className="relative z-10 -mt-7 rounded-full bg-ink p-[3px] shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
          >
            <Avatar name={profile.name} gradient={profile.avatar} size={58} />
          </div>
          <div className="min-w-0 pb-0.5">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-[21px] font-semibold leading-none tracking-tight text-white">
                {profile.name}
              </h1>
              <span className="truncate text-[10px] text-muted2">@{profile.handle}</span>
              {profile.stats && (
                <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-brand2" />
              )}
            </div>
            <div className="mt-1.5 flex min-w-0 items-center gap-2">
              {profile.address ? (
                <button
                  type="button"
                  onClick={copyAddress}
                  title={profile.address}
                  className="num inline-flex min-w-0 items-center gap-1 rounded border border-line bg-panel px-1.5 py-[2px] text-[9px] text-muted transition hover:border-line2 hover:text-white"
                >
                  <span className="truncate">{shortAddress(profile.address)}</span>
                  {copied ? (
                    <Check className="h-2.5 w-2.5 shrink-0 text-up" />
                  ) : (
                    <Copy className="h-2.5 w-2.5 shrink-0" />
                  )}
                </button>
              ) : (
                <span className="text-[10.5px] text-muted2">该用户还没有链上记录</span>
              )}
              <span className="text-[10px] text-muted2">加入于 {profile.joined}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pb-1">
          {profile.badges.map((badge) => (
            <BadgeChip key={badge.label} badge={badge} />
          ))}
        </div>
      </div>
    </section>
  );
}

const BADGE_TONES: Record<ProfileType["badges"][number]["tone"], string> = {
  gold: "border-[#5d4a1c] bg-[#251d0c] text-[#e7bf58]",
  green: "border-up/25 bg-up/10 text-up",
  purple: "border-brand/30 bg-brand/10 text-brand2",
  neutral: "border-line bg-panel2/50 text-muted",
};

function BadgeChip({ badge }: { badge: ProfileType["badges"][number] }) {
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-[2px] text-[8px] leading-[13px]",
        BADGE_TONES[badge.tone],
      )}
    >
      {badge.label}
    </span>
  );
}

function StatsRow({ stats }: { stats: ProfileStats }) {
  const items = [
    {
      label: "参与轮次",
      value: stats.rounds,
      sub: stats.openRounds > 0 ? `${stats.openRounds} 轮进行中` : `${stats.bets} 笔下注`,
      tone: "text-white",
    },
    {
      label: "总下注",
      value: fmtUsd(stats.volumeUsd),
      sub: `${stats.rounds} 个市场轮次`,
      tone: "text-white",
    },
    {
      label: "胜率",
      value: `${stats.winRate.toFixed(1)}%`,
      sub:
        `${stats.wonRounds} 胜 / ${stats.lostRounds} 负` +
        (stats.drawRounds > 0 ? ` / ${stats.drawRounds} 平` : ""),
      tone: stats.winRate >= 50 ? "text-up" : "text-white",
    },
    {
      label: "累计盈亏",
      value: fmtSignedUsd(stats.pnlUsd),
      sub: "已结算部分",
      tone: stats.pnlUsd >= 0 ? "text-up" : "text-down",
    },
  ];

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-line bg-panel2/20 px-3 py-2.5"
        >
          <div className="text-[8.5px] text-muted2">{item.label}</div>
          <div className={cn("num mt-1 truncate text-[17px] font-semibold", item.tone)}>
            {item.value}
          </div>
          <div className="mt-0.5 truncate text-[8.5px] text-muted2">{item.sub}</div>
        </div>
      ))}
    </div>
  );
}

const RANGES: Array<{ id: Range; label: string }> = [
  { id: "24h", label: "24小时" },
  { id: "7d", label: "7天" },
  { id: "30d", label: "30天" },
];

type WalletSnapshot = Awaited<ReturnType<typeof getWallet>>;

function fmtBalance(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/**
 * 账户余额：链上下注代币按 mock 价格折成 USD，附带充值 / 提现入口。
 * 充值走 /api/faucet（演示环境领测试币），提现暂时只给提示。
 */
function BalanceCard({
  address,
  wallet,
  tokens,
  loading,
  onRefresh,
}: {
  address: string | null;
  wallet: WalletSnapshot | null;
  tokens: BetToken[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const { user } = useAuth();
  const { reloadBalances } = useBetToken();
  const { push } = useToast();
  const [pending, setPending] = useState(false);

  const isSelf = Boolean(
    address && user?.address && address.toLowerCase() === user.address.toLowerCase(),
  );

  const rows = tokens.map((token) => ({
    token,
    balance: wallet?.tokens.find((item) => item.symbol === token.symbol)?.balance ?? 0,
  }));
  const totalUsd = rows.reduce((sum, row) => sum + row.balance * row.token.priceUsd, 0);

  const recharge = async () => {
    if (!address || !isSelf || pending) return;
    setPending(true);
    try {
      await faucet({ address, betToken: "TEST", amount: "100" });
      onRefresh();
      reloadBalances();
      push("已充值 100 TEST", "success");
    } catch (caught) {
      push(caught instanceof Error ? caught.message : "充值失败，请重试", "error");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="rounded-lg border border-line bg-panel2/20 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[8.5px] text-muted2">账户余额</div>
          {loading ? (
            <div className="skeleton mt-1.5 h-7 w-36 rounded" />
          ) : address ? (
            <div className="num mt-0.5 text-[24px] font-semibold leading-none tracking-tight text-white">
              {wallet ? fmtUsd(totalUsd) : "—"}
            </div>
          ) : (
            <div className="num mt-0.5 text-[24px] font-semibold leading-none tracking-tight text-muted2">
              —
            </div>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {address && wallet
              ? rows.map((row) => (
                  <span
                    key={row.token.symbol}
                    className="inline-flex items-center gap-1 rounded border border-line bg-panel2/50 px-1.5 py-[3px] text-[8.5px] text-muted"
                    title={`${row.token.name} 余额`}
                  >
                    <TokenIcon icon={row.token.icon} size={13} />
                    <span className="num text-white">{fmtBalance(row.balance)}</span>
                    <span className="text-muted2">{row.token.symbol}</span>
                  </span>
                ))
              : null}
            {!address && (
              <span className="text-[9px] text-muted2">该用户没有托管账户</span>
            )}
            {address && !loading && !wallet && (
              <span className="text-[9px] text-muted2">余额读取失败</span>
            )}
            {address && !isSelf && (
              <span className="text-[9px] text-muted2">仅本人账户可充值 / 提现</span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (!isSelf) return;
              push("演示环境：提现暂未开放");
            }}
            disabled={!isSelf || pending}
            className="h-7 rounded-md border border-line px-3 text-[10.5px] font-medium text-muted transition hover:border-line2 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            提现
          </button>
          <button
            type="button"
            onClick={() => void recharge()}
            disabled={!isSelf || pending}
            className="flex h-7 items-center gap-1 rounded-md bg-brand px-3 text-[10.5px] font-semibold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-40"
            title="演示环境：充值 100 TEST"
          >
            {pending && <Loader2 className="h-3 w-3 animate-spin" />}
            {pending ? "充值中…" : "充值"}
          </button>
        </div>
      </div>
    </section>
  );
}

function EquityCard({
  stats,
  equity,
  range,
  onRangeChange,
  loading,
}: {
  stats: ProfileStats;
  equity: EquityPoint[];
  range: Range;
  onRangeChange: (range: Range) => void;
  loading: boolean;
}) {
  const change = useMemo(() => {
    if (equity.length < 2) return 0;
    return equity[equity.length - 1].v - equity[0].v;
  }, [equity]);

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-panel2/20">
      <div className="flex items-start justify-between gap-3 px-3 pt-3">
        <div className="min-w-0">
          <div className="text-[8.5px] text-muted2">累计盈亏（已实现）</div>
          <div
            className={cn(
              "num mt-0.5 text-[25px] font-semibold leading-none tracking-tight",
              stats.pnlUsd >= 0 ? "text-up" : "text-down",
            )}
          >
            {fmtSignedUsd(stats.pnlUsd)}
          </div>
          <div className="num mt-1.5 flex items-center gap-1.5 text-[9.5px]">
            <span className={change >= 0 ? "text-up/80" : "text-down/80"}>
              {fmtSignedUsd(change)}
            </span>
            <span className="text-muted2">
              · {RANGES.find((item) => item.id === range)?.label}区间
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-line p-0.5">
          {RANGES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onRangeChange(item.id)}
              className={cn(
                "rounded px-1.5 py-1 text-[8.5px] transition",
                range === item.id
                  ? "bg-panel2/60 text-white"
                  : "text-muted2 hover:text-white",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-1 h-[168px] px-2">
        {loading && equity.length === 0 ? (
          <div className="skeleton h-full w-full rounded-md" />
        ) : equity.length < 2 ? (
          <div className="flex h-full items-center justify-center text-[9.5px] text-muted2">
            这个区间还没有已结算的轮次
          </div>
        ) : (
          <AreaChart data={equity} range={range} />
        )}
      </div>

      <div className="mx-3 mb-3 flex items-center justify-between border-t border-line pt-2.5 text-[9px]">
        <span className="text-muted2">
          已结算 <span className="num text-white">{stats.settledRounds}</span> 轮
        </span>
        <span className="text-muted2">
          胜率 <span className="num text-white">{stats.winRate.toFixed(1)}%</span>
        </span>
        <span className="text-muted2">
          未结算 <span className="num text-white">{stats.openRounds}</span> 轮
        </span>
      </div>
    </section>
  );
}

const STATUS_TEXT: Record<ProfileRound["status"], string> = {
  open: "未结算",
  settled: "已结算",
  claimed: "已领奖",
  refunded: "已退款",
};

const STATUS_TONE: Record<ProfileRound["status"], string> = {
  open: "bg-brand/10 text-brand2",
  settled: "bg-panel2/60 text-muted",
  claimed: "bg-up/10 text-up",
  refunded: "bg-panel2/60 text-muted2",
};

function RoundRow({ round }: { round: ProfileRound }) {
  const draw = round.pnl !== null && round.pnl.startsWith("0 ");
  const pnlTone =
    round.pnl === null || draw
      ? "text-muted2"
      : round.pnl.startsWith("-")
        ? "text-down"
        : "text-up";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_58px_minmax(0,1fr)_minmax(0,0.9fr)_54px] items-center border-b border-line/50 px-3 py-2 last:border-0">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-panel2/50 text-[8px] font-bold text-muted">
          {round.symbol.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[10px] font-medium text-white">
            {round.symbol}
            <span className="text-muted2">/{round.betToken}</span>
          </div>
          <div className="text-[8px] text-muted2">第 {round.roundId} 轮</div>
        </div>
      </div>

      <div className="num text-right text-[9px] text-muted">{round.amount}</div>

      <div className="min-w-0 text-right">
        <div className="num truncate text-[9px] text-white">
          {round.side === "long" ? "看涨" : round.side === "short" ? "看跌" : "双边"}
        </div>
        {round.longAmount && round.shortAmount && (
          <div className="num mt-0.5 truncate text-[7.5px] text-muted2">
            {round.longAmount} / {round.shortAmount}
          </div>
        )}
      </div>

      <div className="min-w-0 text-right">
        <div
          className={cn(
            "num truncate text-[9.5px]",
            round.winner === null ? "text-muted2" : "text-white",
          )}
        >
          {round.winner === "long" ? "涨赢" : round.winner === "short" ? "跌赢" : "—"}
        </div>
        <div className="mt-0.5 truncate text-[7.5px] text-muted2">
          {round.status === "open" ? "待开奖" : `收 ${round.payout}`}
        </div>
      </div>

      <div className="min-w-0 text-right">
        <div className={cn("num truncate text-[9.5px]", pnlTone)}>
          {round.pnl ?? "—"}
        </div>
        <span
          className={cn(
            "mt-0.5 inline-block rounded px-1 text-[7px] leading-[12px]",
            STATUS_TONE[round.status],
          )}
        >
          {STATUS_TEXT[round.status]}
        </span>
      </div>
    </div>
  );
}

function PositionsCard({
  rounds,
  loading,
}: {
  rounds: ProfileRound[];
  loading: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-panel2/20">
      <div className="flex h-9 items-center gap-2 border-b border-line px-3">
        <span className="text-[11px] font-medium text-white">
          当前持仓 <span className="num text-muted2">{rounds.length}</span>
        </span>
        <span className="ml-auto text-[8px] text-muted2">下注中 / 待开奖</span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_58px_minmax(0,1fr)_minmax(0,0.9fr)_54px] border-b border-line px-3 py-1.5 text-[8px] text-muted2">
        <span>市场</span>
        <span className="text-right">下注</span>
        <span className="text-right">方向</span>
        <span className="text-right">时间</span>
        <span className="text-right">状态</span>
      </div>

      <div className="min-h-[88px]">
        {loading && (
          <div className="space-y-1 px-3 py-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="skeleton h-7 w-full rounded" />
            ))}
          </div>
        )}

        {!loading && rounds.length === 0 && (
          <div className="flex h-[88px] flex-col items-center justify-center gap-1 text-[9.5px] text-muted2">
            <p>当前没有进行中的仓位</p>
            <p className="text-[8px] text-muted2">下注后，本轮和待开奖的轮次会显示在这里</p>
          </div>
        )}

        {!loading && rounds.length > 0 && (
          <>
            {rounds.map((round) => (
              <div
                key={round.id}
                className="grid grid-cols-[minmax(0,1fr)_58px_minmax(0,1fr)_minmax(0,0.9fr)_54px] items-center border-b border-line/50 px-3 py-2 last:border-0"
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-panel2/50 text-[8px] font-bold text-muted">
                    {round.symbol.slice(0, 1)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[10px] font-medium text-white">
                      {round.symbol}
                      <span className="text-muted2">/{round.betToken}</span>
                    </div>
                    <div className="text-[8px] text-muted2">第 {round.roundId} 轮</div>
                  </div>
                </div>
                <div className="num text-right text-[9px] text-muted">{round.amount}</div>
                <div className="text-right text-[9px] text-white">
                  {round.side === "long" ? "看涨" : round.side === "short" ? "看跌" : "双边"}
                </div>
                <div className="text-right text-[8px] text-muted2">
                  {ago(round.createdAt)}
                </div>
                <div className="text-right">
                  <span className="rounded bg-brand/10 px-1 text-[7px] leading-[13px] text-brand2">
                    待开奖
                  </span>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function RoundsCard({
  rounds,
  loading,
}: {
  rounds: ProfileRound[];
  loading: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-panel2/20">
      <div className="flex h-9 items-center gap-2 border-b border-line px-3">
        <span className="text-[11px] font-medium text-white">
          参与轮次 <span className="num text-muted2">{rounds.length}</span>
        </span>
        <span className="ml-auto text-[8px] text-muted2">按结算时间倒序</span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_58px_minmax(0,1fr)_minmax(0,0.9fr)_54px] border-b border-line px-3 py-1.5 text-[8px] text-muted2">
        <span>市场 / 轮次</span>
        <span className="text-right">下注</span>
        <span className="text-right">方向</span>
        <span className="text-right">结果 / 收到</span>
        <span className="text-right">盈亏</span>
      </div>

      <div className="max-h-[360px] min-h-[120px] overflow-y-auto">
        {loading && (
          <div className="space-y-1 px-3 py-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="skeleton h-7 w-full rounded" />
            ))}
          </div>
        )}

        {!loading && rounds.length === 0 && (
          <div className="flex h-[160px] flex-col items-center justify-center gap-1 text-[9.5px] text-muted2">
            <MessageSquare className="h-4 w-4" />
            <p>还没有下注记录</p>
          </div>
        )}

        {!loading && rounds.map((round) => <RoundRow key={round.id} round={round} />)}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-line px-3 py-2 text-[8px] text-muted2">
        <span>共 {rounds.length} 个市场轮次</span>
        <span>数据来自本地库 · 结算后自动更新</span>
      </div>
    </section>
  );
}

function EventIcon({ event }: { event: ProfileEvent }) {
  if (event.kind === "bet") {
    return event.side === "short" ? (
      <ArrowDownRight className="h-3 w-3 text-down" />
    ) : (
      <ArrowUpRight className="h-3 w-3 text-up" />
    );
  }
  if (event.kind === "settle") return <Trophy className="h-3 w-3 text-[#e7bf58]" />;
  if (event.kind === "claim") return <CircleDollarSign className="h-3 w-3 text-up" />;
  return <MessageSquare className="h-3 w-3 text-brand2" />;
}

function EventText({ event }: { event: ProfileEvent }) {
  const market = event.symbol && event.betToken ? `${event.symbol}/${event.betToken}` : "";
  const round = event.roundId === null ? "" : `第 ${event.roundId} 轮`;

  if (event.kind === "bet") {
    return (
      <span className="min-w-0">
        <span className={event.side === "short" ? "text-down" : "text-up"}>
          {event.side === "short" ? "看跌" : "看涨"}
        </span>{" "}
        <span className="text-white">{event.amount}</span>{" "}
        <span className="text-muted2">
          {market} · {round}
        </span>
      </span>
    );
  }

  if (event.kind === "settle") {
    const result =
      event.side === null ? "退款" : event.side === "short" ? "跌赢" : "涨赢";
    return (
      <span className="text-muted">
        {market} · {round} 开奖 <span className="text-white">{result}</span>
      </span>
    );
  }

  if (event.kind === "claim") {
    return (
      <span className="text-muted">
        {market} · {round} 自动领奖{" "}
        <span className="num text-up">{event.amount}</span>
      </span>
    );
  }

  return (
    <span className="line-clamp-2 min-w-0 text-muted">
      <span className="text-brand2">观点</span> · {event.body}
    </span>
  );
}

function ActivityCard({
  events,
  loading,
}: {
  events: ProfileEvent[];
  loading: boolean;
}) {
  return (
    <section className="flex min-h-[520px] flex-col overflow-hidden rounded-lg border border-line bg-panel2/20">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="text-[11px] font-medium text-white">活动</span>
        <span className="num text-[8px] text-muted2">{events.length}</span>
        <span className="ml-auto text-[8px] text-muted2">下注 / 开奖 / 领奖 / 观点</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && (
          <div className="space-y-1 px-3 py-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="skeleton h-6 w-full rounded" />
            ))}
          </div>
        )}

        {!loading && events.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-[9px] text-muted2">
            <MessageSquare className="h-4 w-4" />
            <p>暂无活动</p>
          </div>
        )}

        {!loading &&
          events.map((event) => (
            <div
              key={event.id}
              className="flex items-start gap-2 border-b border-line/50 px-3 py-2 transition last:border-0 hover:bg-panel2/40"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-panel2/50">
                <EventIcon event={event} />
              </span>
              <div className="min-w-0 flex-1 break-words text-[9.5px] leading-relaxed">
                <EventText event={event} />
              </div>
              <span className="num shrink-0 text-[8px] text-muted2">{event.time}</span>
            </div>
          ))}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-line px-3 py-2 text-[8px] text-muted2">
        <span>共 {events.length} 条记录</span>
        <span>最近 100 条</span>
      </div>
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <div className="h-full overflow-hidden px-3 pb-3 pt-4">
      <div className="skeleton -mx-3 h-[72px]" />
      <div className="mt-2 flex items-center gap-3">
        <div className="skeleton -mt-7 h-14 w-14 rounded-full" />
        <div className="space-y-1.5">
          <div className="skeleton h-4 w-32 rounded" />
          <div className="skeleton h-2.5 w-48 rounded" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="skeleton h-[64px] rounded-lg" />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 min-[1400px]:grid-cols-[minmax(0,1.13fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="skeleton h-[92px] rounded-lg" />
          <div className="skeleton h-[300px] rounded-lg" />
          <div className="skeleton h-[180px] rounded-lg" />
          <div className="skeleton h-[300px] rounded-lg" />
        </div>
        <div className="skeleton h-[520px] rounded-lg" />
      </div>
    </div>
  );
}
