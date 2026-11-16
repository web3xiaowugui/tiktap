import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { fmtBlock, fmtQty } from "@/lib/format";
import {
  getTimelineRounds,
  type RoundStatus,
  type TimelineRound,
} from "@/lib/rounds";
import { useChainClock } from "@/lib/chainClock";

const STATUS: Record<
  RoundStatus,
  { label: string; bar: string; title: string; text: string }
> = {
  settled: {
    label: "已开奖",
    bar: "border-white/10 bg-white/[0.06]",
    title: "text-muted2",
    text: "text-muted",
  },
  waiting: {
    label: "待开奖",
    bar: "border-[#f5a623]/30 bg-[#f5a623]/10",
    title: "text-[#f5a623]/70",
    text: "text-[#f5a623]",
  },
  betting: {
    label: "下注中",
    bar: "border-brand/40 bg-brand/20",
    title: "text-muted",
    text: "text-[#d3caff]",
  },
  upcoming: {
    label: "未开始",
    bar: "border-line bg-white/[0.02]",
    title: "text-muted2/60",
    text: "text-muted2/80",
  },
};

export function RoundTimeline({
  block,
  selectedStartBlock,
  onSelect,
}: {
  block: number;
  selectedStartBlock?: number;
  onSelect?: (round: TimelineRound) => void;
}) {
  const clock = useChainClock();
  const rounds = getTimelineRounds(block, clock.anchor);
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const sync = () => setTrackWidth(track.clientWidth);
    sync();

    const observer = new ResizeObserver(sync);
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  const domainStart = Math.min(
    ...rounds.map((round) => round.visibleStartBlock),
  );
  const domainEnd = Math.max(...rounds.map((round) => round.visibleEndBlock));
  const domain = domainEnd - domainStart;
  const nowLeft = Math.min(
    100,
    Math.max(0, ((block - domainStart) / domain) * 100),
  );
  // 刻度打在轮次边界上（正好每格 25%）；窗口窄就隔一格打一个，
  // 不要用固定数量把数字挤到格子中间去。
  const ROUND_SLOTS = rounds.length;
  const tickStep = trackWidth > 0 && trackWidth < 420 ? 2 : 1;
  const ticks: Array<{ block: number; left: number }> = [];
  for (let index = 0; index <= ROUND_SLOTS; index += tickStep) {
    const ratio = index / ROUND_SLOTS;
    ticks.push({
      block: Math.round(domainStart + ratio * domain),
      left: ratio * 100,
    });
  }

  const topRounds = rounds.filter((round) => round.lane === "top");
  const bottomRounds = rounds.filter((round) => round.lane === "bottom");
  const markerLeft =
    trackWidth > 0
      ? Math.round((nowLeft / 100) * trackWidth)
      : null;

  return (
    <div className="mt-5 mb-3 pb-3">
      <div className="mx-auto w-full">
        <div ref={trackRef} className="relative py-3.5">
        <div className="relative h-[60px]">
          {topRounds.map((round) => (
            <TimelineBar
              key={round.id}
              round={round}
              domainStart={domainStart}
              domain={domain}
              selected={round.startBlock === selectedStartBlock}
              onSelect={onSelect}
            />
          ))}
        </div>

        <div className="relative h-[30px]">
          <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
          {ticks.map((tick, index) => (
            <div
              key={tick.block}
              className={cn(
                "absolute top-1/2 -translate-y-1/2",
                index === 0
                  ? ""
                  : index === ticks.length - 1
                    ? "-translate-x-full"
                    : "-translate-x-1/2",
              )}
              style={{ left: `${tick.left}%` }}
            >
              <span
                title={fmtBlock(tick.block)}
                className="relative block whitespace-nowrap rounded-sm bg-ink px-1 text-[14px] leading-4 text-muted2"
              >
                {fmtBlock(tick.block)}
              </span>
            </div>
          ))}
        </div>

        <div className="relative h-[60px]">
          {bottomRounds.map((round) => (
            <TimelineBar
              key={round.id}
              round={round}
              domainStart={domainStart}
              domain={domain}
              selected={round.startBlock === selectedStartBlock}
              onSelect={onSelect}
            />
          ))}
        </div>

        <div
          className="pointer-events-none absolute inset-y-0 z-10"
          style={
            markerLeft === null
              ? { left: `${nowLeft}%` }
              : { left: `${markerLeft}px` }
          }
          aria-hidden="true"
        >
          <div className="absolute inset-y-0 left-0 w-0.5 -translate-x-1/2 bg-brand" />
          <span className="absolute left-0 -top-5 flex h-[18px] -translate-x-1/2 items-center justify-center rounded-sm border border-brand/50 bg-panel2 px-1.5 text-[14px] font-semibold leading-none tracking-[0.08em] text-brand2">
            Tik
          </span>
          <span className="num absolute -bottom-5 left-0 flex h-[18px] -translate-x-1/2 items-center justify-center whitespace-nowrap rounded-sm border border-brand/25 bg-panel2 px-1.5 text-[14px] font-medium leading-none text-brand2">
            {fmtBlock(block)}
          </span>
        </div>
        </div>
      </div>
    </div>
  );
}

