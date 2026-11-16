import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getRound } from "@/api";
import {
  ROUND_BETTING_BLOCKS,
  ROUND_INTERVAL_BLOCKS,
  getBlockNumber,
  roundStartFor,
} from "@/lib/rounds";
import { useNow } from "@/lib/useNow";

const POLL_MS = 4_000;

interface ChainRound {
  blockNumber: number;
  currentRound: number;
  isBettingOpen: boolean;
  roundStartBlock: number;
  roundEndBlock: number;
  blocksLeftInWindow: number;
}

interface ChainClockValue {
  /** 链上块高；两次轮询之间用本地时钟外推。 */
  block: number;
  /** 合约 anchorBlock（第 0 轮起始块），拿不到链上数据时为 null。 */
  anchor: number | null;
  currentRound: number | null;
  /** 当前轮的下注窗口是否还开着。 */
  bettingOpen: boolean;
  /** 距离封盘还有多少块。 */
  blocksToClose: number;
  live: boolean;
  /** 每次 refresh 递增，用作 useApi 依赖，下注后能触发重取。 */
  version: number;
  refresh: () => void;
}

const ChainClockContext = createContext<ChainClockValue | null>(null);

export function ChainClockProvider({ children }: { children: ReactNode }) {
  const now = useNow(1_000);
  const [sample, setSample] = useState<{ info: ChainRound; at: number } | null>(null);
  const [nonce, setNonce] = useState(0);
  const [phaseTicks, setPhaseTicks] = useState(0);
  const lastPhase = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const info = await getRound();
        if (alive) setSample({ info, at: Date.now() });
      } catch {
        // 后端没配链时保持上一次采样（或走本地兜底）
      }
    };

    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [nonce]);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  // 封盘 / 开新轮时自动让池子、我的下注、持仓重取一次，不用用户手动点。
  const phaseKey = sample
    ? `${sample.info.currentRound}:${sample.info.isBettingOpen}`
    : null;
  useEffect(() => {
    if (phaseKey === null) return;
    if (lastPhase.current !== null && lastPhase.current !== phaseKey) {
      setPhaseTicks((value) => value + 1);
    }
    lastPhase.current = phaseKey;
  }, [phaseKey]);

  const value = useMemo<ChainClockValue>(() => {
    if (!sample) {
      const fallback = getBlockNumber(now);
      return {
        block: fallback,
        anchor: null,
        currentRound: null,
        bettingOpen: true,
        blocksToClose: 0,
        live: false,
        version: nonce + phaseTicks,
        refresh,
      };
    }

    const anchor = sample.info.roundStartBlock - sample.info.currentRound * ROUND_INTERVAL_BLOCKS;
    const drift = Math.max(0, Math.floor((Date.now() - sample.at) / 1_000));
    const block = sample.info.blockNumber + drift;
    const start = roundStartFor(block, anchor);
    const blocksToClose = Math.max(0, start + ROUND_BETTING_BLOCKS - block);

    return {
      block,
      anchor,
      currentRound: Math.floor((block - anchor) / ROUND_INTERVAL_BLOCKS),
      bettingOpen: blocksToClose > 0,
      blocksToClose,
      live: true,
      version: nonce + phaseTicks,
      refresh,
    };
  }, [sample, now, refresh, nonce]);

  return <ChainClockContext.Provider value={value}>{children}</ChainClockContext.Provider>;
}

export function useChainClock(): ChainClockValue {
  const context = useContext(ChainClockContext);
  if (!context) throw new Error("useChainClock must be used inside ChainClockProvider");
  return context;
}
