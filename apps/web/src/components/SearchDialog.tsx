import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { getLeaderboard, getTokens } from "@/api";
import type { LeaderboardEntry, Token } from "@/api/types";
import { Avatar } from "@/components/Avatar";
import { TokenIcon } from "@/components/TokenIcon";
import { fmtPct, fmtSignedToken } from "@/lib/format";
import { cn } from "@/lib/cn";

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [tokens, setTokens] = useState<Token[]>([]);
  const [traders, setTraders] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    Promise.all([getTokens(), getLeaderboard()]).then(([nextTokens, nextTraders]) => {
      setTokens(nextTokens);
      setTraders(nextTraders);
    });
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const normalized = query.trim().toLowerCase();
  const tokenResults = useMemo(() => {
    if (!normalized) return tokens.slice(0, 5);
    return tokens
      .filter(
        (token) =>
          token.symbol.toLowerCase().includes(normalized) ||
          token.name.toLowerCase().includes(normalized),
      )
      .slice(0, 6);
  }, [normalized, tokens]);

  const traderResults = useMemo(() => {
    if (!normalized) return [];
    return traders
      .filter(
        (trader) =>
          trader.name.toLowerCase().includes(normalized) ||
          trader.handle.toLowerCase().includes(normalized) ||
          (trader.xHandle?.toLowerCase().includes(normalized) ?? false),
      )
      .slice(0, 3);
  }, [normalized, traders]);

  if (!open) return null;

  const goToToken = (symbol: string) => {
    navigate(`/discover?symbol=${encodeURIComponent(symbol)}`);
    onClose();
  };

  const goToTrader = (handle: string) => {
    navigate(`/u/${handle}`);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/65 px-4 pt-[12vh] backdrop-blur-[3px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="animate-scale-in w-full max-w-[560px] overflow-hidden rounded-xl border border-line2 bg-[#101014] shadow-[0_32px_100px_rgba(0,0,0,0.7)]">
        <div className="flex h-12 items-center gap-2.5 border-b border-line px-3.5">
          <Search className="h-4 w-4 text-muted2" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && tokenResults[0]) goToToken(tokenResults[0].symbol);
            }}
            placeholder="搜索代币或者用户..."
            className="h-full flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-muted2"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-line px-1.5 py-0.5 text-[9px] text-muted2 transition hover:text-white"
          >
            ESC
          </button>
        </div>

        <div className="max-h-[56vh] overflow-y-auto p-2">
          <div className="px-2 pb-1.5 pt-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted2">
            {normalized ? "代币" : "热门代币"}
          </div>

          {tokenResults.length === 0 && traderResults.length === 0 && (
            <div className="px-3 py-8 text-center text-[12px] text-muted">
              没有找到与 “{query}” 相关的结果
            </div>
          )}

          {tokenResults.map((token) => (
            <button
              key={token.symbol}
              type="button"
              onClick={() => goToToken(token.symbol)}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition hover:bg-panel2"
            >
              <TokenIcon icon={token.icon} size={24} />
              <span className="text-[12px] font-semibold text-white">{token.symbol}</span>
              <span className="truncate text-[11px] text-muted2">{token.name}</span>
            </button>
          ))}

          {traderResults.length > 0 && (
            <>
              <div className="px-2 pb-1.5 pt-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted2">
                交易者
              </div>
              {traderResults.map((trader) => {
                const xHandle = trader.xHandle?.trim();
                // 昵称本身就是 @handle 时（没有 X 昵称）不重复展示。
                const showXHandle =
                  xHandle !== undefined &&
                  trader.name.trim().toLowerCase() !== `@${xHandle.toLowerCase()}`;
                return (
                  <button
                    key={trader.handle}
                    type="button"
                    onClick={() => goToTrader(trader.handle)}
                    className="group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition hover:bg-panel2"
                  >
                    <Avatar name={trader.name} gradient={trader.avatar} size={24} />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-baseline gap-1">
                        <span className="truncate text-[12px] font-medium text-white">
                          {trader.name}
                        </span>
                        {showXHandle && (
                          <span className="shrink-0 text-[10px] text-muted2">
                            @{xHandle}
                          </span>
                        )}
                      </div>
                      <div className="num truncate text-[10px] text-muted2">{trader.handle}</div>
                    </div>
                    <span
                      className={cn(
                        "num shrink-0 text-[10px] font-semibold",
                        trader.pnl >= 0 ? "text-up" : "text-down",
                      )}
                    >
                      {fmtSignedToken(trader.pnl, "TEST", 2)}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-3.5 py-2 text-[9.5px] text-muted2">
          <span>点击结果直接打开</span>
          <span className="flex items-center gap-2">
            <kbd className="rounded border border-line px-1 py-0.5">↵</kbd>
            <span>打开第一个结果</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export function useSearchHotkey(onOpen: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpen]);
}