function TimelineBar({
  round,
  domainStart,
  domain,
  selected,
  onSelect,
}: {
  round: TimelineRound;
  domainStart: number;
  domain: number;
  selected: boolean;
  onSelect?: (round: TimelineRound) => void;
}) {
  const selectable = round.status !== "upcoming" && Boolean(onSelect);
  const handleSelect = () => {
    if (selectable) onSelect?.(round);
  };
  const status = STATUS[round.status];
  const statusLabel = round.partial
    ? `${status.label} · ${round.partial === "second" ? "后半" : "前半"}`
    : status.label;
  const showSplit =
    round.status !== "settled" && round.status !== "upcoming";
  const visibleSpan = round.visibleEndBlock - round.visibleStartBlock;
  const closePct =
    visibleSpan > 0
      ? Math.min(
          100,
          Math.max(
            0,
            ((round.closeBlock - round.visibleStartBlock) / visibleSpan) * 100,
          ),
        )
      : 50;

  const left = ((round.visibleStartBlock - domainStart) / domain) * 100;
  const width =
    ((round.visibleEndBlock - round.visibleStartBlock) / domain) * 100;

  return (
    <div
      className={cn("absolute top-0 px-0.5", selectable && "cursor-pointer")}
      style={{ left: `${left}%`, width: `${width}%` }}
      title={`第 ${fmtQty(round.number, 0)} 轮 · ${fmtBlock(round.startBlock)} → ${fmtBlock(round.settleBlock)} · ${statusLabel}${selectable ? " · 点击查看" : ""}`}
      onClick={selectable ? handleSelect : undefined}
      onKeyDown={
        selectable
          ? (event: ReactKeyboardEvent<HTMLDivElement>) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleSelect();
              }
            }
          : undefined
      }
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
      aria-pressed={selectable ? selected : undefined}
    >
      <div
        className={cn(
          "relative h-[60px] overflow-hidden rounded-md border transition-[filter]",
          status.bar,
          selectable && "hover:brightness-110",
          selected && "ring-2 ring-white/45",
        )}
      >
        {showSplit && (
          <>
            <div
              className="absolute inset-y-0 left-0 bg-[#6f5cf5]/[0.14]"
              style={{ width: `${closePct}%` }}
            />
            <div
              className="absolute inset-y-0 right-0 bg-[#6f5cf5]/[0.14]"
              style={{ left: `${closePct}%` }}
            />
            <div
              className="absolute inset-y-0 z-[1] w-0.5 -translate-x-1/2 bg-white/45"
              style={{ left: `${closePct}%` }}
            />
            <span
              className="absolute top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[14px] font-semibold text-[#d7d0ff]"
              style={{ left: `${closePct / 2}%` }}
            >
              下注期
            </span>
            <span
              className="absolute top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[14px] font-semibold text-[#d7d0ff]"
              style={{ left: `${closePct + (100 - closePct) / 2}%` }}
            >
              封盘期
            </span>
          </>
        )}

        <div
          className={cn(
            "absolute inset-0 z-10 flex justify-center px-2 text-center",
            showSplit ? "items-start" : "flex-col items-center justify-center",
          )}
        >
          {showSplit ? (
            <span
              className={cn(
                "max-w-full truncate rounded-md border border-white/10 bg-ink/80 px-2 py-0.5 text-[14px] font-semibold leading-none backdrop-blur-sm",
                status.title,
              )}
            >
              {statusLabel}
            </span>
          ) : (
            <span
              className={cn(
                "w-full truncate text-[14px] font-semibold leading-none",
                status.text,
              )}
            >
              {statusLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
