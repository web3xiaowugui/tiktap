import { useState } from "react";
import { claimBet, getBetPool, getMyBet } from "@/api";
import type { BetPool, BetToken } from "@/api/types";
import { RoundTimeline } from "@/components/RoundTimeline";
import { useAuth } from "@/context/AuthContext";
import { useBetToken } from "@/context/BetTokenContext";
import { useChainClock } from "@/lib/chainClock";
import { cn } from "@/lib/cn";
import { fmtQty } from "@/lib/format";
import { getTimelineRounds, type TimelineRound } from "@/lib/rounds";
import { useApi } from "@/lib/useApi";

export function PoolPanel({
  symbol,
  block,
  selectedStartBlock,
  onSelect,
}: {
  symbol: string;
  block: number;
  selectedStartBlock?: number;
  onSelect?: (round: TimelineRound) => void;
}) {
  const { selected, loading } = useBetToken();

  if (loading || !selected) return <PoolPanelSkeleton />;

  return (
    <PoolPanelBody
      key={`${symbol}:${selected.symbol}`}
      symbol={symbol}
      betToken={selected}
      block={block}
      selectedStartBlock={selectedStartBlock}
      onSelect={onSelect}
    />
  );
}

function PoolPanelBody({
  symbol,
  betToken,
  block,
  selectedStartBlock,
  onSelect,
}: {
  symbol: string;
  betToken: BetToken;
  block: number;
  selectedStartBlock?: number;
  onSelect?: (round: TimelineRound) => void;
}) {
  const clock = useChainClock();
  const rounds = getTimelineRounds(block, clock.anchor);
  const active =
    rounds.find((round) => round.status === "betting") ??
    rounds.find((round) => round.startBlock <= block && block < round.settleBlock) ??
    rounds[0]!;
  const selected =
    rounds.find((round) => round.startBlock === selectedStartBlock) ?? active;
  const poolState = useApi(
    () => getBetPool(symbol, betToken.symbol, selected.startBlock),
    [symbol, betToken.symbol, selected.startBlock, clock.version],
  );
  const pool = poolState.data;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto p-3">
      <RoundTimeline
        block={block}
        selectedStartBlock={selected.startBlock}
        onSelect={onSelect}
      />

      {poolState.loading ||
      (pool && pool.roundStartBlock !== selected.startBlock) ? (
        <PoolDetailsSkeleton />
      ) : poolState.error || !pool ? (
        <PoolError error={poolState.error} onRetry={poolState.reload} />
      ) : (
        <PoolDetails
          symbol={symbol}
          round={selected}
          pool={pool}
          betToken={betToken}
        />
      )}
    </div>
  );
}

function PoolDetails({
  symbol,
  round,
  pool,
  betToken,
}: {
  symbol: string;
  round: TimelineRound;
  pool: BetPool;
  betToken: BetToken;
}) {
  const total = pool.longAmount + pool.shortAmount;
  const longShare = total > 0 ? (pool.longAmount / total) * 100 : 0;
  const shortShare = total > 0 ? (pool.shortAmount / total) * 100 : 0;
  const hasBothSides = pool.longAmount > 0 && pool.shortAmount > 0;
  const longPayout = hasBothSides ? total / pool.longAmount : null;
  const shortPayout = hasBothSides ? total / pool.shortAmount : null;
  const participants = pool.longParticipants + pool.shortParticipants;

  return (
    <>
      <div
        className="mt-5 grid divide-x divide-line overflow-hidden rounded-t-lg border border-line bg-panel2/20"
        style={{
          gridTemplateColumns: `minmax(68px, ${longShare}fr) minmax(68px, ${shortShare}fr) minmax(96px, 24%)`,
        }}
      >
        <PoolStat
          tone="long"
          amount={pool.longAmount}
          unit={betToken.symbol}
          share={longShare}
          participants={pool.longParticipants}
          payout={longPayout}
          winner={round.status === "settled" ? pool.winner ?? undefined : undefined}
        />
        <PoolStat
          tone="short"
          amount={pool.shortAmount}
          unit={betToken.symbol}
          share={shortShare}
          participants={pool.shortParticipants}
          payout={shortPayout}
          winner={round.status === "settled" ? pool.winner ?? undefined : undefined}
        />
        <PoolStat
          tone="total"
          amount={total}
          unit={betToken.symbol}
          participants={participants}
        />
      </div>

      <MyBetPanel
        symbol={symbol}
        round={round}
        pool={pool}
        betToken={betToken}
      />
    </>
  );
}

