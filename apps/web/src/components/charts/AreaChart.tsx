import {
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { EquityPoint, Range } from "@/api/types";
import { fmtCompactUsd, fmtEquityTime, fmtUsd } from "@/lib/format";

export function AreaChart({
  data,
  range,
  className,
}: {
  data: EquityPoint[];
  range: Range;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 190 });
  const [hover, setHover] = useState<{ x: number; y: number; index: number } | null>(null);
  const gradientId = useId().replace(/:/g, "");

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ w: rect.width, h: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => {
    const width = Math.max(260, size.w);
    const height = Math.max(140, size.h);
    const pad = { top: 10, right: 48, bottom: 20, left: 2 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const values = data.map((point) => point.v);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const padValue = (rawMax - rawMin) * 0.12 || rawMax * 0.005;
    const min = rawMin - padValue;
    const max = rawMax + padValue;
    const step = plotW / Math.max(1, data.length - 1);
    const x = (index: number) => pad.left + index * step;
    const y = (value: number) => pad.top + ((max - value) / (max - min || 1)) * plotH;
    return { width, height, pad, plotW, plotH, min, max, step, x, y };
  }, [data, size]);

  const { width, height, pad, plotW, pricePoints } = useMemo(() => {
    const points = data.map((point, index) => `${geometry.x(index)},${geometry.y(point.v)}`);
    return { ...geometry, pricePoints: points, plotW: geometry.plotW };
  }, [data, geometry]);

  const linePath = useMemo(() => {
    if (!pricePoints.length) return "";
    return `M ${pricePoints.join(" L ")}`;
  }, [pricePoints]);

  const areaPath = useMemo(() => {
    if (!pricePoints.length) return "";
    const baseline = pad.top + geometry.plotH;
    return `M ${geometry.x(0)} ${baseline} L ${pricePoints.join(" L ")} L ${
      geometry.x(data.length - 1)
    } ${baseline} Z`;
  }, [pricePoints, data.length, geometry, pad.top, pad]);

  const yTicks = useMemo(
    () =>
      Array.from({ length: 4 }, (_, index) => {
        const value = geometry.min + ((geometry.max - geometry.min) * index) / 3;
        return { value, y: geometry.y(value) };
      }),
    [geometry],
  );

  const xTicks = useMemo(() => {
    const count = 4;
    const indexes = new Set<number>();
    for (let index = 0; index < count; index++) {
      indexes.add(Math.round((index * (data.length - 1)) / (count - 1)));
    }
    return [...indexes];
  }, [data.length]);

  if (!data.length) return <div className={className} />;

  const lastPoint = data[data.length - 1];
  const firstPoint = data[0];
  const positive = lastPoint.v >= firstPoint.v;
  const color = positive ? "#2ebd85" : "#f6465d";

  const handleMove = (event: ReactMouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    const py = ((event.clientY - rect.top) / rect.height) * height;
    const index = Math.max(
      0,
      Math.min(data.length - 1, Math.round((px - pad.left) / geometry.step)),
    );
    setHover({ x: px, y: py, index });
  };

  const hoveredPoint = hover ? data[hover.index] : null;

  return (
    <div ref={wrapRef} className={`relative h-full w-full ${className ?? ""}`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        className="block cursor-crosshair"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`equity-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.24" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <filter id={`glow-${gradientId}`} x="-200%" y="-200%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {yTicks.map((tick, index) => (
          <g key={`y-${index}`}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={tick.y}
              y2={tick.y}
              stroke="#1f1f27"
              strokeWidth="1"
              strokeDasharray="2 5"
            />
            <text x={width - pad.right + 6} y={tick.y + 3} fontSize="8.5" fill="#5f5f6c">
              {fmtCompactUsd(tick.value)}
            </text>
          </g>
        ))}

        {xTicks.map((index) => (
          <text
            key={`x-${index}`}
            x={geometry.x(index)}
            y={height - 5}
            fontSize="8.5"
            fill="#5f5f6c"
            textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}
          >
            {fmtEquityTime(data[index].t, range)}
          </text>
        ))}

        <path d={areaPath} fill={`url(#equity-${gradientId})`} />
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        <circle
          cx={geometry.x(data.length - 1)}
          cy={geometry.y(lastPoint.v)}
          r="3"
          fill={color}
          filter={`url(#glow-${gradientId})`}
        />
        <circle
          cx={geometry.x(data.length - 1)}
          cy={geometry.y(lastPoint.v)}
          r="1.4"
          fill="#fff"
        />

        {hover && hoveredPoint && (
          <g>
            <line
              x1={geometry.x(hover.index)}
              x2={geometry.x(hover.index)}
              y1={pad.top}
              y2={height - pad.bottom}
              stroke="#5a5a68"
              strokeDasharray="3 3"
            />
            <circle
              cx={geometry.x(hover.index)}
              cy={geometry.y(hoveredPoint.v)}
              r="3.5"
              fill={color}
              stroke="#0b0b0e"
              strokeWidth="1.5"
            />
          </g>
        )}
      </svg>

      {hover && hoveredPoint && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-line2 bg-[#141419]/95 px-2.5 py-1.5 text-[10px] shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur"
          style={{
            left: Math.min(Math.max(hover.x - 60, 4), Math.max(4, width - 130)),
            top: 4,
          }}
        >
          <div className="num text-[11px] font-semibold text-white">{fmtUsd(hoveredPoint.v)}</div>
          <div className="text-[8.5px] text-muted2">
            {fmtEquityTime(hoveredPoint.t, range)}
          </div>
        </div>
      )}
    </div>
  );
}
