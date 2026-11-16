import type { Candle } from "./types";

export type LiveTimeframe = "15s" | "30s" | "1m";

export const LIVE_TIMEFRAME_LABEL: Record<LiveTimeframe, string> = {
  "15s": "15 秒",
  "30s": "30 秒",
  "1m": "1 分钟",
};

interface OkxCandleResponse {
  code: string;
  msg: string;
  data: string[][];
}

const OKX_API = "https://www.okx.com";
const MAX_CANDLES = 300;

/**
 * Free, public OKX market data. No API key is required.
 * OKX 的 bar 直接支持 15s / 30s，所以不用在客户端聚合 1s K 线。
 */
export async function getLiveCandles(
  symbol: string,
  timeframe: LiveTimeframe = "1m",
  limit = MAX_CANDLES,
): Promise<Candle[]> {
  const url = new URL("/api/v5/market/candles", OKX_API);
  url.searchParams.set("instId", `${symbol.toUpperCase()}-USDT`);
  url.searchParams.set("bar", timeframe);
  url.searchParams.set(
    "limit",
    String(Math.min(MAX_CANDLES, Math.max(1, Math.floor(limit)))),
  );

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`行情请求失败（HTTP ${response.status}）`);
  }

  const payload = (await response.json()) as OkxCandleResponse;
  if (payload.code !== "0") {
    throw new Error(payload.msg || "行情数据源返回错误");
  }
  if (!Array.isArray(payload.data)) {
    throw new Error("行情数据格式异常");
  }

  const byTime = new Map<number, Candle>();
  for (const row of payload.data) {
    const time = Number(row[0]);
    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const close = Number(row[4]);
    const volume = Number(row[5]);

    if (![time, open, high, low, close, volume].every(Number.isFinite)) {
      continue;
    }

    byTime.set(time, { time, open, high, low, close, volume });
  }

  const candles = [...byTime.values()].sort((a, b) => a.time - b.time);
  if (candles.length === 0) {
    throw new Error(`暂无 ${LIVE_TIMEFRAME_LABEL[timeframe]} K 线数据`);
  }
  return candles;
}
