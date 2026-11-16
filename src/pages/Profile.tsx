import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { BadgeCheck, Check, CircleDollarSign, MessageSquare } from "lucide-react";
import { getActivity, getEquityCurve, getPositions, getProfile } from "@/api";
import type {
  Activity,
  Badge,
  EquityPoint,
  Position,
  Profile as ProfileType,
  Range,
} from "@/api/types";
import { Avatar } from "@/components/Avatar";
import { AreaChart } from "@/components/charts/AreaChart";
import { TokenIcon } from "@/components/TokenIcon";
import { useToast } from "@/context/ToastContext";
import { cn } from "@/lib/cn";
import {
  fmtCompactUsd,
  fmtPct,
  fmtPrice,
  fmtSignedPct,
  fmtSignedUsd,
  fmtUsd,
} from "@/lib/format";
import { useApi } from "@/lib/useApi";

export default function Profile() {
  const { handle = "end837" } = useParams();
  const [range, setRange] = useState<Range>("24h");

  const profileState = useApi(() => getProfile(handle), [handle]);
  const positionsState = useApi(() => getPositions(handle), [handle]);
  const activityState = useApi(() => getActivity(handle), [handle]);
  const equityState = useApi(() => getEquityCurve(handle, range), [handle, range]);

  if (!profileState.data) return <ProfileSkeleton />;

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="px-3 py-3">
        <ProfileHeader profile={profileState.data} />

        <div className="mt-3 grid grid-cols-1 gap-3 min-[1400px]:grid-cols-[minmax(0,1.13fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-3">
            <RankCards />
            <EquityCard
              profile={profileState.data}
              equity={equityState.data ?? []}
              range={range}
              onRangeChange={setRange}
              loading={equityState.loading}
            />
            <PositionsCard
              positions={positionsState.data ?? []}
              loading={positionsState.loading}
            />
          </div>
          <ActivityCard
            activity={activityState.data ?? []}
            loading={activityState.loading}
          />
        </div>
      </div>
    </div>
  );
}

function ProfileHeader({ profile }: { profile: ProfileType }) {
  const [following, setFollowing] = useState(false);

  return (
    <section>
      <div className="relative -mx-3 -mt-3 h-[76px] overflow-hidden border-b border-white/[0.04] bg-[#0c0c11]">
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

      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-1">
        <div className="flex min-w-0 items-end gap-3">
          <div className="-mt-7 rounded-full bg-ink p-[3px] shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
            <Avatar name={profile.name} gradient={profile.avatar} size={58} />
          </div>
          <div className="min-w-0 pb-0.5">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-[21px] font-semibold leading-none tracking-tight text-white">
                {profile.name}
              </h1>
              <span className="truncate text-[10px] text-muted2">@{profile.handle}</span>
              <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-brand2" />
            </div>
            <p className="mt-1.5 text-[10.5px] text-muted">{profile.bio}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 pb-1">
          <MiniStat value={profile.mutual} label="共同关注" />
          <MiniStat value={profile.following} label="关注" />
          <MiniStat value={profile.followers} label="粉丝" />
          <button
            type="button"
            onClick={() => setFollowing((value) => !value)}
            className={cn(
              "h-7 rounded-md px-4 text-[10.5px] font-medium transition",
              following
                ? "border border-line2 bg-panel2 text-white hover:bg-panel3"
                : "bg-brand text-white hover:bg-brand/90",
            )}
          >
            {following ? "已关注" : "关注"}
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1">
        {profile.badges.map((badge) => (
          <BadgeChip key={badge.label} badge={badge} />
        ))}
      </div>
    </section>
  );
}

function MiniStat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="text-right">
      <div className="num text-[11.5px] font-medium text-white">{value}</div>
      <div className="mt-0.5 text-[8.5px] text-muted2">{label}</div>
    </div>
  );
}

const BADGE_TONES: Record<Badge["tone"], string> = {
  gold: "border-[#5d4a1c] bg-[#251d0c] text-[#e7bf58]",
  green: "border-up/25 bg-up/10 text-up",
  purple: "border-brand/30 bg-brand/10 text-brand2",
  neutral: "border-line bg-panel2 text-muted",
};

