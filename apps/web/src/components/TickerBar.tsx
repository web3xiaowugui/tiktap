import { useState } from "react";
import { X } from "lucide-react";

const tickers = [
  { symbol: "BTC", price: "$78,274.61", change: 2.08 },
  { symbol: "ETH", price: "$2,315.09", change: 2.83 },
  { symbol: "SOL", price: "$692.89", change: 0.06 },
  { symbol: "HYPE", price: "$86.47", change: 3.09 },
  { symbol: "ZEC", price: "$1,283.9", change: 12.73 },
];

export function TickerBar() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  return (
    <footer className="flex h-7 shrink-0 items-center gap-5 overflow-hidden border-t border-line bg-[#0a0a0c] px-3 text-[10.5px] text-muted">
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-up" />
        <span className="text-[9px] uppercase tracking-[0.14em] text-muted2">live</span>
      </span>

      <div className="no-scrollbar flex min-w-0 items-center gap-5 overflow-x-auto">
        {tickers.map((ticker) => (
          <span key={ticker.symbol} className="flex shrink-0 items-center gap-1.5 num">
            <span className="font-medium text-muted">{ticker.symbol}</span>
            <span className="text-muted2">{ticker.price}</span>
            <span className={ticker.change >= 0 ? "text-up" : "text-down"}>
              {ticker.change >= 0 ? "+" : ""}
              {ticker.change.toFixed(2)}%
            </span>
          </span>
        ))}
      </div>

      <div className="ml-auto hidden shrink-0 items-center gap-4 text-[10px] text-muted2 sm:flex">
        <button type="button" className="transition hover:text-white">
          稳定
        </button>
        <button type="button" className="transition hover:text-white">
          隐私
        </button>
        <button type="button" className="transition hover:text-white">
          条款
        </button>
        <button type="button" className="transition hover:text-white">
          帮助
        </button>
        <button
          type="button"
          aria-label="关闭行情栏"
          onClick={() => setVisible(false)}
          className="transition hover:text-white"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </footer>
  );
}
