import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getHoldings } from "@/api";
import { useBetToken } from "@/context/BetTokenContext";
import { cn } from "@/lib/cn";
import { fmtQty } from "@/lib/format";
import {
  ROUND_INTERVAL_BLOCKS,
  roundCountdownFor,
  roundStartFor,
  roundStatusFor,
  type RoundStatus,
} from "@/lib/rounds";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/context/AuthContext";
import { useChainClock } from "@/lib/chainClock";

const STATUS_LABEL: Record<RoundStatus, string> = {
  betting: "下注中",
  waiting: "待开奖",
  settled: "已开奖",
  upcoming: "未开始",
};

const STATUS_TONE: Record<RoundStatus, string> = {
  betting: "text-brand2",
  waiting: "text-[#f5a623]",
  settled: "text-muted",
  upcoming: "text-muted2",
};

const COLUMNS =
  "grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.1fr)] items-center gap-2";

export function YourPositions({ withHeader = true }: { withHeader?: boolean }) {
  const navigate = useNavigate();
  const { selectToken } = useBetToken();
  // 跳到市场时把下注代币一起带过去，否则会落回默认的 OKB。
  const openMarket = (symbol: string, token: string) => {
    selectToken(token);
    navigate(`/discover?symbol=${encodeURIComponent(symbol)}`);
  };
  const { user } = useAuth();
  const clock = useChainClock();
  const address = user?.address ?? null;
  const { data, loading } = useApi(
    () => getHoldings(address),
    [address, clock.version],
  );

  const rows = data ?? [];
  const block = clock.block;
  const activeStartBlock = roundStartFor(block, clock.anchor);

  // 持仓 only covers live rounds; settled bets have already paid out.
  const holdings = useMemo(
    () =>
      rows
        .map((row) => {
          const startBlock =
            row.roundStartBlock ??
            activeStartBlock + row.roundOffset * ROUND_INTERVAL_BLOCKS;

          return {
            ...row,
            status: roundStatusFor(startBlock, block),
            countdown: roundCountdownFor(startBlock, block),
          };
        })
        .filter((row) => row.status !== "settled"),
    [rows, activeStartBlock, block],
  );

  return (
    <div className="border-t border-line">
      {withHeader && (
        <div className="flex items-center justify-between px-3 pt-3">
          <span className="text-[14px] font-semibold text-white">我的持仓</span>
        </div>
      )}

      <div className="px-3 pb-3 pt-2.5">
        <div className={cn(COLUMNS, "border-b border-line pb-1.5 text-[12px] text-muted2")}>
          <span>市场</span>
          <span className="text-right">金额</span>
          <span className="text-right">状态</span>
        </div>

        {loading && rows.length === 0 && (
          <div className="space-y-1 pt-1.5">
            {[0, 1, 2].map((item) => (
              <div key={item} className="skeleton h-5 rounded" />
            ))}
          </div>
        )}

        {!loading && holdings.length === 0 && (
          <div className="mt-1.5 flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-6">
            <BarChart3 className="h-4 w-4 text-muted2" />
            <p className="text-[10.5px] text-muted">暂无持仓</p>
            <p className="text-[8.5px] text-muted2">开仓后会显示在这里</p>
          </div>
        )}

        {holdings.map((row) => (
          <div
            key={row.id}
            role="button"
            tabIndex={0}
            onClick={() => openMarket(row.marketSymbol, row.betTokenSymbol)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openMarket(row.marketSymbol, row.betTokenSymbol);
              }
            }}
            title={`查看 ${row.marketSymbol}/${row.betTokenSymbol} 市场`}
            className={cn(
              COLUMNS,
              "-mx-3 cursor-pointer border-b border-line/40 px-3 py-2 text-[14px] transition last:border-b-0 hover:bg-white/[0.07] focus-visible:bg-white/[0.07] focus-visible:outline-none",
            )}
          >
            <span className="truncate font-medium text-white">
              {row.marketSymbol}/{row.betTokenSymbol}
            </span>
            <span className="num truncate text-right text-white">
              {fmtQty(row.amount, row.amount >= 100 ? 0 : 2)}
            </span>
            <span
              className="truncate text-right text-[14px]"
              title={`剩 ${row.countdown} 个区块 · ${STATUS_LABEL[row.status]}`}
            >
              <span className="num mr-1.5 text-muted2">{row.countdown}</span>
              <span className={STATUS_TONE[row.status]}>
                {STATUS_LABEL[row.status]}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
