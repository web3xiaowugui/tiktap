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

export function shortAddress(address: string, head = 6, tail = 4): string {
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

const clockFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dayFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
});

export function fmtCandleTime(ts: number, timeframe: string): string {
  return timeframe === "1d" ? dayFormatter.format(ts) : clockFormatter.format(ts);
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

export function fmtTooltipTime(ts: number): string {
  return tooltipTimeFormatter.format(ts);
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
