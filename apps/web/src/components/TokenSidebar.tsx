import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Star } from "lucide-react";
import { getFollowingOpinions, getOpinions, getSidebarMenu, getTokens, getLeaderboard } from "@/api";
import type { SidebarCategoryItem, SidebarTabId, Token } from "@/api/types";
import { Avatar } from "@/components/Avatar";
import { TokenIcon } from "@/components/TokenIcon";
import { useAuth } from "@/context/AuthContext";
import { useWatchlist } from "@/context/WatchlistContext";
import { cn } from "@/lib/cn";
import { fmtPct, fmtSignedToken } from "@/lib/format";
import { useApi } from "@/lib/useApi";

/** 「全部 / 已关注」二级菜单（动态和排行榜共用同一套样式）。 */
function SubTabs({
  active,
  onChange,
}: {
  active: "all" | "following";
  onChange: (id: "all" | "following") => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-2">
      {(["all", "following"] as const).map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            "inline-flex h-6 shrink-0 items-center rounded px-2 text-[12px] font-bold transition",
            active === id
              ? "bg-panel3 text-white"
              : "text-muted2 hover:bg-panel2 hover:text-white",
          )}
        >
          {id === "all" ? "全部" : "已关注"}
        </button>
      ))}
    </div>
  );
}

export function TokenSidebar({ width }: { width: number }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { symbols, isWatched } = useWatchlist();
  const [tab, setTab] = useState<SidebarTabId>("market");
  const [category, setCategory] = useState<SidebarCategoryItem["id"]>("all");
  const [feedTab, setFeedTab] = useState<"all" | "following">("all");
  const [leaderboardTab, setLeaderboardTab] = useState<"all" | "following">("all");

  const selected = (searchParams.get("symbol") ?? "BTC").toUpperCase();
  const {
    data: menu,
    loading: menuLoading,
    error: menuError,
    reload: reloadMenu,
  } = useApi(getSidebarMenu, []);
  const { data: tokens, loading } = useApi(getTokens, []);
  const leaderboardState = useApi(
    () => {
      if (leaderboardTab === "following") {
        return user?.address
          ? getLeaderboard({ following: user.address, limit: 100 })
          : Promise.resolve([]);
      }
      return getLeaderboard({ limit: 100 });
    },
    [leaderboardTab, user?.address],
  );
  const reloadLeaderboard = leaderboardState.reload;
  const opinionsState = useApi(
    () => {
      if (feedTab === "following") {
        return user?.address
          ? getFollowingOpinions(user.address)
          : Promise.resolve([]);
      }
      return getOpinions(selected);
    },
    [selected, feedTab, user?.address],
  );
  const reloadOpinions = opinionsState.reload;

  // 新观点发布后（或每 5s）刷新左侧动态
  useEffect(() => {
    const refresh = () => {
      reloadOpinions();
      reloadLeaderboard();
    };
    window.addEventListener("tiktap:activity-refresh", refresh);
    const timer = window.setInterval(refresh, 5_000);
    return () => {
      window.removeEventListener("tiktap:activity-refresh", refresh);
      window.clearInterval(timer);
    };
  }, [reloadOpinions, reloadLeaderboard]);

  const tabs = menu?.tabs ?? [];
  const categories = menu?.categories ?? [];
  const activeTab = tabs.some((item) => item.id === tab) ? tab : (tabs[0]?.id ?? "market");

  const visibleTokens = useMemo(() => {
    if (!tokens) return [];
    let next: Token[] = tokens;
    if (activeTab === "watchlist") next = next.filter((token) => symbols.includes(token.symbol));
    if (category !== "all") next = next.filter((token) => token.category === category);
    return next;
  }, [tokens, activeTab, category, symbols]);

  const showTokens = activeTab === "watchlist" || activeTab === "market";

  return (
    <aside
      className="hidden shrink-0 flex-col bg-[#0b0b0e] lg:flex"
      style={{ width }}
    >
      <div className="flex h-9 items-end gap-3.5 px-3">
        {menuLoading &&
          [16, 20, 24, 16].map((width, index) => (
            <span
              key={index}
              className="skeleton mb-2 h-2 rounded"
              style={{ width }}
            />
          ))}
        {!menuLoading && menuError && tabs.length === 0 && (
          <button
            type="button"
            onClick={reloadMenu}
            className="pb-2 text-[10px] text-down transition hover:text-white"
          >
            菜单加载失败，重试
          </button>
        )}
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "relative pb-2 text-[14px] font-medium transition",
              activeTab === item.id ? "font-medium text-white" : "text-muted2 hover:text-muted",
            )}
          >
            {item.label}
            {activeTab === item.id && (
              <span className="absolute inset-x-0 bottom-0 h-[1.5px] rounded-full bg-brand" />
            )}
          </button>
        ))}
      </div>

      {showTokens && (menuLoading || categories.length > 0) && (
        <div className="no-scrollbar flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line px-2 py-2">
          {menuLoading &&
            [18, 30, 14, 30, 14, 10, 26].map((width, index) => (
              <span
                key={index}
                className="skeleton h-6 shrink-0 rounded"
                style={{ width }}
              />
            ))}
          {!menuLoading &&
            categories.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCategory(item.id)}
                className={cn(
                  "inline-flex h-6 shrink-0 items-center rounded px-2 text-[12px] font-bold transition",
                  category === item.id
                    ? "bg-panel3 text-white"
                    : "text-muted2 hover:bg-panel2 hover:text-white",
                )}
              >
                {item.label}
              </button>
            ))}
        </div>
      )}

      {activeTab === "activity" || activeTab === "leaderboard" ? (
        <SubTabs
          active={activeTab === "activity" ? feedTab : leaderboardTab}
          onChange={activeTab === "activity" ? setFeedTab : setLeaderboardTab}
        />
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {showTokens && (
          <>
            {loading && <TokenSkeletons />}

            {!loading && visibleTokens.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Star className="h-4 w-4 text-muted2" />
                <p className="text-[11px] text-muted">还没有自选的市场</p>
                <button
                  type="button"
                  onClick={() => {
                    setTab("market");
                    setCategory("all");
                  }}
                  className="rounded border border-line px-2 py-1 text-[9.5px] text-muted transition hover:border-line2 hover:text-white"
                >
                  浏览全部市场
                </button>
              </div>
            )}

            {!loading &&
              visibleTokens.map((token) => (
                <TokenRow
                  key={token.symbol}
                  token={token}
                  active={selected === token.symbol}
                  watched={isWatched(token.symbol)}
                  onClick={() => navigate(`/discover?symbol=${encodeURIComponent(token.symbol)}`)}
                />
              ))}
          </>
        )}

        {activeTab === "leaderboard" && (
          <div className="pt-1">
            <div className="flex items-center justify-between px-3 py-2 text-[12px] font-bold text-muted2">
              <span>交易者</span>
              <span>盈亏</span>
            </div>
            {(leaderboardState.data ?? []).length === 0 && (
              <p className="px-3 py-6 text-center text-[12px] text-muted2">
                {leaderboardTab === "following"
                  ? user
                    ? "关注一些人后，这里会显示他们的排名"
                    : "登录后查看已关注的人的排名"
                  : "还没有交易数据"}
              </p>
            )}
            {(leaderboardState.data ?? []).map((trader) => (
              <button
                key={trader.handle}
                type="button"
                onClick={() => navigate(`/u/${trader.handle}`)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-panel2/60"
              >
                <span className="w-4 text-[12px] text-muted2">{trader.rank}</span>
                <Avatar name={trader.name} gradient={trader.avatar} size={28} />
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-white">
                  {trader.name}
                </span>
                <span className="num flex shrink-0 flex-col items-end leading-tight">
                  <span
                    className={cn(
                      "text-[12px] font-bold",
                      trader.pnl >= 0 ? "text-up" : "text-down",
                    )}
                  >
                    {fmtSignedToken(trader.pnl, "TEST", 2)}
                  </span>
                  <span className="text-[10px] font-medium text-muted2">
                    {fmtPct(trader.pnlPct)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {activeTab === "activity" && (
          <div className="pt-1">
            {(opinionsState.data ?? []).length === 0 && (
              <p className="px-3 py-6 text-center text-[12px] text-muted2">
                {feedTab === "following"
                  ? user
                    ? "关注一些人后，这里会出现他们的动态"
                    : "登录后查看已关注的人的动态"
                  : "还没有观点"}
              </p>
            )}

            {(opinionsState.data ?? []).map((item) => (
              <div
                key={item.id}
                className="border-b border-line/50 px-3 py-2.5 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <Link
                    to={`/u/${item.address}`}
                    title="查看个人主页"
                    onClick={(event) => event.stopPropagation()}
                    className="flex min-w-0 items-center gap-2 rounded transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/60"
                  >
                    <Avatar name={item.name} gradient={item.avatar} size={24} />
                    <span className="truncate text-[13px] font-medium text-white">
                      {item.name}
                    </span>
                  </Link>
                  {item.side && (
                    <span
                      className={cn(
                        "shrink-0 rounded px-1 py-[1px] text-[10px] font-bold",
                        item.side === "short"
                          ? "bg-down/10 text-down"
                          : "bg-up/10 text-up",
                      )}
                    >
                      {item.side === "long" ? "看涨" : "看跌"}
                    </span>
                  )}
                  <span className="num ml-auto shrink-0 text-[10px] text-muted2">
                    {item.time}
                    {item.time === "刚刚" ? "" : "前"}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 break-words pl-[32px] text-[12px] leading-relaxed text-muted">
                  {item.body}
                </p>
                <div className="num mt-0.5 flex flex-wrap items-center gap-x-1.5 pl-[32px] text-[10px] text-muted2">
                  <span className="text-white/70">
                    {item.symbol}/{item.betToken}
                  </span>
                  <span>·</span>
                  <span>第 {item.roundId ?? "—"} 轮</span>
                  {item.betAmount && (
                    <>
                      <span>·</span>
                      <span className="text-muted">下注 {item.betAmount}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function TokenRow({
  token,
  active,
  watched,
  onClick,
}: {
  token: Token;
  active: boolean;
  watched: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-2 border-l-2 px-2.5 py-2 text-left transition",
        active
          ? "border-brand bg-[#17171f]"
          : "border-transparent hover:bg-white/[0.07]",
      )}
    >
      <TokenIcon icon={token.icon} size={24} />
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <span className="truncate text-[14px] font-medium text-white">{token.symbol}</span>
        {watched && <Star className="h-3 w-3 shrink-0 fill-brand text-brand" />}
      </div>
    </button>
  );
}

function TokenSkeletons() {
  return (
    <div className="space-y-0.5 px-2 py-1">
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index} className="flex items-center gap-2 px-1 py-2">
          <div className="skeleton h-[22px] w-[22px] rounded-full" />
          <div className="flex-1 space-y-1">
            <div className="skeleton h-2.5 w-14 rounded" />
            <div className="skeleton h-2 w-20 rounded" />
          </div>
          <div className="space-y-1">
            <div className="skeleton h-2.5 w-14 rounded" />
            <div className="skeleton h-2 w-9 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