function BadgeChip({ badge }: { badge: Badge }) {
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

function RankCards() {
  const ranks = [
    { rank: 1, pnl: 148_764.76, pct: 59.82 },
    { rank: 2, pnl: 11.1, pct: 1_059.07 },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {ranks.map((item) => (
        <div
          key={item.rank}
          className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-2"
        >
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold",
              item.rank === 1
                ? "border-[#5d4a1c] bg-[#2a2110] text-[#e7bf58]"
                : "border-[#3b3f4a] bg-[#1a1c22] text-[#b8bdc9]",
            )}
          >
            {item.rank}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[8px] text-muted2">第 {item.rank} 名</div>
            <div className="num mt-0.5 truncate text-[11px] font-medium text-up">
              {fmtSignedUsd(item.pnl)}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[8px] text-muted2">收益率</div>
            <div className="num mt-0.5 whitespace-nowrap text-[8.5px] text-up">
              {fmtSignedPct(item.pct)}
            </div>
          </div>
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

function EquityCard({
  profile,
  equity,
  range,
  onRangeChange,
  loading,
}: {
  profile: ProfileType;
  equity: EquityPoint[];
  range: Range;
  onRangeChange: (range: Range) => void;
  loading: boolean;
}) {
  const { push } = useToast();
  const change = useMemo(() => {
    if (equity.length < 2) {
      return { value: profile.equityChange24h, pct: profile.equityChangePct };
    }
    const first = equity[0].v;
    const last = equity[equity.length - 1].v;
    return { value: last - first, pct: first ? ((last - first) / first) * 100 : 0 };
  }, [equity, profile]);

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-panel">
      <div className="flex items-start justify-between gap-3 px-3 pt-3">
        <div className="min-w-0">
          <div className="text-[8.5px] text-muted2">组合价值</div>
          <div className="num mt-0.5 text-[25px] font-semibold leading-none tracking-tight text-white">
            {fmtUsd(profile.equity)}
          </div>
          <div className="num mt-1.5 flex items-center gap-1.5 text-[9.5px]">
            <span className={change.value >= 0 ? "text-up" : "text-down"}>
              {fmtSignedUsd(change.value)}
            </span>
            <span className={change.value >= 0 ? "text-up/80" : "text-down/80"}>
              {fmtSignedPct(change.pct)}
            </span>
            <span className="text-muted2">· {RANGES.find((item) => item.id === range)?.label}</span>
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
                  ? "bg-panel3 text-white"
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
        ) : (
          <AreaChart data={equity} range={range} />
        )}
      </div>

      <div className="mx-3 mb-3 flex items-center justify-between border-t border-line pt-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-panel2">
            <CircleDollarSign className="h-3.5 w-3.5 text-up" />
          </span>
          <div>
            <div className="text-[8.5px] text-muted2">现金余额</div>
            <div className="num text-[11.5px] font-medium text-white">{fmtUsd(profile.cash)}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => push("演示环境：充值入口暂未开放")}
          className="rounded border border-line px-2 py-1 text-[9px] text-muted transition hover:border-line2 hover:text-white"
        >
          充值
        </button>
      </div>
    </section>
  );
}

type PositionTab = "all" | "spot" | "perp";

