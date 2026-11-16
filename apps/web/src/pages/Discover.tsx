import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Info } from "lucide-react";
import {
  getBetPool,
  getFeed,
  getHolders,
  getMarketActivity,
  getToken,
} from "@/api";
import type { FeedItem, Holder, MarketActivity, Token } from "@/api/types";
import { Avatar } from "@/components/Avatar";
import { BetTokenSelector } from "@/components/BetTokenSelector";
import { CandleChart } from "@/components/charts/CandleChart";
import { ChartSplitHandle } from "@/components/ChartSplitHandle";
import { HorizontalResizeHandle } from "@/components/HorizontalResizeHandle";
import { PoolPanel } from "@/components/PoolPanel";
import { TokenIcon } from "@/components/TokenIcon";
import { useBetToken } from "@/context/BetTokenContext";
import { cn } from "@/lib/cn";
import { fmtSignedUsd, fmtUsd } from "@/lib/format";
import { getTimelineRounds } from "@/lib/rounds";
import { useApi } from "@/lib/useApi";
import { useLiveCandles } from "@/lib/useLiveCandles";
import { useChainClock } from "@/lib/chainClock";

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
const DEFAULT_BOTTOM_SPLIT_RATIO = 0.6;
const MIN_BOTTOM_SPLIT_RATIO = 0.4;
const MAX_BOTTOM_SPLIT_RATIO = 0.8;
const DEFAULT_OPINION_SPLIT_RATIO = 0.62;
const MIN_OPINION_SPLIT_RATIO = 0.25;
const MAX_OPINION_SPLIT_RATIO = 0.75;

