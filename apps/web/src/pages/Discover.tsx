import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Info, Star, ExternalLink } from "lucide-react";
import {
  getBetPool,
  getFeed,
  getHolders,
  getMarketActivity,
  getOpinions,
  postOpinion,
  getRoundPrice,
  getToken,
  LIVE_TIMEFRAME_LABEL,
} from "@/api";
import type { LiveTimeframe } from "@/api";
import type {
  FeedItem,
  Holder,
  MarketActivity,
  MarketOpinion,
  Token,
} from "@/api/types";
import { Avatar } from "@/components/Avatar";
import { BetTokenSelector } from "@/components/BetTokenSelector";
import { CandleChart } from "@/components/charts/CandleChart";
import { ChartSplitHandle } from "@/components/ChartSplitHandle";
import { HorizontalResizeHandle } from "@/components/HorizontalResizeHandle";
import { PoolPanel } from "@/components/PoolPanel";
import { TokenIcon } from "@/components/TokenIcon";
import { useAuth } from "@/context/AuthContext";
import { useBetToken } from "@/context/BetTokenContext";
import { useWatchlist } from "@/context/WatchlistContext";
import { cn } from "@/lib/cn";
import { fmtBlock, fmtSignedUsd, fmtUsd } from "@/lib/format";
import { getTimelineRounds, ROUND_INTERVAL_BLOCKS } from "@/lib/rounds";
import { useApi } from "@/lib/useApi";
import { txExplorerUrl } from "@/lib/explorer";
import { useLiveCandles } from "@/lib/useLiveCandles";
import { useChainClock } from "@/lib/chainClock";
import { useEnvironment } from "@/lib/environment";

const MIN_BOTTOM_HEIGHT = 180;
const MAX_BOTTOM_HEIGHT = 657;
const DEFAULT_BOTTOM_HEIGHT = 438;
const CHART_MIN_HEIGHT = 280;
const DEFAULT_CHART_RATIO = 0.5;
const MIN_CHART_RATIO = 0.45;
const MAX_CHART_RATIO = 0.78;
/**
 * Bottom row defaults. Currently an even three-way split so the layout can be
 * eyeballed: 观点 / 活动 / 参与者 each take a third of the row.
 */
const DEFAULT_BOTTOM_SPLIT_RATIO = 0.55;
const MIN_BOTTOM_SPLIT_RATIO = 0.4;
const MAX_BOTTOM_SPLIT_RATIO = 0.8;
const DEFAULT_OPINION_SPLIT_RATIO = 0.44;
const MIN_OPINION_SPLIT_RATIO = 0.25;
const MAX_OPINION_SPLIT_RATIO = 0.75;

const LIVE_TIMEFRAMES: Array<{ id: LiveTimeframe; label: string }> = [
  { id: "15s", label: "15秒" },
  { id: "30s", label: "30秒" },
  { id: "1m", label: "1分" },
];

/** 观点 / 活动 / 参与者里的头像和昵称：有托管地址就跳到个人主页。 */
function ProfileLink({
  address,
  className,
  children,
}: {
  address?: string | null;
  className?: string;
  children: ReactNode;
}) {
  if (!address) return <div className={className}>{children}</div>;
  return (
    <Link
      to={`/u/${address}`}
      title="查看个人主页"
      className={cn(
        "rounded transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/60",
        className,
      )}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </Link>
  );
}