function MyBetPanel({
  symbol,
  round,
  pool,
  betToken,
}: {
  symbol: string;
  round: TimelineRound;
  pool: BetPool;
  betToken: BetToken;
}) {
  const { user } = useAuth();
  const clock = useChainClock();
  const [claiming, setClaiming] = useState(false);
  const myBetState = useApi(
    () => getMyBet(symbol, betToken.symbol, round.startBlock, user?.address),
    [symbol, betToken.symbol, round.startBlock, user?.address, clock.version],
  );
  const myBet = myBetState.data;

  if (myBetState.loading) {
    return (
      <div className="mt-5 rounded-lg border border-line bg-panel2/30 p-3">
        <div className="skeleton h-3 w-16 rounded" />
        <div className="skeleton mt-2 h-5 w-28 rounded" />
        <div className="skeleton mt-2 h-8 w-full rounded" />
      </div>
    );
  }

  if (myBetState.error) {
    return (
      <div className="mt-5 rounded-lg border border-line bg-panel2/30 p-3">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted2">我的下注</span>
          <button
            type="button"
            onClick={myBetState.reload}
            className="text-brand2 transition hover:text-white"
          >
            重试
          </button>
        </div>
        <div className="mt-1 text-[11px] text-muted2">加载失败</div>
      </div>
    );
  }

  // 没下注时整块不渲染：没有数据就没有可展示的内容。
  if (!myBet) return null;

  const total = pool.longAmount + pool.shortAmount;
  const formatNumber = (value: number) =>
    fmtQty(value, value >= 100 ? 0 : 2);
  const formatAmount = (value: number) =>
    `${formatNumber(value)} ${betToken.symbol}`;
  const signedNumber = (value: number) =>
    `${value >= 0 ? "+" : "-"}${formatNumber(Math.abs(value))}`;
  const signedAmount = (value: number) =>
    `${value >= 0 ? "+" : "-"}${formatAmount(Math.abs(value))}`;
  const longExpected =
    myBet.longAmount > 0 && pool.longAmount > 0
      ? (myBet.longAmount / pool.longAmount) * total
      : 0;
  const shortExpected =
    myBet.shortAmount > 0 && pool.shortAmount > 0
      ? (myBet.shortAmount / pool.shortAmount) * total
      : 0;
  const settled = myBet.settled ?? round.status === "settled";
  const refunded = myBet.refund === true;
  const bothSides = myBet.longCount > 0 && myBet.shortCount > 0;
  const expectedPayout =
    pool.winner === "long" ? longExpected : pool.winner === "short" ? shortExpected : 0;
  const actualPayout = settled
    ? refunded
      ? myBet.amount
      : myBet.claimable && myBet.claimable > 0
        ? myBet.claimable
        : expectedPayout
    : 0;
  const pnl = actualPayout - myBet.amount;
  const longProfit = longExpected - myBet.amount;
  const shortProfit = shortExpected - myBet.amount;
  const won =
    settled &&
    !refunded &&
    (pool.winner === "long"
      ? myBet.longCount > 0
      : pool.winner === "short"
        ? myBet.shortCount > 0
        : false);

  return (
    <div className="mt-5 rounded-lg border border-line bg-panel2/30 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-semibold text-white">我的下注</span>
      </div>

      <div className="-mx-1 overflow-x-auto">
      <table className="mt-2 w-full min-w-[500px] table-fixed border-collapse text-[14px]">
        <colgroup>
          <col style={{ width: settled ? "22%" : "27%" }} />
          <col style={{ width: settled ? "22%" : "27%" }} />
          {settled && <col style={{ width: "16%" }} />}
          <col style={{ width: settled ? "20%" : "23%" }} />
          <col style={{ width: settled ? "20%" : "23%" }} />
        </colgroup>
        <thead>
          <tr className="border-b border-line text-[12px]">
            <th className="whitespace-nowrap pb-1 text-center font-semibold text-muted2">
              买涨(次数/数量)
            </th>
            <th className="whitespace-nowrap pb-1 text-center font-semibold text-muted2">
              买跌(次数/数量)
            </th>
            {settled && (
              <th className="whitespace-nowrap pb-1 text-center font-medium text-muted2">
                获胜
              </th>
            )}
            <th className="whitespace-nowrap pb-1 text-center font-medium text-muted2">
              {settled ? "收到" : "获胜将收到"}
            </th>
            <th className="whitespace-nowrap pb-1 text-center font-medium text-muted2">
              盈利
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="num whitespace-nowrap py-2 text-center text-white">
              {fmtQty(myBet.longCount, 0)} / {formatAmount(myBet.longAmount)}
            </td>
            <td className="num whitespace-nowrap py-2 text-center text-white">
              {fmtQty(myBet.shortCount, 0)} / {formatAmount(myBet.shortAmount)}
            </td>
            {settled && (
              <td
                className={cn(
                  "whitespace-nowrap py-2 text-center font-semibold",
                  won ? "text-up" : "text-down",
                )}
              >
                {won ? "是" : "否"}
              </td>
            )}
            <td className="num whitespace-nowrap py-2 text-center text-white">
              {settled ? (
                formatAmount(actualPayout)
              ) : bothSides ? (
                <span>
                  <span className="text-up">
                    涨{formatNumber(longExpected)}
                  </span>
                  <span className="text-muted2"> / </span>
                  <span className="text-down">
                    跌{formatNumber(shortExpected)}
                  </span>{" "}
                  {betToken.symbol}
                </span>
              ) : (
                formatAmount(
                  myBet.longCount > 0 ? longExpected : shortExpected,
                )
              )}
            </td>
            <td className="num whitespace-nowrap py-2 text-center">
              {settled ? (
                <span
                  className={cn(
                    "font-medium",
                    pnl >= 0 ? "text-up" : "text-down",
                  )}
                >
                  {signedAmount(pnl)}
                </span>
              ) : bothSides ? (
                <span>
                  <span className={longProfit >= 0 ? "text-up" : "text-down"}>
                    涨{signedNumber(longProfit)}
                  </span>
                  <span className="text-muted2"> / </span>
                  <span className={shortProfit >= 0 ? "text-up" : "text-down"}>
                    跌{signedNumber(shortProfit)}
                  </span>{" "}
                  {betToken.symbol}
                </span>
              ) : (
                <span
                  className={cn(
                    "font-medium",
                    (myBet.longCount > 0 ? longProfit : shortProfit) >= 0
                      ? "text-up"
                      : "text-down",
                  )}
                >
                  {signedAmount(
                    myBet.longCount > 0 ? longProfit : shortProfit,
                  )}
                </span>
              )}
            </td>
          </tr>
        </tbody>
      </table>
      </div>

      {settled && (myBet.claimable ?? 0) > 0 && !myBet.claimed && (
        <button
          type="button"
          disabled={claiming}
          onClick={async () => {
            if (!user?.address || !clock.anchor) return;
            const roundIndex = (round.startBlock - clock.anchor) / 600;
            setClaiming(true);
            try {
              await claimBet({
                address: user.address,
                market: symbol,
                betToken: betToken.symbol,
                roundIndex,
              });
              myBetState.reload();
              clock.refresh();
            } catch {
              myBetState.reload();
            } finally {
              setClaiming(false);
            }
          }}
          className="mt-3 h-9 w-full rounded-md bg-brand text-[14px] font-bold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {claiming ? "领取中…" : `领取 ${formatAmount(myBet.claimable ?? 0)}`}
        </button>
      )}

      {settled && myBet.claimed && (
        <p className="mt-2 text-center text-[11px] text-muted2">本轮奖励已领取</p>
      )}
    </div>
  );
}

