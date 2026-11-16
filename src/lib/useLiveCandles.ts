import { useEffect, useRef, useState } from "react";
import { getLiveCandles } from "@/api";
import type { Candle } from "@/api/types";

interface LiveCandlesState {
  data: Candle[] | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const REFRESH_MS = 15_000;

/**
 * Loads 1m candles from the free OKX public API and refreshes them in place.
 * A failed background refresh keeps the last good snapshot on screen.
 */
export function useLiveCandles(symbol: string): LiveCandlesState {
  const [data, setData] = useState<Candle[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const hasDataRef = useRef(false);

  useEffect(() => {
    let alive = true;
    let inFlight = false;
    let timer = 0;

    hasDataRef.current = false;
    setData(null);
    setLoading(true);
    setError(null);

    const load = async (initial: boolean) => {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await getLiveCandles(symbol, "1m");
        if (!alive) return;
        hasDataRef.current = true;
        setData(next);
        setError(null);
      } catch (cause) {
        if (!alive) return;
        if (initial || !hasDataRef.current) {
          setError(cause instanceof Error ? cause.message : "行情加载失败");
        }
      } finally {
        inFlight = false;
        if (alive && initial) setLoading(false);
      }
    };

    void load(true);
    timer = window.setInterval(() => void load(false), REFRESH_MS);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [symbol, nonce]);

  return {
    data,
    loading,
    error,
    reload: () => setNonce((value) => value + 1),
  };
}
