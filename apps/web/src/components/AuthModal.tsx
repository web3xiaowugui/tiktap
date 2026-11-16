import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, Loader2, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/cn";

/** X（原 Twitter）标志，官方 path。 */
function XMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

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
  const { connectX, signInDemo } = useAuth();
  const [pending, setPending] = useState<"x" | "demo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handle, setHandle] = useState("");

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
    if (open) setError(null);
  }, [open]);

  if (!open) return null;

  const handleX = async () => {
    if (pending) return;
    setError(null);
    setPending("x");

    try {
      await connectX(handle.trim());
      onClose();
      navigate(redirectTo);
    } catch {
      setError("X 账号登录失败，请重试。");
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
            使用 X 账号登录
          </h1>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            登录后自动为你创建一个托管账户，下注由后端代为签名，不需要安装钱包。
          </p>

          <div className="mt-5">
            <div className="flex h-10 items-center gap-1.5 rounded-lg border border-line2 bg-[#0a0a0c] px-3 text-[12px] transition focus-within:border-brand/60">
              <span className="shrink-0 text-muted2">@</span>
              <input
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleX();
                }}
                placeholder="你的 X 用户名（可选）"
                autoComplete="off"
                spellCheck={false}
                maxLength={20}
                disabled={Boolean(pending)}
                className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-muted2 disabled:opacity-60"
              />
            </div>

            <button
              type="button"
              onClick={handleX}
              disabled={Boolean(pending)}
              className={cn(
                "mt-2 flex h-[46px] w-full items-center justify-center gap-2 rounded-lg bg-white text-[12.5px] font-semibold text-black transition hover:bg-white/90",
                "disabled:cursor-not-allowed disabled:opacity-65",
              )}
            >
              {pending === "x" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在登录…
                </>
              ) : (
                <>
                  <XMark className="h-4 w-4" />
                  使用 X 账号登录
                </>
              )}
            </button>
          </div>

          {error && (
            <p role="alert" className="mt-3 text-[11px] leading-relaxed text-down">
              {error}
            </p>
          )}

          <div className="my-5 flex items-center gap-3 text-[9.5px] text-muted2">
            <span className="h-px flex-1 bg-line" />
            或
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
                直接进入演示模式
                <ArrowUpRight className="h-3.5 w-3.5 text-muted2 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white" />
              </>
            )}
          </button>

          <p className="mt-5 text-[9.5px] leading-relaxed text-muted2">
            演示环境：X 登录不接入真实 OAuth，只用来生成账号标识；托管账户由后端创建并保管私钥，登录状态仅保存在本地。
          </p>
        </div>
      </div>
    </div>
  );
}