export default function Discover() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const symbol = (params.get("symbol") ?? "BTC").toUpperCase();

  const clock = useChainClock();
  const environment = useEnvironment();
  const block = clock.block;
  const rounds = getTimelineRounds(block);
  const active =
    rounds.find((round) => round.status === "betting") ??
    rounds.find((round) => round.startBlock <= block && block < round.settleBlock) ??
    rounds[0]!;
  const [selectedStartBlock, setSelectedStartBlock] = useState<number | null>(
    null,
  );
  const selected =
    rounds.find((round) => round.startBlock === selectedStartBlock) ?? active;
  const { user } = useAuth();
  const { selected: betToken } = useBetToken();
  // 当前选中轮次的锁定价格（后端已落库），每分钟重取一次以等到新轮写入
  const roundPriceState = useApi(
    () => getRoundPrice(symbol, selected.startBlock),
    [symbol, selected.startBlock, Math.floor(block / 60)],
  );

  const selectedPoolState = useApi(
    () =>
      betToken
        ? getBetPool(symbol, betToken.symbol, selected.startBlock)
        : Promise.resolve(null),
    [symbol, betToken, selected.startBlock, clock.version],
  );

  const tokenState = useApi(() => getToken(symbol), [symbol]);
  const [timeframe, setTimeframe] = useState<LiveTimeframe>("1m");
  const candlesState = useLiveCandles(symbol, timeframe);
  const holdersState = useApi(
    () => getHolders(symbol, betToken?.symbol ?? "TEST"),
    [symbol, betToken?.symbol],
  );
  const opinionsState = useApi(
    () => getOpinions(symbol, betToken?.symbol ?? "TEST", 50, user?.address ?? null),
    [symbol, betToken?.symbol, user?.address],
  );
  const activityState = useApi(
    () => getMarketActivity(symbol, betToken?.symbol ?? "TEST", selected.startBlock),
    [symbol, betToken?.symbol, selected.startBlock],
  );
  const reloadActivity = activityState.reload;
  const reloadHolders = holdersState.reload;
  const reloadOpinions = opinionsState.reload;

  /** 下注成功后立刻刷新活动/参与者；结算、自动代领在后台发生，再每 5s 拉一次。 */
  useEffect(() => {
    const refresh = () => {
      reloadActivity();
      reloadHolders();
      reloadOpinions();
    };
    window.addEventListener("tiktap:activity-refresh", refresh);
    const timer = window.setInterval(refresh, 5_000);
    return () => {
      window.removeEventListener("tiktap:activity-refresh", refresh);
      window.clearInterval(timer);
    };
  }, [reloadActivity, reloadHolders, reloadOpinions]);
  const layoutRef = useRef<HTMLDivElement>(null);
  const [bottomHeight, setBottomHeight] = useState(DEFAULT_BOTTOM_HEIGHT);
  const [maxBottomHeight, setMaxBottomHeight] = useState(MAX_BOTTOM_HEIGHT);
  const [chartRatio, setChartRatio] = useState(DEFAULT_CHART_RATIO);
  const chartSplitStyle = {
    "--chart-split": `${(chartRatio * 100).toFixed(2)}%`,
  } as CSSProperties;
  const [bottomSplitRatio, setBottomSplitRatio] = useState(
    DEFAULT_BOTTOM_SPLIT_RATIO,
  );
  const bottomSplitStyle = {
    "--bottom-split": `${(bottomSplitRatio * 100).toFixed(2)}%`,
  } as CSSProperties;
  const [opinionSplitRatio, setOpinionSplitRatio] = useState(
    DEFAULT_OPINION_SPLIT_RATIO,
  );
  const opinionSplitStyle = {
    "--opinion-split": `${(opinionSplitRatio * 100).toFixed(2)}%`,
  } as CSSProperties;

  useEffect(() => {
    setSelectedStartBlock(null);
  }, [symbol, environment]);

  useEffect(() => {
    const element = layoutRef.current;
    if (!element) return;

    const syncHeightBounds = () => {
      const nextMax = Math.min(
        MAX_BOTTOM_HEIGHT,
        Math.max(MIN_BOTTOM_HEIGHT, element.clientHeight - CHART_MIN_HEIGHT),
      );
      setMaxBottomHeight(nextMax);
      setBottomHeight((current) =>
        Math.min(Math.max(current, MIN_BOTTOM_HEIGHT), nextMax),
      );
    };

    syncHeightBounds();
    const observer = new ResizeObserver(syncHeightBounds);
    observer.observe(element);
    return () => observer.disconnect();
  }, [tokenState.data]);

  if (tokenState.error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-[13px] text-white">未找到交易对 {symbol}</p>
        <p className="text-[10px] text-muted2">当前交易对不存在，请检查拼写或返回上一页。</p>
        <button
          type="button"
          onClick={() => navigate("/discover?symbol=BTC")}
          className="mt-2 rounded-md bg-brand px-3 py-1.5 text-[10.5px] text-white transition hover:bg-brand/90"
        >
          回到 BTC
        </button>
      </div>
    );
  }

  if (!tokenState.data) {
    return <DiscoverSkeleton />;
  }

  return (
    <div ref={layoutRef} className="flex h-full min-h-0 flex-col">
      <section
        className="flex min-h-[280px] flex-1"
        style={chartSplitStyle}
      >
        <div className="flex w-full min-h-0 min-w-0 flex-col lg:w-[var(--chart-split)] lg:shrink-0">
          <TokenHeader token={tokenState.data} />

          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-2">
            <div className="flex items-center gap-0.5 rounded bg-panel p-0.5">
              {LIVE_TIMEFRAMES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTimeframe(item.id)}
                  aria-pressed={timeframe === item.id}
                  className={cn(
                    "rounded px-2.5 py-1 text-[12px] font-medium transition",
                    timeframe === item.id
                      ? "bg-panel2 text-white"
                      : "text-muted2 hover:text-white",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <span className="hidden shrink-0 text-[10px] text-muted2 sm:block">
              OKX · 实时
            </span>
          </div>

          <div className="relative min-h-0 flex-1 px-0.5 pb-0.5">
            {candlesState.loading ? (
              <div className="flex h-full items-center justify-center gap-2 text-[12px] text-muted2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
                正在加载 OKX {LIVE_TIMEFRAME_LABEL[timeframe]} K 线…
              </div>
            ) : candlesState.error ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-[13px] text-white">
                  {LIVE_TIMEFRAME_LABEL[timeframe]} K 线加载失败
                </p>
                <p className="max-w-[320px] text-[11px] text-muted2">{candlesState.error}</p>
                <button
                  type="button"
                  onClick={candlesState.reload}
                  className="mt-1 rounded-md bg-brand px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-brand/90"
                >
                  重试
                </button>
              </div>
            ) : (
              <CandleChart
                candles={candlesState.data ?? []}
                symbol={symbol}
                timeframe={timeframe}
                lockPrice={roundPriceState.data?.lockPrice ?? null}
                settlePrice={roundPriceState.data?.settlePrice ?? null}
              />
            )}
          </div>
        </div>

        <ChartSplitHandle
          ratio={chartRatio}
          minRatio={MIN_CHART_RATIO}
          maxRatio={MAX_CHART_RATIO}
          onRatioChange={setChartRatio}
        />

        <div className="hidden min-h-0 flex-1 flex-col lg:flex">
          <div className="relative flex h-16 shrink-0 items-center justify-center border-b border-line p-2.5">
            <span className="absolute left-3 top-2 text-[12px] font-medium text-muted2">
              下注代币
            </span>
            <div className="mx-auto w-full max-w-[260px]">
              <BetTokenSelector />
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <PoolPanel
              symbol={symbol}
              block={block}
              selectedStartBlock={selected.startBlock}
              onSelect={(round) => setSelectedStartBlock(round.startBlock)}
            />
          </div>
        </div>
      </section>

      <HorizontalResizeHandle
        height={bottomHeight}
        minHeight={MIN_BOTTOM_HEIGHT}
        maxHeight={maxBottomHeight}
        onResize={setBottomHeight}
      />

      <section
        className="flex shrink-0 overflow-hidden"
        style={{ height: bottomHeight, ...bottomSplitStyle }}
      >
        <div
          className="flex w-full min-h-0 min-w-0 lg:w-[var(--bottom-split)] lg:shrink-0"
          style={opinionSplitStyle}
        >
          <div className="flex w-full min-h-0 min-w-0 flex-col lg:w-[var(--opinion-split)] lg:shrink-0">
            <OpinionsPanel
              items={opinionsState.data ?? []}
              roundNumber={selected.number}
              market={symbol}
              betToken={betToken?.symbol ?? "TEST"}
              address={user?.address ?? null}
              onPosted={reloadOpinions}
            />
          </div>

          <ChartSplitHandle
            ratio={opinionSplitRatio}
            minRatio={MIN_OPINION_SPLIT_RATIO}
            maxRatio={MAX_OPINION_SPLIT_RATIO}
            onRatioChange={setOpinionSplitRatio}
            label="观点区域宽度"
          />

          <div className="hidden min-h-0 min-w-0 flex-1 lg:block">
            <ActivityPanel
              items={activityState.data ?? []}
              roundNumber={selected.number}
            />
          </div>
        </div>

        <ChartSplitHandle
          ratio={bottomSplitRatio}
          minRatio={MIN_BOTTOM_SPLIT_RATIO}
          maxRatio={MAX_BOTTOM_SPLIT_RATIO}
          onRatioChange={setBottomSplitRatio}
          label="下方区域宽度"
        />

        <div className="hidden min-h-0 min-w-0 flex-1 lg:block">
          <HoldersTable
            holders={holdersState.data ?? []}
            loading={holdersState.loading && holdersState.data === null}
            roundNumber={selected.number}
            settled={selected.status === "settled"}
            winner={selectedPoolState.data?.winner ?? undefined}
          />
        </div>
      </section>
    </div>
  );
}

