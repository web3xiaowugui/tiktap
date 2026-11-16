import { cn } from "@/lib/cn";

export function Avatar({
  name,
  gradient,
  size = 28,
  className,
}: {
  name: string;
  gradient: string;
  size?: number;
  className?: string;
}) {
  const initial = name.trim().slice(0, 1).toUpperCase() || "F";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: gradient,
        fontSize: Math.max(9, size * 0.4),
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.16)",
      }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
