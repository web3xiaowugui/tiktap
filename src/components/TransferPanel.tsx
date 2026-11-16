import { useState } from "react";
import { ChevronDown, CircleDollarSign, Send } from "lucide-react";
import { getProfile } from "@/api";
import { YourPositions } from "@/components/YourPositions";
import { useToast } from "@/context/ToastContext";
import { cn } from "@/lib/cn";
import { fmtUsd } from "@/lib/format";
import { useApi } from "@/lib/useApi";

export function TransferPanel() {
  const { data: profile } = useApi(() => getProfile("end837"), []);
  const { push } = useToast();
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");

  const cash = profile?.cash ?? 0;
  const value = Number(amount) || 0;
  const tooMuch = value > cash;
  const disabled = value <= 0 || tooMuch;

  const handleAmount = (raw: string) => {
    const cleaned = raw.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
    setAmount(cleaned);
  };

  const submit = () => {
    if (disabled) return;
    push(`演示环境：${fmtUsd(value)} 的转账未提交`, "success");
  };

  return (
    <aside className="hidden w-[300px] shrink-0 flex-col overflow-y-auto border-l border-line bg-[#0b0b0e] xl:flex 2xl:w-[320px]">
      <div className="p-3">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-white">转账</span>
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-[#5eead4] to-[#4c1d95] text-[8px] font-bold text-white">
            e
          </span>
        </div>

        <div className="mt-3 rounded-lg border border-line bg-panel px-3 py-3">
          <div className="flex items-center gap-1">
            <span className="text-[22px] font-light text-muted2">$</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => handleAmount(event.target.value)}
              placeholder="0"
              className="num min-w-0 flex-1 bg-transparent text-[24px] font-medium leading-[36px] text-white outline-none placeholder:text-muted2"
              aria-label="转账金额"
            />
            <button
              type="button"
              onClick={() => setAmount(cash ? String(cash) : "")}
              className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[8.5px] text-muted transition hover:border-line2 hover:text-white"
            >
              最大
            </button>
          </div>

          <div className="mt-1 flex items-center justify-between border-t border-line pt-2">
            <button
              type="button"
              className="flex items-center gap-1.5 text-[10px] text-white transition hover:text-white"
            >
              <CircleDollarSign className="h-3.5 w-3.5 text-up" />
              现金
              <ChevronDown className="h-3 w-3 text-muted2" />
            </button>
            <span className="num text-[9.5px] text-muted2">可用 {fmtUsd(cash)}</span>
          </div>
        </div>

        {tooMuch && <p className="mt-1.5 text-[9px] text-down">金额超过可用余额</p>}

        <div className="mt-2.5 rounded-lg border border-line bg-panel px-3 py-2.5">
          <textarea
            value={memo}
            maxLength={200}
            onChange={(event) => setMemo(event.target.value)}
            placeholder="添加备注"
            rows={3}
            className="w-full resize-none bg-transparent text-[10.5px] leading-relaxed text-white outline-none placeholder:text-muted2"
          />
          <div className="text-right text-[8.5px] text-muted2">{memo.length}/200</div>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={disabled}
          className={cn(
            "mt-2.5 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-semibold transition",
            disabled
              ? "cursor-not-allowed bg-panel3 text-muted2"
              : "bg-brand text-white hover:bg-brand/90",
          )}
        >
          <Send className="h-3.5 w-3.5" />
          转账
        </button>

        <div className="mt-2 flex items-center justify-between text-[9px] text-muted2">
          <span>网络</span>
          <span>TikTap 内部 · 即时到账</span>
        </div>
      </div>

      <YourPositions />
    </aside>
  );
}
