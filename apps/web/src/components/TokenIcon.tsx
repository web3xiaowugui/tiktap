import type { TokenIcon as TokenIconShape } from "@/api/types";
import { cn } from "@/lib/cn";

export function TokenIcon({
  icon,
  size = 22,
  className,
}: {
  icon: TokenIconShape;
  size?: number;
  className?: string;
}) {
  const glyph = icon.glyph;
  const fontSize =
    glyph.length >= 3 ? Math.max(7, size * 0.3) : glyph.length === 2 ? size * 0.38 : size * 0.48;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold leading-none",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: icon.bg,
        color: icon.fg ?? "#ffffff",
        fontSize,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.14)",
      }}
      aria-hidden="true"
    >
      {glyph}
    </span>
  );
}
