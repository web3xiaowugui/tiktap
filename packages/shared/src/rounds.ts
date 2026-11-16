/** X Layer produces one L2 block roughly every second. */
export const XLAYER_BLOCK_TIME_MS = 1_000;

/** A round lasts 600 blocks: 300 blocks betting + 300 blocks locked. */
export const ROUND_DURATION_BLOCKS = 600;
export const ROUND_BETTING_BLOCKS = 300;

/** A new round starts every 300 blocks, so adjacent rounds overlap for one phase. */
export const ROUND_INTERVAL_BLOCKS = 300;

/**
 * Mock chain anchor. Replace this with the live `eth_blockNumber` result when
 * the app is wired to X Layer RPC; the UI only depends on `getBlockNumber`.
 */
const XLAYER_ANCHOR_BLOCK = 19_085_876;
const XLAYER_ANCHOR_TIME = Date.UTC(2026, 10, 5, 16, 0, 0);

export function getBlockNumber(now: number): number {
  const elapsed = Math.floor((now - XLAYER_ANCHOR_TIME) / XLAYER_BLOCK_TIME_MS);
  return XLAYER_ANCHOR_BLOCK + Math.max(0, elapsed);
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

function roundNumberFor(startBlock: number): number {
  return Math.floor(startBlock / ROUND_INTERVAL_BLOCKS) + 1;
}

function makeRound(startBlock: number, phase: RoundPhase): RoundWindow {
  const number = roundNumberFor(startBlock);
  return {
    id: `round-${startBlock}`,
    number,
    startBlock,
    closeBlock: startBlock + ROUND_BETTING_BLOCKS,
    settleBlock: startBlock + ROUND_DURATION_BLOCKS,
    phase,
  };
}

export function getActiveRound(block: number): RoundWindow {
  const startBlock =
    Math.floor(block / ROUND_INTERVAL_BLOCKS) * ROUND_INTERVAL_BLOCKS;
  return makeRound(startBlock, "betting");
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

const TIMELINE_DEFS: Array<{
  offset: number;
  status: RoundStatus;
  lane: "top" | "bottom";
}> = [
  { offset: -2, status: "settled", lane: "top" },
  { offset: -1, status: "waiting", lane: "bottom" },
  { offset: 0, status: "betting", lane: "top" },
  { offset: 1, status: "upcoming", lane: "bottom" },
];

export function getTimelineRounds(block: number): TimelineRound[] {
  const active = getActiveRound(block);

  return TIMELINE_DEFS.map(({ offset, status, lane }) => {
    const startBlock = active.startBlock + offset * ROUND_INTERVAL_BLOCKS;
    const closeBlock = startBlock + ROUND_BETTING_BLOCKS;
    const settleBlock = startBlock + ROUND_DURATION_BLOCKS;

    return {
      id: `round-${startBlock}`,
      number: active.number + offset,
      startBlock,
      closeBlock,
      settleBlock,
      visibleStartBlock: startBlock,
      visibleEndBlock: settleBlock,
      status,
      lane,
    };
  });
}
