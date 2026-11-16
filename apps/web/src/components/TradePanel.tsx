import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { faucet, getBetQuickAmounts, placeBet, saveBetQuickAmounts } from "@/api";
import { YourPositions } from "@/components/YourPositions";
import { useAuth } from "@/context/AuthContext";
import { useBetToken } from "@/context/BetTokenContext";
import { useToast } from "@/context/ToastContext";
import { cn } from "@/lib/cn";
import { useChainClock } from "@/lib/chainClock";
import { fmtQty, fmtUsd } from "@/lib/format";

export function TradePanel() {
  const { selected: selectedBetToken, reloadBalances } = useBetToken();
  const { push } = useToast();
  const { user } = useAuth();
  const clock = useChainClock();
  const [params] = useSearchParams();
  const symbol = (params.get("symbol") ?? "BTC").toUpperCase();

  const [pendingSide, setPendingSide] = useState<"long" | "short" | null>(null);
  const [funding, setFunding] = useState(false);

  const submitBet = async (side: "long" | "short") => {
    if (!selectedBetToken) return;
    if (!user?.address) {
      push("托管地址还没准备好，稍后再试", "error");
      return;
    }
    const raw = amount.trim();
    if (!raw || Number(raw) <= 0) {
      push("请输入下注数量", "error");
      return;
    }
    if (!clock.bettingOpen) {
      push("本轮已封盘，等下一轮再下注", "error");
      return;
    }

    setPendingSide(side);
    try {
      await placeBet({
        address: user.address,
        market: symbol,
        betToken: selectedBetToken.symbol,
        side,
        amount: raw,
      });
      push(`已下单：${side === "long" ? "Tap涨" : "Tap跌"} ${raw} ${selectedBetToken.symbol}`, "success");
      setAmount("");
      setPercent(0);
      reloadBalances();
      // 让发现页的活动列表立刻拉一次（市场级活动流）
      window.dispatchEvent(new Event("tiktap:activity-refresh"));
      clock.refresh();
    } catch (error) {
      push(error instanceof Error ? error.message : "下注失败", "error");
    } finally {
      setPendingSide(null);
    }
  };

  const requestTokens = async () => {
    if (!selectedBetToken || !user?.address) return;
    setFunding(true);
    try {
      await faucet({ address: user.address, betToken: selectedBetToken.symbol, amount: "100" });
      push(`已领取 100 ${selectedBetToken.symbol}`, "success");
      reloadBalances();
    } catch (error) {
      push(error instanceof Error ? error.message : "领取失败", "error");
    } finally {
      setFunding(false);
    }
  };

  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState(0);
  const [quickAmounts, setQuickAmounts] = useState<number[]>([]);
  const [quickAmountsLoading, setQuickAmountsLoading] = useState(true);
  const [quickAmountsError, setQuickAmountsError] = useState<string | null>(null);
  const [quickReload, setQuickReload] = useState(0);
  const [editingQuickAmounts, setEditingQuickAmounts] = useState(false);
  const [quickAmountDrafts, setQuickAmountDrafts] = useState<string[]>([]);
  const [savingQuickAmounts, setSavingQuickAmounts] = useState(false);

  const value = Number(amount) || 0;
  const selectedBetTokenSymbol = selectedBetToken?.symbol;
  const selectedBetTokenPrice = selectedBetToken?.priceUsd ?? 0;
  const selectedBetTokenBalance = selectedBetToken?.balance ?? 0;

  useEffect(() => {
    setAmount("");
    setPercent(0);
  }, [selectedBetTokenSymbol]);

  useEffect(() => {
    if (!selectedBetTokenSymbol) return;

    let alive = true;
    setQuickAmountsLoading(true);
    setQuickAmountsError(null);
    setQuickAmounts([]);
    setEditingQuickAmounts(false);
    setQuickAmountDrafts([]);

    getBetQuickAmounts(selectedBetTokenSymbol)
      .then((next) => {
        if (!alive) return;
        setQuickAmounts(next);
        setQuickAmountsLoading(false);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setQuickAmountsError(error instanceof Error ? error.message : "快捷金额加载失败");
        setQuickAmountsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [selectedBetTokenSymbol, quickReload]);

  const handleAmount = (raw: string) => {
    const cleaned = raw.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
    setAmount(cleaned);
    setPercent(
      selectedBetTokenBalance > 0
        ? Math.min(100, (Number(cleaned) / selectedBetTokenBalance) * 100)
        : 0,
    );
  };

  const handlePercent = (next: number) => {
    setPercent(next);
    setAmount(
      next === 0
        ? ""
        : ((next / 100) * selectedBetTokenBalance).toFixed(4),
    );
  };

  const startEditingQuickAmounts = () => {
    if (quickAmounts.length !== 5 || savingQuickAmounts) return;
    setQuickAmountDrafts(quickAmounts.map((quickAmount) => String(quickAmount)));
    setEditingQuickAmounts(true);
  };

  const updateQuickAmountDraft = (index: number, raw: string) => {
    const cleaned = raw.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
    setQuickAmountDrafts((current) => {
      const next = [...current];
      next[index] = cleaned;
      return next;
    });
  };

  const saveQuickAmounts = async () => {
    if (!selectedBetToken || savingQuickAmounts) return;

    const next = quickAmountDrafts.map(Number);
    if (
      quickAmountDrafts.length !== 5 ||
      next.some((quickAmount) => !Number.isFinite(quickAmount) || quickAmount <= 0)
    ) {
      push("请填写 5 个大于 0 的金额", "error");
      return;
    }

    setSavingQuickAmounts(true);
    try {
      const saved = await saveBetQuickAmounts(selectedBetToken.symbol, next);
      setQuickAmounts(saved);
      setEditingQuickAmounts(false);
      push("快捷金额已保存", "success");
    } catch (error) {
      push(error instanceof Error ? error.message : "快捷金额保存失败", "error");
    } finally {
      setSavingQuickAmounts(false);
    }
  };

  return (
    <aside className="hidden w-[300px] shrink-0 flex-col overflow-y-auto border-l border-line bg-[#0b0b0e] xl:flex 2xl:w-[320px]">
      <div className="p-3">
        <div className="mt-2 flex items-center justify-between text-[12px] text-muted2">
          <span>可用</span>
          <span className="flex items-center gap-2">
            <span className="num">
              {selectedBetToken
                ? `${fmtQty(selectedBetToken.balance)} ${selectedBetToken.symbol}`
                : "—"}
            </span>
            <button
              type="button"
              onClick={() => void requestTokens()}
              disabled={funding || !user?.address}
              title={`领 100 ${selectedBetToken?.symbol ?? "代币"}`}
              className="rounded border border-line px-1.5 py-0.5 text-[11px] font-bold text-muted2 transition hover:border-line2 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {funding ? "领取中…" : "领币"}
            </button>
          </span>
        </div>

        <div className="mt-1 flex items-center gap-2">
          <span className="shrink-0 text-[13px] font-semibold text-muted2">
            {selectedBetToken?.symbol ?? "—"}
          </span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => handleAmount(event.target.value)}
            placeholder="0"
            className="num min-w-0 flex-1 bg-transparent text-[28px] font-medium leading-[40px] tracking-[0.02em] text-white outline-none placeholder:text-muted2"
            aria-label={`下注数量（${selectedBetToken?.symbol ?? "代币"}）`}
          />
          <div className="shrink-0 text-right">
            <div className="text-[12px] text-muted2">
              ≈ {fmtUsd(value * selectedBetTokenPrice)}
            </div>
          </div>
        </div>

        <div className="mt-2">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={percent}
            onChange={(event) => handlePercent(Number(event.target.value))}
            className="fomo-range"
            style={{
              background: `linear-gradient(to right, #6f5cf5 ${percent}%, #26262f ${percent}%)`,
            }}
            aria-label="仓位比例"
          />
          <div className="mt-1 flex justify-between text-[10px] font-bold text-muted2">
            {[0, 25, 50, 75, 100].map((tick) => (
              <button
                key={tick}
                type="button"
                onClick={() => handlePercent(tick)}
                className="transition hover:text-white"
              >
                {tick === 0 ? "0" : `${tick}%`}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-muted2">快捷金额</span>
            <button
              type="button"
              onClick={() => {
                if (editingQuickAmounts) {
                  void saveQuickAmounts();
                } else {
                  startEditingQuickAmounts();
                }
              }}
              disabled={
                savingQuickAmounts ||
                quickAmountsLoading ||
                (!editingQuickAmounts && quickAmounts.length !== 5)
              }
              className="text-[12px] font-bold text-muted2 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {savingQuickAmounts ? "保存中…" : editingQuickAmounts ? "完成" : "编辑"}
            </button>
          </div>
          <div className="mt-1 grid grid-cols-5 gap-1">
            {quickAmountsLoading ? (
              [0, 1, 2, 3, 4].map((item) => (
                <div key={item} className="skeleton h-8 rounded-md" />
              ))
            ) : quickAmountsError ? (
              <button
                type="button"
                onClick={() => setQuickReload((tick) => tick + 1)}
                className="col-span-5 h-8 rounded-md border border-line bg-[#121217] text-[11px] font-bold text-muted2 transition hover:text-white"
              >
                快捷金额加载失败，点击重试
              </button>
            ) : editingQuickAmounts ? (
              quickAmountDrafts.map((draft, index) => (
                <input
                  key={index}
                  inputMode="decimal"
                  value={draft}
                  onChange={(event) => updateQuickAmountDraft(index, event.target.value)}
                  disabled={savingQuickAmounts}
                  aria-label={`快捷金额 ${index + 1}`}
                  className="num h-8 min-w-0 rounded-md border border-line2 bg-[#17171f] px-1 text-center text-[12px] font-bold text-white outline-none transition focus:border-brand disabled:opacity-60"
                />
              ))
            ) : quickAmounts.length === 0 ? (
              <span className="col-span-5 text-center text-[11px] text-muted2">
                暂无快捷金额
              </span>
            ) : (
              quickAmounts.map((quickAmount, index) => {
                const active = value === quickAmount;
                return (
                  <button
                    key={`quick-${index}`}
                    type="button"
                    onClick={() => handleAmount(String(quickAmount))}
                    className={cn(
                      "h-8 rounded-md border text-[12px] font-bold transition",
                      active
                        ? "border-brand/60 bg-brand/10 text-white"
                        : "border-line bg-[#121217] text-muted hover:border-line2 hover:text-white",
                    )}
                  >
                    {fmtQty(quickAmount, Number.isInteger(quickAmount) ? 0 : 2)}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void submitBet("long")}
            disabled={pendingSide !== null || !clock.bettingOpen}
            className="h-9 rounded-md bg-up text-[14px] font-bold text-white shadow-[0_0_18px_rgba(46,189,133,0.18)] transition hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendingSide === "long" ? "提交中…" : "Tap涨"}
          </button>
          <button
            type="button"
            onClick={() => void submitBet("short")}
            disabled={pendingSide !== null || !clock.bettingOpen}
            className="h-9 rounded-md bg-down text-[14px] font-bold text-white shadow-[0_0_18px_rgba(246,70,93,0.18)] transition hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendingSide === "short" ? "提交中…" : "Tap跌"}
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between text-[12px] text-muted2">
          <span>{clock.bettingOpen ? `距封盘 ${clock.blocksToClose} 块` : "本轮已封盘"}</span>
          <span className="num">手续费 0</span>
        </div>
      </div>

      <YourPositions />
    </aside>
  );
}