function TokenHeader({ token }: { token: Token }) {
  const { isWatched, toggle } = useWatchlist();
  const watched = isWatched(token.symbol);
  return (
    <header className="relative flex h-16 shrink-0 items-center justify-center border-b border-line px-3">
      <span className="absolute left-3 top-2 text-[12px] font-medium text-muted2">
        标的物
      </span>
      <div className="flex min-w-0 items-center gap-2.5">
        <TokenIcon icon={token.icon} size={32} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="text-[20px] font-semibold leading-none tracking-tight text-white">
              {token.symbol}
            </h1>
            <button
              type="button"
              onClick={() => toggle(token.symbol)}
              aria-pressed={watched}
              aria-label={watched ? "取消自选" : "收藏市场"}
              title={watched ? "取消自选" : "收藏市场"}
              className="rounded p-0.5 transition hover:text-white"
            >
              <Star
                className={cn(
                  "h-4 w-4 transition",
                  watched ? "fill-brand text-brand" : "text-muted2",
                )}
              />
            </button>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted2">
            <span>{token.name}</span>
            <span className="h-2.5 w-px bg-line2" />
            <span className="text-[#8f9dff]">OKX</span>
            <button
              type="button"
              aria-label="数据来源于OKX交易所现货价格"
              className="group relative inline-flex rounded p-0.5 text-muted2 transition hover:text-white"
            >
              <Info className="h-3 w-3" />
              <span
                role="tooltip"
                className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 w-max max-w-[220px] -translate-y-1/2 rounded-md border border-line bg-panel2 px-2 py-1 text-[10px] leading-relaxed text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                数据来源于OKX交易所现货价格
              </span>
            </button>
          </div>
        </div>
      </div>

    </header>
  );
}

