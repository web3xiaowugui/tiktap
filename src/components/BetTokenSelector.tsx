import { useMemo } from "react";
import { TokenIcon } from "@/components/TokenIcon";
import { useBetToken } from "@/context/BetTokenContext";
import { cn } from "@/lib/cn";

export function BetTokenSelector() {
  const { tokens, loading, selected, selectToken } = useBetToken();
  const orderedTokens = useMemo(
    () =>
      [...tokens].sort((a, b) => {
        if (a.symbol === b.symbol) return 0;
        if (a.symbol === "OKB") return -1;
        if (b.symbol === "OKB") return 1;
        return 0;
      }),
    [tokens],
  );

  return (
    <div>
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-[#121217] p-1">
        {loading &&
          [0, 1, 2].map((item) => (
            <div key={item} className="skeleton h-8 rounded-md" />
          ))}
        {!loading &&
          orderedTokens.map((betToken) => {
            const active = selected?.symbol === betToken.symbol;
            return (
              <button
                key={betToken.symbol}
                type="button"
                onClick={() => selectToken(betToken.symbol)}
                aria-pressed={active}
                title={`${betToken.name} · XLayer`}
                className={cn(
                  "flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-[13px] font-bold transition",
                  active
                    ? "bg-brand text-white shadow-[0_0_18px_rgba(111,92,245,0.18)]"
                    : "text-muted hover:text-white",
                )}
              >
                <TokenIcon icon={betToken.icon} size={18} />
                <span className="truncate">{betToken.symbol}</span>
              </button>
            );
          })}
      </div>
    </div>
  );
}