function PositionsCard({
  positions,
  loading,
}: {
  positions: Position[];
  loading: boolean;
}) {
  const [tab, setTab] = useState<PositionTab>("all");
  const [showSmall, setShowSmall] = useState(true);
  const [status, setStatus] = useState<"open" | "closed">("open");

  const rows = useMemo(() => {
    if (status === "closed") return [];
    let next = positions;
    if (tab === "spot") next = next.filter((position) => position.kind === "spot");
    if (tab === "perp") next = next.filter((position) => position.kind === "perp");
    if (!showSmall) next = next.filter((position) => position.sizeUsd >= 1000);
    return next;
  }, [positions, tab, showSmall, status]);

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-panel">
      <div className="flex h-9 items-center gap-3 border-b border-line px-3">
        <span className="text-[11px] font-medium text-white">
          持仓 <span className="num text-muted2">{positions.length}</span>
        </span>
        <button
          type="button"
          onClick={() => setShowSmall((value) => !value)}
          className="ml-auto flex items-center gap-1 text-[8.5px] text-muted2 transition hover:text-white"
        >
          <span
            className={cn(
              "flex h-2.5 w-2.5 items-center justify-center rounded-[2px] border transition",
              showSmall ? "border-brand bg-brand" : "border-line2 bg-transparent",
            )}
          >
            {showSmall && <Check className="h-2 w-2 text-white" />}
          </span>
          显示小额持仓
        </button>
      </div>

      <div className="flex items-center gap-2 px-3 pt-2">
        {(
          [
            ["all", "全部"],
            ["spot", "代币"],
            ["perp", "永续合约"],
          ] as Array<[PositionTab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "pb-1.5 text-[9.5px] transition",
              tab === id
                ? "border-b border-brand text-white"
                : "border-b border-transparent text-muted2 hover:text-muted",
            )}
          >
            {label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setStatus("open")}
            className={cn(
              "rounded px-1.5 py-0.5 text-[8px] transition",
              status === "open" ? "bg-panel3 text-white" : "text-muted2 hover:text-white",
            )}
          >
            持仓中
          </button>
          <button
            type="button"
            onClick={() => setStatus("closed")}
            className={cn(
              "rounded px-1.5 py-0.5 text-[8px] transition",
              status === "closed" ? "bg-panel3 text-white" : "text-muted2 hover:text-white",
            )}
          >
            已平仓
          </button>
        </div>
      </div>

      <div className="mt-1 grid grid-cols-[minmax(0,1.2fr)_72px_minmax(0,1fr)_minmax(0,0.82fr)] border-y border-line px-3 py-1.5 text-[8px] text-muted2">
        <span>代币</span>
        <span className="text-right">平均买入</span>
        <span className="text-right">持仓</span>
        <span className="text-right">盈亏</span>
      </div>

      <div className="min-h-[120px]">
        {loading && (
          <div className="space-y-1 px-3 py-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="skeleton h-7 w-full rounded" />
            ))}
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div className="flex h-[180px] flex-col items-center justify-center gap-1 text-[9.5px] text-muted2">
            <p>{status === "closed" ? "暂无已平仓持仓" : "没有符合条件的持仓"}</p>
            {status === "closed" && (
              <button
                type="button"
                onClick={() => setStatus("open")}
                className="text-[9px] text-brand2 hover:underline"
              >
                查看持仓中
              </button>
            )}
          </div>
        )}

        {!loading &&
          rows.map((position) => (
            <div
              key={position.symbol}
              className="grid grid-cols-[minmax(0,1.2fr)_72px_minmax(0,1fr)_minmax(0,0.82fr)] items-center border-b border-line/50 px-3 py-2 transition last:border-0 hover:bg-panel2/40"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <TokenIcon icon={position.icon} size={20} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="truncate text-[10px] font-medium text-white">
                      {position.symbol}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded px-1 text-[7px] leading-[12px]",
                        position.side === "long"
                          ? "bg-up/10 text-up"
                          : "bg-down/10 text-down",
                      )}
                    >
                      {position.leverage}x {position.side === "long" ? "多" : "空"}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[8px] text-muted2">{position.name}</div>
                </div>
              </div>

              <div className="num text-right text-[9px] text-muted">
                ${fmtPrice(position.avgPrice)}
              </div>

              <div className="min-w-0 text-right">
                <div className="num truncate text-[9px] text-white">{position.size}</div>
                <div className="num mt-0.5 text-[8px] text-muted2">
                  {fmtUsd(position.sizeUsd)}
                </div>
              </div>

              <div className="min-w-0 text-right">
                <div
                  className={cn(
                    "num truncate text-[9.5px]",
                    position.pnl >= 0 ? "text-up" : "text-down",
                  )}
                >
                  {fmtSignedUsd(position.pnl)}
                </div>
                <div
                  className={cn(
                    "num mt-0.5 text-[8px]",
                    position.pnlPct >= 0 ? "text-up/80" : "text-down/80",
                  )}
                >
                  {fmtSignedPct(position.pnlPct)}
                </div>
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}