/** 统一筛选按钮样式，活动、观点、参与者共用。 */
function FilterToggle({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded border px-2 py-1 text-[12px] font-medium transition",
        active
          ? "border-brand/40 bg-brand/10 text-brand2"
          : "border-transparent text-muted2 hover:border-line hover:text-white",
      )}
    >
      {label}
    </button>
  );
}

/** Shared header filter so all three bottom panels read the same. */
function FollowedFilter({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto pl-1">
      <FilterToggle label="仅看已关注" active={active} onToggle={onToggle} />
    </div>
  );
}

function HoldersTable({
  holders,
  loading,
  roundNumber,
  settled,
  winner,
}: {
  holders: Holder[];
  loading: boolean;
  roundNumber: number;
  settled: boolean;
  winner?: "long" | "short";
}) {
  const [onlyFollowed, setOnlyFollowed] = useState(false);
  const [onlyRound, setOnlyRound] = useState(false);

  const visible = useMemo(() => {
    let list = onlyRound
      ? holders.filter((holder) => holder.roundId === roundNumber)
      : holders;
    if (onlyFollowed) list = list.filter((holder) => holder.followed);
    return list;
  }, [holders, onlyFollowed, onlyRound, roundNumber]);

  // 全部轮次里可能混着已结算轮，按行里有没有「收到」来决定是否展示结算列。
  const showSettled = settled || visible.some((holder) => holder.received !== undefined);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 px-3">
        <span
          className="shrink-0 text-[14px] font-medium text-white"
          title={`第 ${roundNumber} 轮参与者`}
        >
          参与者{" "}
          <span className="num text-[12px] text-muted2">({visible.length})</span>
        </span>
        <div className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto">
          <FilterToggle
            label="仅看本轮"
            active={onlyRound}
            onToggle={() => setOnlyRound((value) => !value)}
          />
          <FollowedFilter
            active={onlyFollowed}
            onToggle={() => setOnlyFollowed((value) => !value)}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div
          className={cn(
            "sticky top-0 z-10 grid min-w-[490px] items-center border-y border-line bg-panel px-2 py-1.5 text-center text-[11px] font-medium text-muted2",
            showSettled
              ? "grid-cols-[84px_104px_minmax(0,1fr)_minmax(0,1fr)_40px_minmax(0,0.95fr)_minmax(0,0.85fr)]"
              : "grid-cols-[84px_104px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,0.85fr)]",
          )}
        >
          <span className="text-left">起始区块</span>
          <span className="text-left">交易者</span>
          <span className="flex flex-col leading-tight">
            <span>买涨</span>
            <span className="text-[9px] font-normal text-muted2/80">次数/数量</span>
          </span>
          <span className="flex flex-col leading-tight">
            <span>买跌</span>
            <span className="text-[9px] font-normal text-muted2/80">次数/数量</span>
          </span>
          {showSettled && <span>获胜</span>}
          <span>{showSettled ? "收到" : "将收到"}</span>
          <span>盈利</span>
        </div>

        {loading && <HolderSkeleton />}

        {!loading && visible.length === 0 && (
          <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1 text-[13px] text-muted2">
            <p>
              {onlyFollowed
                ? "没有已关注的人参与"
                : onlyRound
                  ? "本轮还没有参与者"
                  : "还没有参与者"}
            </p>
            {(onlyFollowed || onlyRound) && (
              <button
                type="button"
                onClick={() => {
                  setOnlyFollowed(false);
                  setOnlyRound(false);
                }}
                className="text-[12px] font-medium text-brand2 hover:underline"
              >
                清除筛选
              </button>
            )}
          </div>
        )}

        {visible.map((holder) => {
          return (
            <div
              key={holder.id}
              className={cn(
                "grid min-w-[490px] items-center border-b border-line/50 px-2 py-2.5 transition hover:bg-white/[0.07]",
                showSettled
                  ? "grid-cols-[84px_104px_minmax(0,1fr)_minmax(0,1fr)_40px_minmax(0,0.95fr)_minmax(0,0.85fr)]"
                  : "grid-cols-[84px_104px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,0.85fr)]",
              )}
            >
              <div className="num truncate text-[10px] text-muted2" title="起始区块">
                {holder.roundId !== undefined
                  ? fmtBlock(holder.roundId * ROUND_INTERVAL_BLOCKS)
                  : "—"}
              </div>
              <ProfileLink
                address={holder.address}
                className="flex min-w-0 items-center gap-2"
              >
                <Avatar name={holder.name} gradient={holder.avatar} size={26} />
                <div className="truncate text-[13px] font-medium text-white">
                  {holder.name}
                </div>
              </ProfileLink>

              <div className="num truncate text-center text-[11px] text-white">
                {holder.longCount > 0
                  ? `${holder.longCount} / ${holder.longAmount}`
                  : "0 / —"}
              </div>

              <div className="num truncate text-center text-[11px] text-white">
                {holder.shortCount > 0
                  ? `${holder.shortCount} / ${holder.shortAmount}`
                  : "0 / —"}
              </div>

              {showSettled && (
                <div
                  className={cn(
                    "text-center text-[11px] font-semibold",
                    holder.won ? "text-up" : "text-down",
                  )}
                >
                  {holder.won ? "是" : "否"}
                </div>
              )}

              <div className="num truncate text-center text-[11px] text-white">
                {holder.received ?? "—"}
              </div>

              <div
                className={cn(
                  "num truncate text-center text-[11px]",
                  holder.pnl?.startsWith("-") ? "text-down" : "text-up",
                )}
              >
                {holder.pnl ?? "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OpinionsPanel({
  items,
  roundNumber,
  market,
  betToken,
  address,
  onPosted,
}: {
  items: MarketOpinion[];
  roundNumber: number;
  market: string;
  betToken: string;
  address: string | null;
  onPosted: () => void;
}) {
  const [onlyRound, setOnlyRound] = useState(false);
  const [onlyFollowed, setOnlyFollowed] = useState(false);
  const [body, setBody] = useState("");
  const [side, setSide] = useState<"long" | "short" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => {
    let list = onlyRound
      ? items.filter((item) => item.roundId === roundNumber)
      : items;
    if (onlyFollowed) list = list.filter((item) => item.followed);
    return list;
  }, [onlyFollowed, onlyRound, items, roundNumber]);

  const canPost = Boolean(address) && body.trim().length > 0 && !pending;

  const submit = async () => {
    if (!address || !canPost) return;
    setPending(true);
    setError(null);
    try {
      await postOpinion({
        address,
        market,
        betToken,
        body: body.trim(),
        side,
      });
      setBody("");
      setSide(null);
      onPosted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "发布失败，请重试");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <span
          className="relative shrink-0 pb-2.5 pt-2.5 text-[14px] font-medium text-white"
          title={`市场观点 · 当前第 ${roundNumber} 轮`}
        >
          观点{" "}
          <span className="num text-[12px] text-muted2">({visible.length})</span>
          <span className="absolute inset-x-0 bottom-0 h-[1.5px] rounded-full bg-brand" />
        </span>

        <div className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto">
          <FilterToggle
            label="仅看本轮"
            active={onlyRound}
            onToggle={() => setOnlyRound((value) => !value)}
          />
          <FilterToggle
            label="仅看已关注"
            active={onlyFollowed}
            onToggle={() => setOnlyFollowed((value) => !value)}
          />
        </div>
      </div>

      <div className="shrink-0 border-b border-line px-3 py-2.5">
        {address ? (
          <>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder="说说你对这个市场的看法…"
              maxLength={280}
              rows={2}
              disabled={pending}
              className="w-full resize-none rounded-md border border-line2 bg-[#0a0a0c] px-2.5 py-2 text-[12.5px] leading-relaxed text-white outline-none transition placeholder:text-muted2 focus:border-brand/60 disabled:opacity-60"
            />
            <div className="mt-2 flex items-center gap-2">
              {(["long", "short"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSide((current) => (current === value ? null : value))}
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-[11px] font-medium transition",
                    side === value
                      ? value === "long"
                        ? "border-up/60 bg-up/15 text-up"
                        : "border-down/60 bg-down/15 text-down"
                      : "border-line bg-panel text-muted2 hover:text-white",
                  )}
                >
                  {value === "long" ? "看涨" : "看跌"}
                </button>
              ))}
              <span className="num ml-auto text-[10px] text-muted2">
                {body.length}/280
              </span>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!canPost}
                className="rounded-md bg-white px-3 py-1 text-[11.5px] font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? "发布中…" : "发布"}
              </button>
            </div>
            {error && <p className="mt-1.5 text-[11px] text-down">{error}</p>}
          </>
        ) : (
          <p className="text-[11px] text-muted2">登录后可以发布观点</p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 && (
          <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1 text-[13px] text-muted2">
            <p>
              {onlyFollowed
                ? "没有已关注的人发观点"
                : onlyRound
                  ? "本轮还没有观点"
                  : "这个市场还没有观点"}
            </p>
            {onlyFollowed ? (
              <button
                type="button"
                onClick={() => setOnlyFollowed(false)}
                className="text-[12px] font-medium text-brand2 hover:underline"
              >
                清除筛选
              </button>
            ) : onlyRound ? (
              <button
                type="button"
                onClick={() => setOnlyRound(false)}
                className="text-[12px] font-medium text-brand2 hover:underline"
              >
                看全部观点
              </button>
            ) : null}
          </div>
        )}

        {visible.map((item) => (
          <div
            key={item.id}
            className="border-b border-line/50 px-3 py-2.5 transition hover:bg-white/[0.07]"
          >
            <div className="flex items-center gap-2">
              <ProfileLink
                address={item.address}
                className="flex min-w-0 items-center gap-2"
              >
                <Avatar name={item.name} gradient={item.avatar} size={24} />
                <span className="truncate text-[13px] font-medium text-white">
                  {item.name}
                </span>
              </ProfileLink>
              {item.side && (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium",
                    item.side === "long"
                      ? "bg-up/15 text-up"
                      : "bg-down/15 text-down",
                  )}
                >
                  {item.side === "long" ? "看涨" : "看跌"}
                </span>
              )}
              {item.roundId !== null && (
                <span
                  className="num shrink-0 text-[10px] text-muted2"
                  title="起始区块"
                >
                  {fmtBlock(item.roundId * ROUND_INTERVAL_BLOCKS)}
                </span>
              )}
              <span className="num ml-auto shrink-0 text-[10px] text-muted2">
                {item.time}
                {item.time === "刚刚" ? "" : "前"}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words pl-[32px] text-[12.5px] leading-relaxed text-muted">
              {item.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityPanel({
  items,
  roundNumber,
}: {
  items: MarketActivity[];
  roundNumber: number;
}) {
  const [onlyRound, setOnlyRound] = useState(false);
  const [onlyFollowed, setOnlyFollowed] = useState(false);
  const grid =
    "grid grid-cols-[84px_124px_minmax(0,0.45fr)_minmax(0,0.55fr)_26px_minmax(0,0.6fr)] items-center gap-1";
  const visible = useMemo(() => {
    let list = onlyRound
      ? items.filter((item) => item.roundIndex === roundNumber)
      : items;
    if (onlyFollowed) list = list.filter((item) => item.followed);
    return list;
  }, [items, onlyFollowed, onlyRound, roundNumber]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <span
          className="relative shrink-0 pb-2.5 pt-2.5 text-[14px] font-medium text-white"
          title={`第 ${roundNumber} 轮活动`}
        >
          活动{" "}
          <span className="num text-[12px] text-muted2">({visible.length})</span>
          <span className="absolute inset-x-0 bottom-0 h-[1.5px] rounded-full bg-brand" />
        </span>
        <div className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto">
          <FilterToggle
            label="仅看本轮"
            active={onlyRound}
            onToggle={() => setOnlyRound((value) => !value)}
          />
          <FollowedFilter
            active={onlyFollowed}
            onToggle={() => setOnlyFollowed((value) => !value)}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div
          className={cn(
            grid,
            "sticky top-0 z-10 min-w-[440px] border-b border-line/60 bg-panel px-2 py-1.5 text-[12px] text-muted2",
          )}
        >
          <div className="truncate">起始区块</div>
          <div className="truncate">交易者</div>
          <div className="truncate">活动</div>
          <div className="truncate">数量</div>
          <div className="truncate text-center">交易</div>
          <div className="truncate text-right">时间</div>
        </div>

        {visible.length === 0 && (
          <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1 text-[13px] text-muted2">
            <p>
              {onlyFollowed
                ? "没有已关注的人参与"
                : onlyRound
                  ? "本轮还没有活动"
                  : "还没有活动"}
            </p>
            {(onlyFollowed || onlyRound) && (
              <button
                type="button"
                onClick={() => {
                  setOnlyFollowed(false);
                  setOnlyRound(false);
                }}
                className="text-[12px] font-medium text-brand2 hover:underline"
              >
                清除筛选
              </button>
            )}
          </div>
        )}

        {visible.map((item) => {
          const label =
            item.kind === "bet"
              ? item.side === "long"
                ? "Tap涨"
                : "Tap跌"
              : item.kind === "settle"
                ? item.side === "long"
                  ? "开奖 · 涨"
                  : item.side === "short"
                    ? "开奖 · 跌"
                    : "开奖 · 平"
                : "自动领取";
          const txUrl = txExplorerUrl(item.txHash);

          return (
            <div
              key={item.id}
              className={cn(
                grid,
                "min-w-[440px] border-b border-line/50 px-2 py-2 transition hover:bg-white/[0.07]",
              )}
              title={`tx ${item.txHash}`}
            >
              <div className="num truncate text-[10px] text-muted2" title="起始区块">
                {fmtBlock(item.roundIndex * ROUND_INTERVAL_BLOCKS)}
              </div>
              <ProfileLink
                address={item.address}
                className="flex min-w-0 items-center gap-2"
              >
                <Avatar name={item.name} gradient={item.avatar} size={26} />
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium text-white">
                    {item.name}
                  </div>
                  <div className="num truncate text-[10px] leading-tight text-muted2">
                    {item.address
                      ? `${item.address.slice(0, 6)}…${item.address.slice(-4)}`
                      : "匿名交易者"}
                  </div>
                </div>
              </ProfileLink>
              <div
                className={cn(
                  "truncate text-[12px] font-medium",
                  item.kind === "claim"
                    ? "text-brand2"
                    : item.side === "long"
                      ? "text-up"
                      : item.side === "short"
                        ? "text-down"
                        : "text-muted2",
                )}
              >
                {label}
              </div>
              <div className="num truncate text-left text-[14px] text-white">
                {item.amount || "—"}
              </div>
              <div className="flex items-center justify-center">
                {txUrl ? (
                  <a
                    href={txUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    title={`在区块浏览器查看交易 ${item.txHash}`}
                    aria-label="在区块浏览器查看交易"
                    className="rounded p-1 text-muted2 transition hover:text-white"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <span
                    className="p-1 text-muted2/40"
                    title={`当前环境没有区块浏览器 · tx ${item.txHash}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
              <div className="num truncate text-right text-[12px] text-muted2">
                {item.time}
                {item.time === "刚刚" ? "" : "前"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HolderSkeleton() {
  return (
    <div className="space-y-1 px-3 py-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex items-center gap-2 py-1.5">
          <div className="skeleton h-5 w-5 rounded-full" />
          <div className="skeleton h-2.5 w-24 rounded" />
          <div className="skeleton ml-auto h-2.5 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}

function DiscoverSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-3 py-3">
        <div className="skeleton h-8 w-8 rounded-full" />
        <div className="space-y-1.5">
          <div className="skeleton h-3.5 w-20 rounded" />
          <div className="skeleton h-2 w-40 rounded" />
        </div>
        <div className="ml-auto flex gap-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="skeleton h-6 w-16 rounded" />
          ))}
        </div>
      </div>
      <div className="flex-1 p-3">
        <div className="skeleton h-full w-full rounded-lg" />
      </div>
      <div className="h-[292px] shrink-0 border-t border-line p-3">
        <div className="skeleton h-5 w-32 rounded" />
      </div>
    </div>
  );
}
