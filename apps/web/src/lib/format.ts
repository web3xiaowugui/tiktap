const priceFormatter = (digits: number) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export function priceDigits(value: number): number {
  const n = Math.abs(value);
  if (n >= 1000) return 2;
  if (n >= 100) return 2;
  if (n >= 1) return 3;
  if (n >= 0.01) return 4;
  if (n >= 0.0001) return 6;
  return 8;
}

export function fmtPrice(value: number): string {
  return priceFormatter(priceDigits(value)).format(value);
}

export function fmtUsd(value: number, digits = 2): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${priceFormatter(digits).format(Math.abs(value))}`;
}

export function fmtSignedUsd(value: number, digits = 2): string {
  const sign = value < 0 ? "-" : "+";
  return `${sign}$${priceFormatter(digits).format(Math.abs(value))}`;
}

export function fmtPct(value: number, digits = 2): string {
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${Math.abs(value).toFixed(digits)}%`;
}

export function fmtSignedPct(value: number, digits = 2): string {
  return `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(digits)}%`;
}

const compactFormatter = new Intl.NumberFormat("zh-CN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function fmtCompact(value: number): string {
  return compactFormatter.format(value);
}

export function fmtCompactUsd(value: number): string {
  return `$${compactFormatter.format(value)}`;
}

export function fmtQty(value: number, digits = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** 代币余额 / 数量：不强制补零，最多 4 位小数。 */
export function fmtTokenAmount(value: number, digits = 4): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: digits,
  });
}

/** 带符号的代币盈亏，例如 "+1.25 TEST"、"0 TEST"。 */
export function fmtSignedToken(value: number, symbol: string, digits = 4): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${fmtTokenAmount(Math.abs(value), digits)} ${symbol}`;
}

const tokenCompactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 3,
});

/** 图表 Y 轴用：代币数量缩写，保留 3 位小数。 */
export function fmtCompactToken(value: number): string {
  return tokenCompactFormatter.format(value);
}

export function shortAddress(address: string, head = 6, tail = 4): string {
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

const clockFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const clockSecondsFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const dayFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
});

const SUB_MINUTE_TIMEFRAMES = new Set(["1s", "5s", "15s", "30s"]);

export function fmtCandleTime(ts: number, timeframe: string): string {
  if (timeframe === "1d") return dayFormatter.format(ts);
  return SUB_MINUTE_TIMEFRAMES.has(timeframe)
    ? clockSecondsFormatter.format(ts)
    : clockFormatter.format(ts);
}

export function fmtClock(ts: number): string {
  return clockFormatter.format(ts);
}

export function fmtBlock(block: number): string {
  return `#${block.toLocaleString("en-US")}`;
}

export function fmtCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const tooltipTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const tooltipSecondsFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** 秒级周期（15s / 30s）的 tooltip 需要带上秒。 */
export function fmtTooltipTime(ts: number, withSeconds = false): string {
  return (withSeconds ? tooltipSecondsFormatter : tooltipTimeFormatter).format(ts);
}

const equityTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const equityDayFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
});

export function fmtEquityTime(ts: number, range: "24h" | "7d" | "30d"): string {
  return range === "24h" ? equityTimeFormatter.format(ts) : equityDayFormatter.format(ts);
}

export function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}
