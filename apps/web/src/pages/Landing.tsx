import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUpRight, ChevronRight, Globe2 } from "lucide-react";
import { getTokens } from "@/api";
import type { Token } from "@/api/types";
import { AuthModal } from "@/components/AuthModal";
import { Logo } from "@/components/Logo";
import { TokenIcon } from "@/components/TokenIcon";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { cn } from "@/lib/cn";
import { fmtPct, fmtPrice } from "@/lib/format";
import { useApi } from "@/lib/useApi";

const PREVIEW_TOKENS = ["BTC", "ETH", "SOL", "HYPE"];

export default function Landing() {
  const navigate = useNavigate();
  const { user, finishXLogin } = useAuth();
  const { push } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [authOpen, setAuthOpen] = useState(searchParams.get("login") === "1");
  const { data: tokens } = useApi(getTokens, []);

  /**
   * X 授权回跳：地址栏带 ?x_ticket=... 时换资料 → 建/复用托管账户 → 进发现页。
   * 授权失败则带 ?x_error=...，提示一下就好。
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ticket = params.get("x_ticket");
    const reason = params.get("x_error");

    if (reason) {
      push(`X 授权没有完成：${reason}`, "error");
      return;
    }
    if (!ticket) return;

    let alive = true;
    void finishXLogin(ticket)
      .then(() => {
        if (alive) navigate("/discover", { replace: true });
      })
      .catch((caught: unknown) => {
        if (alive) {
          push(caught instanceof Error ? caught.message : "X 登录失败，请重试", "error");
        }
      });

    return () => {
      alive = false;
    };
  }, [finishXLogin, navigate, push]);

  const openAuth = () => setAuthOpen(true);

  const closeAuth = () => {
    setAuthOpen(false);
    if (searchParams.get("login")) {
      const next = new URLSearchParams(searchParams);
      next.delete("login");
      setSearchParams(next, { replace: true });
    }
  };

  const start = () => {
    if (user) navigate("/discover");
    else openAuth();
  };

  return (
    <div className="min-h-dvh overflow-x-hidden bg-ink text-white">
      <LandingNav
        onLogin={openAuth}
        onStart={start}
        onToast={push}
      />

      <Hero onStart={start} onDownload={() => push("演示项目仅包含网页版，移动端未包含")} />
      <ProductSection onStart={start} tokens={tokens ?? []} />
      <SocialProof onStart={start} />

      <Footer onToast={push} />

      <AuthModal open={authOpen} onClose={closeAuth} redirectTo="/discover" />
    </div>
  );
}

function LandingNav({
  onLogin,
  onStart,
  onToast,
}: {
  onLogin: () => void;
  onStart: () => void;
  onToast: (message: string) => void;
}) {
  const { user, finishXLogin } = useAuth();

  return (
    <header className="absolute inset-x-0 top-0 z-40">
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-8 px-5 sm:px-8">
        <button type="button" onClick={onStart} className="flex shrink-0 items-center" aria-label="TikTap">
          <Logo size="md" className="text-[24px]" />
        </button>

        <nav className="hidden items-center gap-6 text-[11.5px] text-white/55 lg:flex">
          {["博客", "学习", "解答", "价格"].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                if (item === "学习") {
                  document.getElementById("product")?.scrollIntoView({ behavior: "smooth" });
                } else {
                  onToast(`演示项目暂未包含「${item}」页面`);
                }
              }}
              className="transition hover:text-white"
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">

          {user ? (
            <button
              type="button"
              onClick={onStart}
              className="flex h-8 items-center gap-1.5 rounded-md bg-white px-3 text-[11px] font-medium text-black transition hover:bg-white/90"
            >
              进入应用
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onLogin}
              className="h-8 rounded-md border border-line2 bg-white/[0.04] px-4 text-[11px] text-white/85 backdrop-blur transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
            >
              登录
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function Hero({
  onStart,
  onDownload,
}: {
  onStart: () => void;
  onDownload: () => void;
}) {
  return (
    <section className="relative isolate min-h-[880px] overflow-hidden pt-[132px]">
      <StarField />

      <div
        className="pointer-events-none absolute -right-[30%] -top-[44%] h-[1300px] w-[1300px] rounded-full"
        style={{
          background:
            "radial-gradient(circle at 32% 54%, #d3ecff 0%, #8ac8fa 5%, #4a93dc 14%, #2367b4 28%, #0e3568 50%, #04101f 74%)",
          border: "2px solid rgba(170,225,255,0.24)",
          boxShadow:
            "0 0 80px 12px rgba(80,165,255,0.2), 0 0 150px 24px rgba(70,150,255,0.12), inset -220px -160px 300px rgba(0,0,0,0.9), inset 60px 40px 120px rgba(180,225,255,0.16)",
        }}
      />
      <div
        className="pointer-events-none absolute -right-[30%] -top-[44%] h-[1300px] w-[1300px] rounded-full opacity-80"
        style={{
          background:
            "radial-gradient(ellipse at 32% 48%, rgba(255,255,255,0.34) 0%, transparent 15%), radial-gradient(ellipse at 44% 58%, rgba(255,255,255,0.2) 0%, transparent 12%), radial-gradient(ellipse at 55% 66%, rgba(255,255,255,0.13) 0%, transparent 18%), radial-gradient(ellipse at 24% 40%, rgba(255,255,255,0.14) 0%, transparent 10%)",
          filter: "blur(18px)",
          mixBlendMode: "screen",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#08080a_2%,rgba(8,8,10,0.88)_30%,rgba(8,8,10,0.25)_62%,transparent_82%)]" />

      <div className="relative z-10 mx-auto flex max-w-[1100px] flex-col items-center px-5 text-center">
        <span
          className="select-none text-[clamp(80px,9vw,132px)] font-extrabold leading-none tracking-[-0.065em] text-white"
          style={{ textShadow: "0 0 80px rgba(120,100,255,0.28)" }}
        >
          TikTap
        </span>

        <h1 className="text-balance mt-1 text-[clamp(22px,2.4vw,32px)] font-semibold tracking-tight text-white">
          每一位交易者都是传奇的开始
        </h1>
        <p className="mt-2.5 max-w-[520px] text-balance text-[12.5px] leading-relaxed text-white/50">
          从迷因币到热门代币，几秒内即可交易任意加密货币。
        </p>

        <div className="mt-7 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onStart}
            className="group relative h-10 overflow-hidden rounded-md bg-brand px-7 text-[12px] font-medium text-white shadow-[0_12px_40px_rgba(111,92,245,0.35)] transition hover:bg-brand/90"
          >
            <span className="relative z-10">开始交易</span>
            <span className="absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.25),transparent)] opacity-0 transition group-hover:opacity-100" />
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="h-10 rounded-md border border-white/15 bg-white/[0.04] px-7 text-[12px] text-white/75 backdrop-blur transition hover:border-white/30 hover:bg-white/[0.08] hover:text-white"
          >
            下载应用
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 text-[9px] text-white/30">
          <span className="h-1 w-1 rounded-full bg-up" />
          网页版已上线 · 无需下载
        </div>
      </div>

      <Satellite />
      <Astronaut />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-ink via-ink/80 to-transparent" />
    </section>
  );
}

function StarField() {
  const stars = useMemo(() => {
    let seed = 20261104;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    return Array.from({ length: 130 }, (_, index) => ({
      id: index,
      left: random() * 100,
      top: random() * 100,
      size: 0.7 + random() * 1.7,
      opacity: 0.15 + random() * 0.6,
      delay: random() * 5,
    }));
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0">
      {stars.map((star) => (
        <span
          key={star.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
            animationDelay: `${star.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function Astronaut() {
  return (
    <div className="pointer-events-none absolute bottom-2 left-1/2 z-[5] w-[300px] -translate-x-1/2 sm:w-[360px]">
      <div className="animate-float">
        <svg viewBox="0 0 320 300" fill="none" className="h-auto w-full drop-shadow-[0_40px_60px_rgba(0,0,0,0.55)]">
          <defs>
            <linearGradient id="suit" x1="120" y1="100" x2="230" y2="240" gradientUnits="userSpaceOnUse">
              <stop stopColor="#ffffff" />
              <stop offset="0.55" stopColor="#e2e7f1" />
              <stop offset="1" stopColor="#b9c2d4" />
            </linearGradient>
            <linearGradient id="suitSoft" x1="140" y1="140" x2="200" y2="240" gradientUnits="userSpaceOnUse">
              <stop stopColor="#f4f6fb" />
              <stop offset="1" stopColor="#c8d0e0" />
            </linearGradient>
            <linearGradient id="visor" x1="130" y1="60" x2="200" y2="115" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0a1730" />
              <stop offset="0.5" stopColor="#1d4a80" />
              <stop offset="1" stopColor="#63a9e8" />
            </linearGradient>
            <radialGradient id="groundShadow" cx="0.5" cy="0.5" r="0.5">
              <stop stopColor="#000000" stopOpacity="0.55" />
              <stop offset="1" stopColor="#000000" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="helmetSheen" cx="0.35" cy="0.25" r="0.8">
              <stop stopColor="#ffffff" />
              <stop offset="0.7" stopColor="#d7deeb" />
              <stop offset="1" stopColor="#aab4c8" />
            </radialGradient>
          </defs>

          <ellipse cx="160" cy="283" rx="98" ry="14" fill="url(#groundShadow)" />

          <g transform="rotate(-7 160 150)">
            <rect x="104" y="92" width="112" height="122" rx="26" fill="#232b3a" />
            <rect x="112" y="100" width="96" height="42" rx="12" fill="#2e384a" />
            <rect x="118" y="146" width="84" height="54" rx="10" fill="#1b2230" />

            <path
              d="M126 138c-18 10-32 28-38 48-3 9 8 15 14 7 10-14 20-25 32-32"
              fill="url(#suitSoft)"
              stroke="#9aa5ba"
              strokeWidth="2"
            />
            <path
              d="M194 138c18 10 32 28 38 48 3 9-8 15-14 7-10-14-20-25-32-32"
              fill="url(#suitSoft)"
              stroke="#9aa5ba"
              strokeWidth="2"
            />
            <circle cx="91" cy="196" r="13" fill="#dbe1ec" stroke="#98a3b8" strokeWidth="2" />
            <circle cx="229" cy="196" r="13" fill="#dbe1ec" stroke="#98a3b8" strokeWidth="2" />

            <path
              d="M132 196c-4 20-4 40 2 58 2 6 12 6 14 0 4-16 5-36 4-54"
              fill="url(#suit)"
              stroke="#9aa5ba"
              strokeWidth="2"
            />
            <path
              d="M188 196c4 20 4 40-2 58-2 6-12 6-14 0-4-16-5-36-4-54"
              fill="url(#suit)"
              stroke="#9aa5ba"
              strokeWidth="2"
            />
            <path d="M132 252c-2 8 2 14 10 14h8c5 0 7-5 6-10" fill="#59647a" />
            <path d="M188 252c2 8-2 14-10 14h-8c-5 0-7-5-6-10" fill="#59647a" />

            <rect x="116" y="104" width="88" height="108" rx="34" fill="url(#suit)" stroke="#9aa5ba" strokeWidth="2" />
            <rect x="146" y="146" width="38" height="30" rx="6" fill="#1a2230" stroke="#7c879c" strokeWidth="1.5" />
            <rect x="152" y="152" width="12" height="4" rx="2" fill="#2ebd85" />
            <rect x="152" y="160" width="20" height="3" rx="1.5" fill="#5d6a80" />
            <circle cx="178" cy="154" r="2.4" fill="#8f80ff" />
            <circle cx="178" cy="162" r="2.4" fill="#2ebd85" />

            <path
              d="M120 120c-6-18 8-34 22-38M200 120c6-18-8-34-22-38"
              stroke="#8e99ae"
              strokeWidth="2"
              strokeLinecap="round"
            />

            <circle cx="160" cy="82" r="45" fill="url(#helmetSheen)" stroke="#98a3b8" strokeWidth="2.5" />
            <ellipse cx="160" cy="84" rx="32" ry="27" fill="url(#visor)" stroke="#7d8ba2" strokeWidth="2" />
            <ellipse cx="148" cy="74" rx="11" ry="7" fill="#ffffff" opacity="0.22" transform="rotate(-24 148 74)" />
            <path d="M138 102c10 6 31 7 44-1" stroke="#7fc0ff" strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" />
            <rect x="146" y="118" width="28" height="7" rx="3.5" fill="#c9d1e0" stroke="#98a3b8" strokeWidth="1" />

            <path
              d="M204 100c22 8 34 24 38 44"
              stroke="#8e99ae"
              strokeWidth="2"
              strokeDasharray="3 4"
            />
            <circle cx="243" cy="146" r="4" fill="#8f80ff" />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Satellite() {
  return (
    <div className="pointer-events-none absolute right-[16%] top-[30%] z-[4] hidden w-[150px] opacity-70 md:block">
      <div className="animate-float-soft" style={{ animationDelay: "1.2s" }}>
        <svg viewBox="0 0 220 140" fill="none" className="h-auto w-full -rotate-12">
          <g opacity="0.9">
            <rect x="78" y="54" width="64" height="38" rx="6" fill="#c9cfdb" stroke="#7c879c" />
            <rect x="86" y="62" width="20" height="22" rx="2" fill="#2a3346" />
            <rect x="112" y="62" width="20" height="22" rx="2" fill="#2a3346" />
            <rect x="8" y="58" width="62" height="30" rx="2" fill="#173a76" stroke="#6a8cc9" />
            <rect x="150" y="58" width="62" height="30" rx="2" fill="#173a76" stroke="#6a8cc9" />
            {[20, 34, 48, 62].map((x) => (
              <line key={x} x1={x} y1="58" x2={x} y2="88" stroke="#3c67ad" strokeWidth="1" />
            ))}
            {[66, 78].map((y) => (
              <line key={y} x1="8" y1={y} x2="70" y2={y} stroke="#3c67ad" strokeWidth="1" />
            ))}
            {[162, 176, 190, 204].map((x) => (
              <line key={x} x1={x} y1="58" x2={x} y2="88" stroke="#3c67ad" strokeWidth="1" />
            ))}
            {[66, 78].map((y) => (
              <line key={`r-${y}`} x1="150" y1={y} x2="212" y2={y} stroke="#3c67ad" strokeWidth="1" />
            ))}
            <line x1="110" y1="54" x2="110" y2="30" stroke="#8b96aa" strokeWidth="2" />
            <circle cx="110" cy="24" r="8" fill="#dfe4ee" stroke="#8b96aa" />
            <path d="M96 54c8-10 20-14 28-14" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="1.5" />
          </g>
        </svg>
      </div>
    </div>
  );
}

function ProductSection({ onStart, tokens }: { onStart: () => void; tokens: Token[] }) {
  return (
    <section id="product" className="relative overflow-hidden px-5 py-24 sm:py-32">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-brand/[0.09] blur-[120px]" />

      <div className="relative mx-auto max-w-[1000px] text-center">
        <span className="text-[10px] font-medium tracking-[0.22em] text-brand2">网页版现已上线</span>
        <h2 className="text-balance mt-3 text-[clamp(30px,4vw,46px)] font-semibold leading-[1.12] tracking-tight text-white">
          随时随地交易。
          <br />
          时刻紧跟市场。
        </h2>
        <p className="mx-auto mt-4 max-w-[440px] text-[12.5px] leading-relaxed text-white/45">
          在手机上升仓，在电脑上平仓——一款应用全部搞定。实时行情、跟单动态与持仓管理，都在同一个界面里。
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[9.5px] text-white/35">
          <span className="flex items-center gap-1.5">
            <Globe2 className="h-3 w-3" /> 6 条链
          </span>
          <span className="h-3 w-px bg-white/10" />
          <span>0 门槛 · 无助记词</span>
          <span className="h-3 w-px bg-white/10" />
          <span>7 × 24 小时行情</span>
        </div>

        <AppPreview tokens={tokens} />

        <button
          type="button"
          onClick={onStart}
          className="mt-7 inline-flex items-center gap-1 text-[11px] text-white/55 transition hover:text-white"
        >
          打开网页版终端
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
}

function AppPreview({ tokens }: { tokens: Token[] }) {
  const preview = PREVIEW_TOKENS.map((symbol) => tokens.find((token) => token.symbol === symbol)).filter(
    (token): token is Token => Boolean(token),
  );
  const btc = preview[0];

  if (!btc) {
    return <div className="mx-auto mt-11 h-[320px] w-full max-w-[900px] skeleton rounded-xl" />;
  }

  return (
    <div className="relative mx-auto mt-11 w-full max-w-[900px]">
      <div className="pointer-events-none absolute -inset-x-16 -top-6 h-24 bg-brand/15 blur-[70px]" />
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0d0d11] text-left shadow-[0_50px_150px_rgba(0,0,0,0.75)]">
        <div className="flex h-8 items-center gap-1.5 border-b border-line px-3">
          <span className="h-1.5 w-1.5 rounded-full bg-[#ff5f57]/80" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#febc2e]/80" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#28c840]/80" />
          <div className="mx-auto flex items-center gap-1 rounded bg-panel px-10 py-0.5 text-[7.5px] text-muted2">
            <span className="h-1.5 w-1.5 rounded-full bg-up/70" />
            tiktap.family/discover
          </div>
          <div className="w-10" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[155px_minmax(0,1fr)_170px]">
          <div className="hidden border-r border-line p-1.5 sm:block">
            <div className="flex gap-2 px-1 pb-1.5 text-[6.5px] text-muted2">
              <span className="text-white">代币</span>
              <span>永续</span>
              <span>排行</span>
            </div>
            {preview.map((token, index) => (
              <div
                key={token.symbol}
                className={cn(
                  "flex items-center gap-1.5 rounded px-1 py-[5px]",
                  index === 0 && "bg-panel2",
                )}
              >
                <TokenIcon icon={token.icon} size={15} />
                <div className="min-w-0 flex-1">
                  <div className="text-[7.5px] font-medium text-white">{token.symbol}</div>
                  <div className="text-[5.5px] text-muted2">${fmtPrice(token.price)}</div>
                </div>
                <span
                  className={cn(
                    "text-[6px]",
                    token.change24h >= 0 ? "text-up" : "text-down",
                  )}
                >
                  {fmtPct(token.change24h)}
                </span>
              </div>
            ))}
          </div>

          <div className="min-w-0 p-2">
            <div className="flex items-center gap-1.5">
              <TokenIcon icon={btc.icon} size={16} />
              <span className="text-[9px] font-semibold">BTC</span>
              <span className="text-[6px] text-muted2">Bitcoin</span>
              <span className="num ml-auto text-[9px] text-white">${fmtPrice(btc.price)}</span>
              <span className={cn("text-[6.5px]", btc.change24h >= 0 ? "text-up" : "text-down")}>
                {fmtPct(btc.change24h)}
              </span>
            </div>

            <div className="mt-1.5 flex gap-2 text-[6px] text-muted2">
              {["1分", "15分", "1小时", "4小时", "1天"].map((label, index) => (
                <span key={label} className={index === 2 ? "text-white" : ""}>
                  {label}
                </span>
              ))}
              <span className="ml-auto text-muted2">指标</span>
            </div>

            <svg viewBox="0 0 520 170" className="mt-1.5 h-[120px] w-full sm:h-[150px]" preserveAspectRatio="none">
              <defs>
                <linearGradient id="previewFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2ebd85" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#2ebd85" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[30, 70, 110, 150].map((y) => (
                <line key={y} x1="0" y1={y} x2="520" y2={y} stroke="#1e1e26" strokeDasharray="2 5" />
              ))}
              {[100, 200, 300, 400].map((x) => (
                <line key={x} x1={x} y1="0" x2={x} y2="170" stroke="#1e1e26" strokeDasharray="2 5" />
              ))}
              <path
                d="M0 128 C30 120 48 136 74 124 C98 113 112 126 138 110 C160 96 178 104 198 92 C226 75 242 88 268 76 C292 65 312 82 336 64 C360 47 380 60 406 50 C432 40 452 52 478 32 C494 20 508 26 520 20 L520 170 L0 170 Z"
                fill="url(#previewFill)"
              />
              <path
                d="M0 128 C30 120 48 136 74 124 C98 113 112 126 138 110 C160 96 178 104 198 92 C226 75 242 88 268 76 C292 65 312 82 336 64 C360 47 380 60 406 50 C432 40 452 52 478 32 C494 20 508 26 520 20"
                stroke="#2ebd85"
                strokeWidth="1.6"
                fill="none"
              />
              <line x1="0" y1="20" x2="520" y2="20" stroke="#2ebd85" strokeDasharray="4 4" strokeOpacity="0.5" />
            </svg>

            <div className="mt-1 flex items-center gap-3 text-[6px] text-muted2">
              <span>24小时交易量 <span className="text-white/60">$34.3亿</span></span>
              <span>未平仓量 <span className="text-white/60">$8.9亿</span></span>
              <span className="ml-auto hidden sm:inline">持有者 1,328</span>
            </div>
          </div>

          <div className="hidden border-l border-line p-2 sm:block">
            <div className="grid grid-cols-2 gap-0.5 rounded bg-panel2 p-0.5">
              <span className="rounded bg-up py-1 text-center text-[6.5px] font-medium text-[#04120c]">做多</span>
              <span className="py-1 text-center text-[6.5px] text-muted2">做空</span>
            </div>
            <div className="mt-2 text-[6px] text-muted2">市价</div>
            <div className="mt-1 flex items-baseline gap-0.5">
              <span className="text-[10px] text-muted2">$</span>
              <span className="text-[18px] font-medium text-white/90">0</span>
              <span className="ml-auto text-[6px] text-muted2">0 BTC</span>
            </div>
            <div className="mt-2 h-[3px] rounded-full bg-line">
              <div className="h-full w-0 rounded-full bg-up" />
            </div>
            <div className="mt-2 flex items-center justify-between text-[6px] text-muted2">
              <span>20x 杠杆</span>
              <span>全仓</span>
            </div>
            <div className="mt-2 rounded bg-panel3 py-1.5 text-center text-[7px] text-muted2">
              输入仓位规模
            </div>
            <div className="mt-2 border-t border-line pt-1.5 text-[6px] text-muted2">你的持仓</div>
            <div className="mt-1 rounded border border-dashed border-line py-4 text-center text-[6px] text-muted2">
              暂无持仓
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const ORBIT_AVATARS = [
  { name: "sats69", gradient: "linear-gradient(135deg,#c084fc,#4c1d95)", left: "15%", top: "30%", size: 38, delay: "0s" },
  { name: "Rowdy", gradient: "linear-gradient(135deg,#38bdf8,#1e3a8a)", left: "25%", top: "64%", size: 30, delay: "1.4s" },
  { name: "NORH7", gradient: "linear-gradient(135deg,#f97316,#7c2d12)", left: "33%", top: "22%", size: 24, delay: "0.8s" },
  { name: "end", gradient: "linear-gradient(135deg,#5eead4,#2563eb 55%,#4c1d95)", left: "50%", top: "73%", size: 26, delay: "2.1s" },
  { name: "Hodlz", gradient: "linear-gradient(135deg,#fb7185,#7f1d1d)", left: "72%", top: "26%", size: 36, delay: "0.4s" },
  { name: "Arkive", gradient: "linear-gradient(135deg,#f59e0b,#7c2d12)", left: "81%", top: "59%", size: 28, delay: "1.8s" },
];

function SocialProof({ onStart }: { onStart: () => void }) {
  return (
    <section className="relative overflow-hidden px-5 py-28 sm:py-36">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[980px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-dashed border-white/[0.06]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[380px] w-[660px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-dashed border-white/[0.07]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[240px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-dashed border-white/[0.08]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[300px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/[0.07] blur-[100px]" />

      {ORBIT_AVATARS.map((avatar) => (
        <div
          key={avatar.name}
          className="animate-float-soft absolute z-10 hidden -translate-x-1/2 -translate-y-1/2 sm:block"
          style={{ left: avatar.left, top: avatar.top, animationDelay: avatar.delay }}
        >
          <div
            className="flex items-center justify-center rounded-full font-bold text-white shadow-[0_10px_30px_rgba(0,0,0,0.45)] ring-1 ring-white/15"
            style={{
              width: avatar.size,
              height: avatar.size,
              background: avatar.gradient,
              fontSize: avatar.size * 0.38,
            }}
          >
            {avatar.name.slice(0, 1).toUpperCase()}
          </div>
        </div>
      ))}

      <div className="relative z-20 mx-auto max-w-[620px] text-center">
        <h2 className="text-balance text-[clamp(24px,3.2vw,34px)] font-semibold leading-[1.25] tracking-tight text-white">
          加入 2,500,000 名交易者，
          <br className="hidden sm:block" />
          在 TikTap 打响名号
        </h2>
        <p className="mx-auto mt-3 max-w-[430px] text-[12px] leading-relaxed text-white/45">
          关注顶级交易者，查看他们的实时仓位与盈亏，找到属于你的下一次机会。
        </p>
        <div className="mt-6 flex items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={onStart}
            className="h-10 rounded-md bg-brand px-7 text-[12px] font-medium text-white shadow-[0_12px_40px_rgba(111,92,245,0.3)] transition hover:bg-brand/90"
          >
            开始交易
          </button>
          <button
            type="button"
            onClick={() => document.getElementById("product")?.scrollIntoView({ behavior: "smooth" })}
            className="h-10 rounded-md border border-white/15 bg-white/[0.04] px-6 text-[12px] text-white/75 transition hover:border-white/30 hover:text-white"
          >
            了解网页版
          </button>
        </div>
      </div>
    </section>
  );
}

function Footer({ onToast }: { onToast: (message: string) => void }) {
  const columns = [
    {
      title: "关于我们",
      links: ["关于 TikTap", "博客", "版本更新", "常见问题", "推广合作", "加入我们", "品牌"],
    },
    {
      title: "社交媒体",
      links: ["Discord", "X / Twitter", "Instagram", "YouTube", "LinkedIn"],
    },
    {
      title: "法律信息",
      links: ["隐私政策", "服务条款", "风险披露"],
    },
  ];

  return (
    <footer className="border-t border-line bg-[#070709] px-5 pb-8 pt-14 sm:px-8">
      <div className="mx-auto max-w-[1200px]">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-[1.7fr_1fr_1fr_1fr]">
          <div className="col-span-2 md:col-span-1">
            <Logo size="md" className="text-[24px]" />
            <p className="mt-2.5 max-w-[230px] text-[10.5px] leading-relaxed text-white/35">
              每一位交易者都是传奇的开始
            </p>
            <p className="mt-5 text-[9px] text-white/25">© 2026 TikTap Labs Inc.</p>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <h3 className="text-[9px] font-medium uppercase tracking-[0.14em] text-white/35">
                {column.title}
              </h3>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link}>
                    <button
                      type="button"
                      onClick={() => onToast(`演示项目未包含「${link}」页面`)}
                      className="text-left text-[10px] text-white/55 transition hover:text-white"
                    >
                      {link}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-line pt-5 text-[8.5px] text-white/25 sm:flex-row sm:items-center sm:justify-between">
          <p>本页面为前端演示项目，与 TikTap Labs 无关联，不提供真实交易服务。</p>
          <p className="flex items-center gap-3">
            <span>简体中文</span>
            <span className="h-2.5 w-px bg-white/10" />
            <span>仅用于演示</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
