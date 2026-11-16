import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "@/lib/cn";

interface HorizontalResizeHandleProps {
  height: number;
  minHeight: number;
  maxHeight: number;
  onResize: (height: number) => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function HorizontalResizeHandle({
  height,
  minHeight,
  maxHeight,
  onResize,
}: HorizontalResizeHandleProps) {
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;

    const previousSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";

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
    dragRef.current = { startY: event.clientY, startHeight: height };
    setDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    event.preventDefault();
    onResize(
      clamp(
        drag.startHeight - (event.clientY - drag.startY),
        minHeight,
        maxHeight,
      ),
    );
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 2 : 10;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const delta = event.key === "ArrowUp" ? step : -step;
      onResize(clamp(height + delta, minHeight, maxHeight));
    }
    if (event.key === "Home") {
      event.preventDefault();
      onResize(minHeight);
    }
    if (event.key === "End") {
      event.preventDefault();
      onResize(maxHeight);
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="调整 K 线下方区域高度"
      aria-valuemin={minHeight}
      aria-valuemax={maxHeight}
      aria-valuenow={Math.round(height)}
      tabIndex={0}
      title="拖动调整 K 线下方区域高度"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={() => {
        dragRef.current = null;
        setDragging(false);
      }}
      onKeyDown={handleKeyDown}
      className="group relative z-20 -my-1 flex h-2 w-full shrink-0 cursor-row-resize touch-none select-none outline-none"
    >
      <span
        className={cn(
          "absolute inset-x-0 top-1/2 h-px -translate-y-1/2 transition-colors",
          dragging
            ? "bg-white/30"
            : "bg-line group-hover:bg-white/25 group-focus-visible:bg-white/25",
        )}
      />
    </div>
  );
}