function PoolStat({
  tone,
  amount,
  unit,
  participants,
  share,
  payout,
  winner,
}: {
  tone: "total" | "long" | "short";
  amount: number;
  unit: string;
  participants: number;
  share?: number;
  payout?: number | null;
  winner?: "long" | "short";
}) {
  const isSide = tone !== "total";
  const settled = winner !== undefined;
  const won = winner === tone;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col",
        tone === "long" && "bg-up/[0.12]",
        tone === "short" && "bg-down/[0.12]",
      )}
    >
      <div className="flex-1 p-2.5 text-center">
        <div
          className="flex min-w-0 items-baseline justify-center gap-0.5"
          title={`${fmtQty(amount, 0)} ${unit}`}
        >
          <span className="num truncate text-[14px] font-semibold leading-none text-white">
            {fmtQty(amount, 0)}
          </span>
          <span className="shrink-0 text-[8px] text-muted2">{unit}</span>
        </div>

        <div className="mt-1 truncate text-[14px] font-semibold text-muted2">
          <span className="text-white">{fmtQty(participants, 0)}</span> 地址
        </div>

        {isSide && (
          <div className="mt-1 truncate text-[14px] font-semibold text-muted">
            {settled ? (
              won ? (
                <>
                  获胜
                  {payout !== undefined && payout !== null && (
                    <span className="text-white"> {payout.toFixed(2)}x</span>
                  )}
                </>
              ) : (
                "未获胜"
              )
            ) : payout !== undefined && payout !== null ? (
              <>
                预计 <span className="text-white">{payout.toFixed(2)}x</span>
              </>
            ) : (
              "等待对手"
            )}
          </div>
        )}
      </div>

      {isSide && share !== undefined && (
        <div
          className={cn(
            "flex h-5 shrink-0 items-center justify-center",
            tone === "long" ? "bg-up/75" : "bg-down/75",
          )}
        >
          <span className="num text-[12px] font-semibold leading-none text-white">
            {Math.round(share)}%
          </span>
        </div>
      )}
    </div>
  );
}

function PoolDetailsSkeleton() {
  return (
    <div>
      <div className="skeleton h-20 rounded-lg" />
      <div className="skeleton mt-3 h-24 rounded-lg" />
    </div>
  );
}

function PoolError({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 text-center">
      <p className="text-[12px] text-white">资金池加载失败</p>
      <p className="max-w-[260px] text-[11px] text-muted2">
        {error ?? "暂无数据"}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 rounded-md bg-brand px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-brand/90"
      >
        重试
      </button>
    </div>
  );
}

function PoolPanelSkeleton() {
  return (
    <div className="p-3">
      <div className="skeleton h-20 rounded-lg" />
      <div className="skeleton mt-3 h-24 rounded-lg" />
    </div>
  );
}
