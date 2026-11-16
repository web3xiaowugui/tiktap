import { cn } from "@/lib/cn";

export function Logo({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const sizes = {
    sm: "text-[18px]",
    md: "text-[22px]",
    lg: "text-[40px]",
    xl: "text-[104px]",
  } as const;

  return (
    <span
      className={cn(
        "select-none font-extrabold leading-none tracking-[-0.055em] text-white",
        sizes[size],
        className,
      )}
    >
      TikTap
    </span>
  );
}
