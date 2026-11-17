import { useEffect, useState } from "react";
import { Coins, Loader2, X } from "lucide-react";
import { faucet } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { useBetToken } from "@/context/BetTokenContext";
import { useToast } from "@/context/ToastContext";
import { ENVIRONMENT_LABELS, readEnvironment } from "@/lib/environment";

const CLAIM_AMOUNT = 100;
const FAUCET_SYMBOL = "TEST";

/**
 * 顶栏「领测试币」：只发 TEST，不跟随当前下注代币。
 * 点开弹框展示本次可领数量，确认后调 /api/faucet，领完刷新余额。
 */
export function FaucetButton() {
  const { user } = useAuth();
  const { tokens, reloadBalances } = useBetToken();
  const { push } = useToast();

  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const symbol = FAUCET_SYMBOL;
  const balance = tokens.find((token) => token.symbol === FAUCET_SYMBOL)?.balance;
  const environment = readEnvironment();

  useEffect(() => {
    if (!open) return;
    setError(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, pending]);

  const claim = async () => {
    if (!user?.address || pending) return;
    setPending(true);
    setError(null);

    try {
      await faucet({
        address: user.address,
        betToken: symbol,
        amount: String(CLAIM_AMOUNT),
      });
      reloadBalances();
      push(`已领取 ${CLAIM_AMOUNT} ${symbol}`, "success");
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "领取失败，请重试");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-2 py-1 text-[11px] font-bold text-white transition hover:border-line2 hover:bg-panel2"
        title={`领取 ${CLAIM_AMOUNT} ${symbol}`}
      >
        <Coins className="h-3.5 w-3.5 text-white" />
        领测试币
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 px-4 backdrop-blur-[4px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) setOpen(false);
          }}
        >
          <div className="animate-scale-in relative w-full max-w-[360px] overflow-hidden rounded-2xl border border-line2 bg-[#101014] p-6 shadow-[0_40px_120px_rgba(0,0,0,0.75)]">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="absolute right-3.5 top-3.5 rounded-md p-1 text-muted2 transition hover:bg-panel2 hover:text-white disabled:opacity-40"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>

            <h2 className="text-[16px] font-semibold text-white">领取测试币</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              当前环境：<span className="text-white">{ENVIRONMENT_LABELS[environment]}</span>。
              {environment === "testnet"
                ? "领取记录写入同一个库的 testnet 环境。"
                : "领取记录写入同一个库的 dev 环境。"}
            </p>

            <div className="mt-5 rounded-xl border border-line bg-[#0a0a0c] px-4 py-5 text-center">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted2">
                本次领取
              </div>
              <div className="mt-1.5 flex items-baseline justify-center gap-1.5">
                <span className="num text-[30px] font-semibold leading-none text-white">
                  {CLAIM_AMOUNT}
                </span>
                <span className="text-[12px] font-semibold text-brand2">{symbol}</span>
              </div>
              {typeof balance === "number" && (
                <div className="mt-2 text-[10.5px] text-muted2">
                  当前余额 {balance.toLocaleString()} {symbol}
                </div>
              )}
            </div>

            {error && (
              <p role="alert" className="mt-3 text-[11px] leading-relaxed text-down">
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="h-10 flex-1 rounded-lg border border-line bg-panel text-[11.5px] text-muted2 transition hover:border-line2 hover:text-white disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={claim}
                disabled={pending || !user?.address}
                className="flex h-10 flex-[1.4] items-center justify-center gap-1.5 rounded-lg bg-white text-[11.5px] font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    领取中…
                  </>
                ) : (
                  <>确定领取</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
