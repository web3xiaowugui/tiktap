/** X Layer produces one L2 block roughly every second. */
export const XLAYER_BLOCK_TIME_MS = 1_000;

/** A round lasts 600 blocks: 300 blocks betting + 300 blocks locked. */
export const ROUND_DURATION_BLOCKS = 600;
export const ROUND_BETTING_BLOCKS = 300;

/**
 * 合约里轮次完全按区块号派生：第 n 轮 = [300n, 300n + 600)，每 300 块起一轮。
 * 这里保持和 `PoolMarket.ROUND_BLOCKS` 一致，别再退回 300 的间隔。
 */
export const ROUND_INTERVAL_BLOCKS = 300;

/**
 * 本地兜底用的伪区块高度：只有拿不到 `/api/round` 时才用（网格是全局 300 对齐的）。
 * 真实运行时直接取链上 blockNumber，轮次边界就是 300 的整数倍，见 `roundStartFor`。
 */
const FALLBACK_ANCHOR_BLOCK = 19_085_876;
const FALLBACK_ANCHOR_TIME = Date.UTC(2026, 10, 5, 16, 0, 0);

export function getBlockNumber(now: number): number {
  const elapsed = Math.floor((now - FALLBACK_ANCHOR_TIME) / XLAYER_BLOCK_TIME_MS);
  return FALLBACK_ANCHOR_BLOCK + Math.max(0, elapsed);
}

export type RoundPhase = "betting" | "waiting";
export type RoundStatus = "settled" | "waiting" | "betting" | "upcoming";

export interface RoundWindow {
  id: string;
  number: number;
  startBlock: number;
  closeBlock: number;
  settleBlock: number;
  phase: RoundPhase;
}

export interface TimelineRound {
  id: string;
  number: number;
  startBlock: number;
  closeBlock: number;
  settleBlock: number;
  visibleStartBlock: number;
  visibleEndBlock: number;
  status: RoundStatus;
  lane: "top" | "bottom";
  partial?: "first" | "second";
}

/** 当前轮起点：直接对 300 取整（边界就是 300 的整数倍）。 */
/** 轮次网格完全由区块号派生：每 300 块一轮，边界就是 300 的整数倍。 */
export function roundStartFor(block: number): number {
  return Math.floor(Math.max(0, block) / ROUND_INTERVAL_BLOCKS) * ROUND_INTERVAL_BLOCKS;
}

function roundNumberFor(startBlock: number): number {
  return Math.floor(startBlock / ROUND_INTERVAL_BLOCKS);
}

function makeRound(startBlock: number, phase: RoundPhase): RoundWindow {
  return {
    id: `round-${startBlock}`,
    number: roundNumberFor(startBlock),
    startBlock,
    closeBlock: startBlock + ROUND_BETTING_BLOCKS,
    settleBlock: startBlock + ROUND_DURATION_BLOCKS,
    phase,
  };
}

export function getActiveRound(block: number): RoundWindow {
  return makeRound(roundStartFor(block), "betting");
}

export function getPreviousRound(block: number): RoundWindow {
  const active = getActiveRound(block);
  return makeRound(active.startBlock - ROUND_INTERVAL_BLOCKS, "waiting");
}

export function getRoundWindows(block: number): {
  active: RoundWindow;
  previous: RoundWindow;
} {
  return {
    active: getActiveRound(block),
    previous: getPreviousRound(block),
  };
}

export function getRoundCountdown(round: RoundWindow, block: number): number {
  const deadline = round.phase === "betting" ? round.closeBlock : round.settleBlock;
  return Math.max(0, deadline - block);
}

/** Status of an arbitrary round at a given block height. */
export function roundStatusFor(startBlock: number, block: number): RoundStatus {
  if (block < startBlock) return "upcoming";
  if (block < startBlock + ROUND_BETTING_BLOCKS) return "betting";
  if (block < startBlock + ROUND_DURATION_BLOCKS) return "waiting";
  return "settled";
}

/** Blocks left until the round's next milestone: open, close, or settle. */
export function roundCountdownFor(startBlock: number, block: number): number {
  if (block < startBlock) return startBlock - block;
  if (block < startBlock + ROUND_BETTING_BLOCKS) {
    return startBlock + ROUND_BETTING_BLOCKS - block;
  }
  if (block < startBlock + ROUND_DURATION_BLOCKS) {
    return startBlock + ROUND_DURATION_BLOCKS - block;
  }
  return 0;
}

/**
 * 时间轴上的四轮。每 300 块起一轮、每轮 600 块，所以相邻两轮在横向上重叠
 * 半个格子：上下两行交错 300 块，形成一条跨轴连续的带子。
 */
const TIMELINE_DEFS: Array<{ offset: number; lane: "top" | "bottom" }> = [
  { offset: -2, lane: "top" },
  { offset: -1, lane: "bottom" },
  { offset: 0, lane: "top" },
  { offset: 1, lane: "bottom" },
];

/**
 * 时间轴上的四轮：上两轮/下两轮交替，状态按当前区块高度实时算出来
 * （旧版是按 offset 写死的，链上一动就错）。
 */
export function getTimelineRounds(block: number): TimelineRound[] {
  const activeStart = roundStartFor(block);

  return TIMELINE_DEFS.map(({ offset, lane }) => {
    const startBlock = activeStart + offset * ROUND_INTERVAL_BLOCKS;

    return {
      id: `round-${startBlock}`,
      number: roundNumberFor(startBlock),
      startBlock,
      closeBlock: startBlock + ROUND_BETTING_BLOCKS,
      settleBlock: startBlock + ROUND_DURATION_BLOCKS,
      visibleStartBlock: startBlock,
      visibleEndBlock: startBlock + ROUND_DURATION_BLOCKS,
      status: roundStatusFor(startBlock, block),
      lane,
    };
  });
}
