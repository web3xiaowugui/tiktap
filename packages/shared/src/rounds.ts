/** X Layer produces one L2 block roughly every second. */
export const XLAYER_BLOCK_TIME_MS = 1_000;

/** A round lasts 600 blocks: 300 blocks betting + 300 blocks locked. */
export const ROUND_DURATION_BLOCKS = 600;
export const ROUND_BETTING_BLOCKS = 300;

/**
 * 合约里轮次首尾相接、不重叠：第 n 轮 = [anchor + 600n, anchor + 600n + 600)。
 * 这里保持和 `PoolMarket.ROUND_BLOCKS` 一致，别再退回 300 的间隔。
 */
export const ROUND_INTERVAL_BLOCKS = 600;

/**
 * 本地兜底用的伪区块高度：只有拿不到 `/api/round` 时才用。
 * 真实运行时以链上 blockNumber + 部署块（anchor）为准，见 `roundStartFor`。
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

/** 当前轮起点。`anchor` 是合约的 anchorBlock（第 0 轮起始块）。 */
export function roundStartFor(block: number, anchor?: number | null): number {
  if (anchor === null || anchor === undefined || block < anchor) {
    return Math.floor(block / ROUND_INTERVAL_BLOCKS) * ROUND_INTERVAL_BLOCKS;
  }
  return anchor + Math.floor((block - anchor) / ROUND_DURATION_BLOCKS) * ROUND_DURATION_BLOCKS;
}

function roundNumberFor(startBlock: number, anchor?: number | null): number {
  if (anchor !== null && anchor !== undefined && startBlock >= anchor) {
    return Math.floor((startBlock - anchor) / ROUND_DURATION_BLOCKS);
  }
  return Math.floor(startBlock / ROUND_INTERVAL_BLOCKS) + 1;
}

function makeRound(startBlock: number, phase: RoundPhase, anchor?: number | null): RoundWindow {
  return {
    id: `round-${startBlock}`,
    number: roundNumberFor(startBlock, anchor),
    startBlock,
    closeBlock: startBlock + ROUND_BETTING_BLOCKS,
    settleBlock: startBlock + ROUND_DURATION_BLOCKS,
    phase,
  };
}

export function getActiveRound(block: number, anchor?: number | null): RoundWindow {
  return makeRound(roundStartFor(block, anchor), "betting", anchor);
}

export function getPreviousRound(block: number, anchor?: number | null): RoundWindow {
  const active = getActiveRound(block, anchor);
  return makeRound(active.startBlock - ROUND_DURATION_BLOCKS, "waiting", anchor);
}

export function getRoundWindows(
  block: number,
  anchor?: number | null,
): { active: RoundWindow; previous: RoundWindow } {
  return {
    active: getActiveRound(block, anchor),
    previous: getPreviousRound(block, anchor),
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
export function getTimelineRounds(block: number, anchor?: number | null): TimelineRound[] {
  const activeStart = roundStartFor(block, anchor);

  return TIMELINE_DEFS.map(({ offset, lane }) => {
    const startBlock = activeStart + offset * ROUND_DURATION_BLOCKS;

    return {
      id: `round-${startBlock}`,
      number: roundNumberFor(startBlock, anchor),
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
