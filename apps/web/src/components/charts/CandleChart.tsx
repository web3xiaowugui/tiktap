import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/api/types";
import { fmtCandleTime, fmtPct, fmtPrice, fmtTooltipTime } from "@/lib/format";

interface CandleChartProps {
  candles: Candle[];
  symbol: string;
  /** 当前选中轮次的锁定价格，画一条水平线。null/undefined 就不画。 */
  lockPrice?: number | null;
  /** 已开奖轮次的开奖价格，画另一条线。 */
  settlePrice?: number | null;
  className?: string;
}

interface HoverState {
  left: number;
  top: number;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
}

const UP = "#2ebd85";
const DOWN = "#f6465d";
const GRID = "#1e1e26";
const AXIS = "#6a6a77";

const toChartTime = (time: number) => Math.floor(time / 1000) as UTCTimestamp;

export function CandleChart({
  candles,
  symbol,
  lockPrice,
  settlePrice,
  className,
}: CandleChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lockLineRef = useRef<IPriceLine | null>(null);
  const settleLineRef = useRef<IPriceLine | null>(null);
  const fittedRef = useRef(false);
  const [hover, setHover] = useState<HoverState | null>(null);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;

    const chart = createChart(element, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: AXIS,
        fontFamily:
          'Inter, "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: GRID, style: LineStyle.Dotted },
        horzLines: { color: GRID, style: LineStyle.Dotted },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.08, bottom: 0.24 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        // 右侧留出 30 根 K 线的空白，价格线标签（锁定价格 / 开奖价格）不会压到 K 线
        rightOffset: 30,
        barSpacing: 6,
        minBarSpacing: 2,
        tickMarkFormatter: (time: Time) => {
          if (typeof time !== "number") return "";
          return fmtCandleTime(time * 1000, "1m");
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "#5a5a68",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#2c2c36",
        },
        horzLine: {
          color: "#5a5a68",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#2c2c36",
        },
      },
      localization: {
        priceFormatter: (price: number) => fmtPrice(price),
        timeFormatter: (time: Time) => {
          if (typeof time !== "number") return "";
          return fmtTooltipTime(time * 1000);
        },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderVisible: false,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      priceLineVisible: true,
      lastValueVisible: true,
      priceLineWidth: 1,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chart.subscribeCrosshairMove((param) => {
      if (!param.point || typeof param.time !== "number") {
        setHover(null);
        return;
      }
      const data = param.seriesData.get(candleSeries) as CandlestickData<Time> | undefined;
      if (!data || !("open" in data)) {
        setHover(null);
        return;
      }
      const change =
        data.open === 0 ? 0 : ((data.close - data.open) / data.open) * 100;
      setHover({
        left: Math.min(
          Math.max(param.point.x + 14, 8),
          Math.max(8, element.clientWidth - 184),
        ),
        top: Math.min(
          Math.max(param.point.y + 14, 8),
          Math.max(8, element.clientHeight - 150),
        ),
        time: param.time * 1000,
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
        change,
      });
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      lockLineRef.current = null;
      settleLineRef.current = null;
      fittedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!chart || !candleSeries || !volumeSeries) return;

    const candleData: CandlestickData<UTCTimestamp>[] = candles
      .slice()
      .sort((a, b) => a.time - b.time)
      .map((candle) => ({
        time: toChartTime(candle.time),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      }));
    const volumeData: HistogramData<UTCTimestamp>[] = candles
      .slice()
      .sort((a, b) => a.time - b.time)
      .map((candle) => ({
        time: toChartTime(candle.time),
        value: candle.volume,
        color:
          candle.close >= candle.open
            ? "rgba(46, 189, 133, 0.3)"
            : "rgba(246, 70, 93, 0.3)",
      }));

    candleSeries.setData(candleData);
    volumeSeries.setData(volumeData);

    if (candleData.length > 0) {
      const last = candleData[candleData.length - 1];
      candleSeries.applyOptions({
        priceLineColor: last.close >= last.open ? UP : DOWN,
      });
      if (!fittedRef.current) {
        // 先按「最近 90 根 + 右侧 30 根空位」定位，保证右边永远有一截空白
        const bars = candleData.length;
        chart.timeScale().setVisibleLogicalRange({
          from: Math.max(0, bars - 90),
          to: bars + 30,
        });
        fittedRef.current = true;
      }
    }
  }, [candles]);

  /** 选中轮次的锁定价格：在 K 线上画一条水平线，价格变了就重建。 */
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    if (lockLineRef.current) {
      series.removePriceLine(lockLineRef.current);
      lockLineRef.current = null;
    }

    if (lockPrice == null || !Number.isFinite(lockPrice)) return;

    lockLineRef.current = series.createPriceLine({
      price: lockPrice,
      color: "#6f5cf5",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "锁定价格",
    });
  }, [lockPrice, candles]);

  /** 已开奖轮次的开奖价格：另一条水平线，颜色区分开。 */
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    if (settleLineRef.current) {
      series.removePriceLine(settleLineRef.current);
      settleLineRef.current = null;
    }

    if (settlePrice == null || !Number.isFinite(settlePrice)) return;

    settleLineRef.current = series.createPriceLine({
      price: settlePrice,
      color: "#f0b90b",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: "开奖价格",
    });
  }, [settlePrice, candles]);

  return (
    <div ref={wrapRef} className={`relative h-full min-h-0 w-full ${className ?? ""}`}>
      <a
        href="https://www.tradingview.com/"
        target="_blank"
        rel="noreferrer"
        title="Chart by TradingView"
        aria-label="Chart by TradingView"
        className="group absolute bottom-9 left-2.5 z-[3] flex h-10 w-10 items-center overflow-hidden rounded-full border border-white/15 bg-[#17171c]/95 text-white shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur transition-[width,background-color,border-color] duration-300 ease-out hover:w-[212px] hover:border-white/20 hover:bg-[#1c1c22] focus-visible:w-[212px]"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center">
          <img
            src="/tradingview-favicon.ico"
            alt=""
            className="h-[22px] w-[22px] object-contain"
            draggable={false}
          />
        </span>
        <span className="max-w-0 overflow-hidden whitespace-nowrap pl-0 pr-0 text-[13px] font-semibold leading-none tracking-[-0.01em] opacity-0 transition-[max-width,opacity,padding] duration-300 ease-out group-hover:max-w-[170px] group-hover:pl-2 group-hover:pr-4 group-hover:opacity-100 group-focus-visible:max-w-[170px] group-focus-visible:pl-2 group-focus-visible:pr-4 group-focus-visible:opacity-100">
          Chart by TradingView
        </span>
      </a>

      {candles.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] text-muted2">
          暂无 1m K 线数据
        </div>
      )}

      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-[176px] rounded-md border border-line2 bg-[#141419]/95 px-2.5 py-2 text-[10px] shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur"
          style={{ left: hover.left, top: hover.top }}
        >
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[9px] text-muted2">
            <span>{fmtTooltipTime(hover.time)}</span>
            <span>{symbol}</span>
          </div>
          <TooltipRow label="开" value={fmtPrice(hover.open)} />
          <TooltipRow label="高" value={fmtPrice(hover.high)} />
          <TooltipRow label="低" value={fmtPrice(hover.low)} />
          <TooltipRow label="收" value={fmtPrice(hover.close)} />
          <div className="mt-1.5 border-t border-line pt-1.5">
            <span className={hover.change >= 0 ? "text-up" : "text-down"}>
              {Math.abs(hover.change) < 0.005 ? "0.00%" : fmtPct(hover.change)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function TooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 leading-[1.55]">
      <span className="text-muted2">{label}</span>
      <span className="num text-white">{value}</span>
    </div>
  );
}