export default function Discover() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const symbol = (params.get("symbol") ?? "BTC").toUpperCase();

  const clock = useChainClock();
  const block = clock.block;
  const rounds = getTimelineRounds(block, clock.anchor);
  const active =
    rounds.find((round) => round.status === "betting") ??
    rounds.find((round) => round.startBlock <= block && block < round.settleBlock) ??
    rounds[0]!;
  const [selectedStartBlock, setSelectedStartBlock] = useState<number | null>(
    null,
  );
  const selected =
    rounds.find((round) => round.startBlock === selectedStartBlock) ?? active;
  const { selected: betToken } = useBetToken();
  const selectedPoolState = useApi(
    () =>
      betToken
        ? getBetPool(symbol, betToken.symbol, selected.startBlock)
        : Promise.resolve(null),
    [symbol, betToken, selected.startBlock, clock.version],
  );

  const tokenState = useApi(() => getToken(symbol), [symbol]);
  const candlesState = useLiveCandles(symbol);
  const holdersState = useApi(
    () => getHolders(symbol, selected.startBlock),
    [symbol, selected.startBlock],
  );
  const feedState = useApi(
    () => getFeed(symbol, selected.startBlock),
    [symbol, selected.startBlock],
  );
  const activityState = useApi(
    () => getMarketActivity(symbol, selected.startBlock),
    [symbol, selected.startBlock],
  );
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
  }, [symbol]);

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
        <p className="text-[10px] text-muted2">它可能已下线，或者链接拼写有误。</p>
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
            <span className="shrink-0 rounded bg-panel2 px-2.5 py-1.5 text-[12px] font-medium text-white">
              1分
            </span>
            <span className="hidden shrink-0 text-[10px] text-muted2 sm:block">
              OKX · 仅 1m
            </span>
          </div>

          <div className="relative min-h-0 flex-1 px-0.5 pb-0.5">
            {candlesState.loading ? (
              <div className="flex h-full items-center justify-center gap-2 text-[12px] text-muted2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
                正在加载 OKX 1m K 线…
              </div>
            ) : candlesState.error ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-[13px] text-white">1 分钟行情加载失败</p>
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
              <CandleChart candles={candlesState.data ?? []} symbol={symbol} />
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
            <FeedPanel
              items={feedState.data ?? []}
              roundNumber={selected.number}
              live={selected.status === "betting"}
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

        <div className="hidden min-h-0 flex-1 lg:block">
          <HoldersTable
            holders={holdersState.data ?? []}
            loading={holdersState.loading}
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
        仅看已关注
      </button>
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

  const visible = useMemo(
    () => (onlyFollowed ? holders.filter((holder) => holder.followed) : holders),
    [onlyFollowed, holders],
  );

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
        <FollowedFilter
          active={onlyFollowed}
          onToggle={() => setOnlyFollowed((value) => !value)}
        />
      </div>

      <div
        className={cn(
          "grid shrink-0 items-center border-y border-line px-3 py-2 text-center text-[12px] font-medium text-muted2",
          settled
            ? "grid-cols-[128px_minmax(0,1fr)_minmax(0,1fr)_48px_minmax(0,0.9fr)_minmax(0,0.85fr)]"
            : "grid-cols-[128px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,0.85fr)]",
        )}
      >
        <span className="text-left">交易者</span>
        <span className="whitespace-nowrap">买涨(次数/数量)</span>
        <span className="whitespace-nowrap">买跌(次数/数量)</span>
        {settled && <span>获胜</span>}
        <span className="whitespace-nowrap">
          {settled ? "收到" : "获胜将收到"}
        </span>
        <span>盈利</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && <HolderSkeleton />}

        {!loading && visible.length === 0 && (
          <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1 text-[13px] text-muted2">
            <p>没有符合条件的参与者</p>
            <button
              type="button"
              onClick={() => setOnlyFollowed(false)}
              className="text-[12px] font-medium text-brand2 hover:underline"
            >
              清除筛选
            </button>
          </div>
        )}

        {visible.map((holder) => {
          const won = settled && winner === holder.side;
          return (
            <div
              key={holder.id}
              className={cn(
                "grid items-center border-b border-line/50 px-3 py-2.5 transition hover:bg-white/[0.07]",
                settled
                  ? "grid-cols-[128px_minmax(0,1fr)_minmax(0,1fr)_48px_minmax(0,0.9fr)_minmax(0,0.85fr)]"
                  : "grid-cols-[128px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,0.85fr)]",
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <Avatar name={holder.name} gradient={holder.avatar} size={28} />
                <div className="truncate text-[14px] font-medium text-white">
                  {holder.name}
                </div>
              </div>

              <div className="num text-center text-[14px] text-white">
                {holder.side === "long" ? `1 / ${holder.size}` : "0 / —"}
              </div>

              <div className="num text-center text-[14px] text-white">
                {holder.side === "short" ? `1 / ${holder.size}` : "0 / —"}
              </div>

              {settled && (
                <div
                  className={cn(
                    "text-center font-semibold",
                    won ? "text-up" : "text-down",
                  )}
                >
                  {won ? "是" : "否"}
                </div>
              )}

              <div className="num text-center text-[14px] text-white">
                {settled ? (won ? holder.size : "0") : "—"}
              </div>

              <div
                className={cn(
                  "num text-center text-[14px]",
                  holder.pnl >= 0 ? "text-up" : "text-down",
                )}
              >
                {fmtSignedUsd(holder.pnl)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FeedPanel({
  items,
  roundNumber,
  live,
}: {
  items: FeedItem[];
  roundNumber: number;
  live: boolean;
}) {
  const [onlyFollowed, setOnlyFollowed] = useState(false);
  const visible = useMemo(
    () => (onlyFollowed ? items.filter((item) => item.followed) : items),
    [onlyFollowed, items],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <span
          className="relative shrink-0 pb-2.5 pt-2.5 text-[14px] font-medium text-white"
          title={`第 ${roundNumber} 轮观点`}
        >
          观点{" "}
          <span className="num text-[12px] text-muted2">({visible.length})</span>
          <span className="absolute inset-x-0 bottom-0 h-[1.5px] rounded-full bg-brand" />
        </span>
        <FollowedFilter
          active={onlyFollowed}
          onToggle={() => setOnlyFollowed((value) => !value)}
        />
        <span className="ml-auto shrink-0 text-[12px] text-muted2">
          {live ? "实时" : "历史"}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 && (
          <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1 text-[13px] text-muted2">
            <p>没有符合条件的观点</p>
            <button
              type="button"
              onClick={() => setOnlyFollowed(false)}
              className="text-[12px] font-medium text-brand2 hover:underline"
            >
              清除筛选
            </button>
          </div>
        )}

        {visible.map((item) => (
          <div
            key={item.id}
            className="grid grid-cols-[128px_minmax(0,1fr)] items-center gap-3 border-b border-line/50 px-3 py-2.5 transition hover:bg-white/[0.07]"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Avatar name={item.name} gradient={item.avatar} size={28} />
              <div className="truncate text-[14px] font-medium text-white">
                {item.name}
              </div>
            </div>
            <p className="min-w-0 break-words text-[13px] leading-relaxed text-muted">
              {item.content ?? "—"}
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
  const [onlyFollowed, setOnlyFollowed] = useState(false);
  const visible = useMemo(
    () => (onlyFollowed ? items.filter((item) => item.followed) : items),
    [onlyFollowed, items],
  );

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
        <FollowedFilter
          active={onlyFollowed}
          onToggle={() => setOnlyFollowed((value) => !value)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 && (
          <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1 text-[13px] text-muted2">
            <p>没有符合条件的活动</p>
            <button
              type="button"
              onClick={() => setOnlyFollowed(false)}
              className="text-[12px] font-medium text-brand2 hover:underline"
            >
              清除筛选
            </button>
          </div>
        )}

        {visible.map((item) => (
          <div
            key={item.id}
            className="grid grid-cols-[128px_minmax(0,0.5fr)_minmax(0,1fr)_minmax(0,0.7fr)] items-center gap-2 border-b border-line/50 px-3 py-2.5 transition hover:bg-white/[0.07]"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Avatar name={item.name} gradient={item.avatar} size={28} />
              <div className="truncate text-[14px] font-medium text-white">
                {item.name}
              </div>
            </div>
            <div
              className={cn(
                "truncate text-[14px] font-medium",
                item.side === "long" ? "text-up" : "text-down",
              )}
            >
              {item.side === "long" ? "Tap涨" : "Tap跌"}
            </div>
            <div
              className="num truncate text-left text-[14px] text-white"
              title={fmtUsd(item.amountUsd, 0)}
            >
              {fmtUsd(item.amountUsd, 0)}
            </div>
            <div className="num truncate text-right text-[14px] text-muted2">
              {item.time}前
            </div>
          </div>
        ))}
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
