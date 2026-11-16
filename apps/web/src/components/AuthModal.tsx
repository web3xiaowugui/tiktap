import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { OkxMark } from "@/components/BrandMarks";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/cn";
import {
  isOkxWalletInstalled,
  WalletConnectError,
} from "@/lib/okxWallet";

const OKX_INSTALL_URL =
  "https://chromewebstore.google.com/detail/%E6%AC%A7%E6%98%93-web3-%E9%92%B1%E5%8C%85/mcohilncbfahbmgdjkbpemcciiolgcge";

export function AuthModal({
  open,
  onClose,
  redirectTo = "/discover",
}: {
  open: boolean;
  onClose: () => void;
  redirectTo?: string;
}) {
  const navigate = useNavigate();
  const { connectOkx, signInDemo } = useAuth();
  const [pending, setPending] = useState<"okx" | "demo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, pending, onClose]);

  useEffect(() => {
    if (!open) return;
    setError(null);

    const refresh = () => {
      setInstalled(isOkxWalletInstalled());
      setChecked(true);
    };

    refresh();
    const timer = window.setTimeout(refresh, 300);
    window.addEventListener("focus", refresh);
    window.addEventListener("eip6963:announceProvider", refresh);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("eip6963:announceProvider", refresh);
    };
  }, [open]);

  if (!open) return null;

  const handleOkx = async () => {
    if (!installed || pending) return;
    setError(null);
    setPending("okx");

    try {
      await connectOkx();
      onClose();
      navigate(redirectTo);
    } catch (caught) {
      if (caught instanceof WalletConnectError) {
        setError(caught.message);
        if (caught.code === "not-installed") {
          setInstalled(false);
          setChecked(true);
        }
      } else {
        setError("连接 OKX Wallet 失败，请重试。");
      }
    } finally {
      setPending(null);
    }
  };

  const handleDemo = async () => {
    if (pending) return;
    setError(null);
    setPending("demo");

    try {
      await signInDemo();
      onClose();
      navigate(redirectTo);
    } catch {
      setError("进入演示模式失败，请重试。");
    } finally {
      setPending(null);
    }
  };

  const handleRecheck = () => {
    const next = isOkxWalletInstalled();
    setInstalled(next);
    setChecked(true);
    setError(
      next ? null : "仍未检测到 OKX Wallet。安装后请刷新页面再试。",
    );
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 px-4 backdrop-blur-[4px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div className="animate-scale-in relative w-full max-w-[420px] overflow-hidden rounded-2xl border border-line2 bg-[#101014] p-7 shadow-[0_40px_120px_rgba(0,0,0,0.75)]">
        <div
          className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full opacity-60 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(111,92,245,0.55), transparent 68%)",
          }}
        />

        <button
          type="button"
          onClick={onClose}
          disabled={Boolean(pending)}
          className="absolute right-4 top-4 rounded-md p-1 text-muted2 transition hover:bg-panel2 hover:text-white disabled:opacity-40"
          aria-label="关闭登录窗口"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative">
          <div className="flex items-center gap-2">
            <Logo size="lg" className="text-[34px]" />
            <span className="mt-2 rounded border border-brand/40 bg-brand/10 px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-brand2">
              web
            </span>
          </div>

          <h1 className="mt-6 text-[22px] font-semibold tracking-tight text-white">
            连接钱包
          </h1>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            使用浏览器插件钱包登录 TikTap。当前支持 OKX Wallet，连接后进入演示账户。
          </p>

          <div className="mt-6">
            {!checked ? (
              <div className="flex h-[68px] items-center justify-center gap-2 rounded-xl border border-line2 bg-[#0a0a0c] text-[11px] text-muted2">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在检测 OKX Wallet…
              </div>
            ) : installed ? (
              <button
                type="button"
                onClick={handleOkx}
                disabled={Boolean(pending)}
                className="group flex w-full items-center gap-3 rounded-xl border border-line2 bg-[#0a0a0c] px-3.5 py-3 text-left transition hover:border-[#f7931a]/45 hover:bg-panel2 disabled:cursor-not-allowed disabled:opacity-65"
              >
                <OkxMark className="h-10 w-10 shrink-0 text-[10px]" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-white">
                    OKX Wallet
                    {pending === "okx" && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#f7931a]" />
                    )}
                  </span>
                  <span className="mt-1 block text-[10px] text-muted2">
                    {pending === "okx"
                      ? "请在插件中确认连接…"
                      : "已检测到浏览器插件"}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-md px-2.5 py-1.5 text-[10.5px] font-medium",
                    pending
                      ? "bg-white/10 text-muted"
                      : "bg-white text-black",
                  )}
                >
                  {pending === "okx" ? "连接中" : "连接"}
                </span>
              </button>
            ) : (
              <a
                href={OKX_INSTALL_URL}
                target="_blank"
                rel="noreferrer"
                className="group flex w-full items-center gap-3 rounded-xl border border-line2 bg-[#0a0a0c] px-3.5 py-3 text-left transition hover:border-[#f7931a]/45 hover:bg-panel2"
              >
                <OkxMark className="h-10 w-10 shrink-0 text-[10px]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-white">
                    OKX Wallet
                  </span>
                  <span className="mt-1 block text-[10px] text-muted2">
                    未检测到插件，先安装
                  </span>
                </span>
                <ExternalLink className="h-4 w-4 text-muted2 transition group-hover:text-[#f7931a]" />
              </a>
            )}
          </div>

          {checked && !installed && (
            <div className="mt-2 flex items-center justify-between gap-2 text-[9.5px] text-muted2">
              <span>安装后需要刷新页面</span>
              <button
                type="button"
                onClick={handleRecheck}
                className="flex items-center gap-1 text-muted transition hover:text-white"
              >
                <RefreshCw className="h-3 w-3" />
                重新检测
              </button>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-3 text-[11px] leading-relaxed text-down">
              {error}
            </p>
          )}

          <div className="my-5 flex items-center gap-3 text-[9.5px] text-muted2">
            <span className="h-px flex-1 bg-line" />
            或者
            <span className="h-px flex-1 bg-line" />
          </div>

          <button
            type="button"
            onClick={handleDemo}
            disabled={Boolean(pending)}
            className="group flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-2.5 text-[11.5px] text-white transition hover:border-line2 hover:text-white disabled:opacity-60"
          >
            {pending === "demo" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                正在进入演示…
              </>
            ) : (
              <>
                没有插件？进入演示模式
                <ArrowUpRight className="h-3.5 w-3.5 text-muted2 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white" />
              </>
            )}
          </button>

          <p className="mt-5 text-[9.5px] leading-relaxed text-muted2">
            演示环境：连接钱包只读取公开地址，不会发起交易或请求资金。登录状态仅保存在本地。
          </p>
        </div>
      </div>
    </div>
  );
}