type ActivityTab = "all" | "spot" | "perp";

function ActivityCard({
  activity,
  loading,
}: {
  activity: Activity[];
  loading: boolean;
}) {
  const [tab, setTab] = useState<ActivityTab>("all");

  const rows = useMemo(() => {
    if (tab === "all") return activity;
    return activity.filter((item) => item.kind === tab);
  }, [activity, tab]);

  return (
    <section className="flex min-h-[520px] flex-col overflow-hidden rounded-lg border border-line bg-panel">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        {(
          [
            ["all", "全部"],
            ["spot", "代币"],
            ["perp", "永续合约"],
          ] as Array<[ActivityTab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "rounded px-1.5 py-1 text-[9.5px] transition",
              tab === id ? "bg-panel3 text-white" : "text-muted2 hover:text-white",
            )}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-[8px] text-muted2">最近 30 天</span>
      </div>

      <div className="grid shrink-0 grid-cols-[minmax(0,1.2fr)_76px_minmax(0,1fr)_minmax(0,0.82fr)_46px] border-b border-line px-3 py-1.5 text-[8px] text-muted2">
        <span>代币</span>
        <span>操作</span>
        <span className="text-right">金额</span>
        <span className="text-right">市值</span>
        <span className="text-right">时间</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && (
          <div className="space-y-1 px-3 py-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="skeleton h-6 w-full rounded" />
            ))}
          </div>
        )}

        {!loading &&
          rows.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[minmax(0,1.2fr)_76px_minmax(0,1fr)_minmax(0,0.82fr)_46px] items-center border-b border-line/50 px-3 py-2 transition hover:bg-panel2/40"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <TokenIcon icon={item.icon} size={18} />
                <div className="min-w-0">
                  <div className="truncate text-[9.5px] text-white">{item.symbol}</div>
                  <div className="mt-0.5 text-[7.5px] text-muted2">{item.name}</div>
                </div>
              </div>

              <div>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-1 py-[1px] text-[7.5px]",
                    item.side === "short"
                      ? "bg-down/10 text-down"
                      : item.side === "long"
                        ? "bg-up/10 text-up"
                        : "bg-panel3 text-muted",
                  )}
                >
                  {item.action}
                  {item.side && (
                    <span className="opacity-70">{item.side === "long" ? "多" : "空"}</span>
                  )}
                </span>
              </div>

              <div className="num text-right text-[9px] text-white">
                {fmtUsd(item.amountUsd)}
              </div>

              <div className="num text-right text-[8.5px] text-muted">
                {item.marketCap ? fmtCompactUsd(item.marketCap) : fmtUsd(item.price)}
              </div>

              <div className="text-right text-[8px] text-muted2">{item.time}</div>
            </div>
          ))}

        {!loading && rows.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-[9px] text-muted2">
            <MessageSquare className="h-4 w-4" />
            <p>暂无记录</p>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-line px-3 py-2 text-[8px] text-muted2">
        <span>共 {rows.length} 条记录</span>
        <span>数据每 15 秒刷新</span>
      </div>
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <div className="h-full overflow-hidden p-3">
      <div className="skeleton -mx-3 -mt-3 h-[72px]" />
      <div className="mt-2 flex items-center gap-3">
        <div className="skeleton -mt-7 h-14 w-14 rounded-full" />
        <div className="space-y-1.5">
          <div className="skeleton h-4 w-32 rounded" />
          <div className="skeleton h-2.5 w-48 rounded" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 min-[1400px]:grid-cols-[minmax(0,1.13fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="skeleton h-14 rounded-lg" />
            <div className="skeleton h-14 rounded-lg" />
          </div>
          <div className="skeleton h-[300px] rounded-lg" />
          <div className="skeleton h-[300px] rounded-lg" />
        </div>
        <div className="skeleton h-[520px] rounded-lg" />
      </div>
    </div>
  );
}
