import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "@/lib/cn";

interface ChartSplitHandleProps {
  ratio: number;
  minRatio: number;
  maxRatio: number;
  onRatioChange: (ratio: number) => void;
  label?: string;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function ChartSplitHandle({
  ratio,
  minRatio,
  maxRatio,
  onRatioChange,
  label = "K 线区域宽度",
}: ChartSplitHandleProps) {
  const dragRef = useRef<{
    startX: number;
    startRatio: number;
    containerWidth: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;

    const previousSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      document.body.style.userSelect = previousSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [dragging]);

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startRatio: ratio,
      containerWidth:
        event.currentTarget.parentElement?.getBoundingClientRect().width ?? 1,
    };
    setDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.containerWidth <= 0) return;
    event.preventDefault();
    const delta = (event.clientX - drag.startX) / drag.containerWidth;
    onRatioChange(clamp(drag.startRatio + delta, minRatio, maxRatio));
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.005 : 0.02;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const delta = event.key === "ArrowLeft" ? -step : step;
      onRatioChange(clamp(ratio + delta, minRatio, maxRatio));
    }
    if (event.key === "Home") {
      event.preventDefault();
      onRatioChange(minRatio);
    }
    if (event.key === "End") {
      event.preventDefault();
      onRatioChange(maxRatio);
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`调整${label}`}
      aria-valuemin={Math.round(minRatio * 100)}
      aria-valuemax={Math.round(maxRatio * 100)}
      aria-valuenow={Math.round(ratio * 100)}
      tabIndex={0}
      title={`拖动调整${label}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={() => {
        dragRef.current = null;
        setDragging(false);
      }}
      onKeyDown={handleKeyDown}
      className="group relative z-20 -mx-1 hidden w-2 shrink-0 cursor-col-resize touch-none select-none outline-none lg:flex"
    >
      <span
        className={cn(
          "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors",
          dragging
            ? "bg-white/30"
            : "bg-line group-hover:bg-white/25 group-focus-visible:bg-white/25",
        )}
      />
    </div>
  );
}
