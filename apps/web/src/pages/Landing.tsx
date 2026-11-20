import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeftRight,
  ArrowUpRight,
  AtSign,
  ChevronDown,
  Coins,
  LogIn,
  MessageSquare,
  Star,
  Trophy,
} from "lucide-react";
import { AuthModal } from "@/components/AuthModal";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

export default function Landing() {
  const navigate = useNavigate();
  const { user, finishXLogin } = useAuth();
  const { push } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [authOpen, setAuthOpen] = useState(searchParams.get("login") === "1");

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
        // 登录态已写进 localStorage，这里直接整页跳，避免路由/状态时序问题
        window.location.replace("/discover");
      })
      .catch((caught: unknown) => {
        if (alive) {
          push(caught instanceof Error ? caught.message : "X 登录失败，请重试", "error");
        }
      });

    return () => {
      alive = false;
    };
  }, [finishXLogin, push]);

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
      />

      <Hero onStart={start} />
      <HowTo />
      <HackathonBanner />
      <SocialProof />

      <Footer onToast={push} />

      <AuthModal open={authOpen} onClose={closeAuth} redirectTo="/discover" />
    </div>
  );
}

function LandingNav({
  onLogin,
  onStart,
}: {
  onLogin: () => void;
  onStart: () => void;
}) {
  const { user, finishXLogin } = useAuth();

  return (
    <header className="absolute inset-x-0 top-0 z-40">
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-8 px-5 sm:px-8">
        <button type="button" onClick={onStart} className="flex shrink-0 items-center" aria-label="TikTap">
          <Logo size="md" className="text-[24px]" />
        </button>

        <div className="ml-auto flex items-center gap-2.5">

          {user ? (
            <button
              type="button"
              onClick={onStart}
              className="flex h-9 items-center gap-1.5 rounded-md bg-white px-4 text-[13px] font-medium text-black transition hover:bg-white/90"
            >
              进入应用
              <ArrowUpRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onLogin}
              className="h-9 rounded-md border border-line2 bg-white/[0.04] px-5 text-[13px] text-white/85 backdrop-blur transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
            >
              登录
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function Hero({ onStart }: { onStart: () => void }) {
  return (
    <section className="relative isolate min-h-[860px] overflow-hidden pt-[150px]">
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
          className="select-none text-center text-[clamp(32px,8.5vw,112px)] font-extrabold leading-none tracking-[-0.04em] text-white"
          style={{ textShadow: "0 0 80px rgba(120,100,255,0.28)" }}
        >
          Tik · Tap · Win.
        </span>
        <p className="mt-5 text-[clamp(15px,1.3vw,17px)] font-medium tracking-[0.04em] text-white/45">
          行情、下注、开奖，一条信息流搞定。
        </p>

        <div className="mt-8 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onStart}
            className="group relative h-11 overflow-hidden rounded-md bg-brand px-8 text-[14px] font-medium text-white shadow-[0_12px_40px_rgba(111,92,245,0.35)] transition hover:bg-brand/90"
          >
            <span className="relative z-10">开始交易</span>
            <span className="absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.25),transparent)] opacity-0 transition group-hover:opacity-100" />
          </button>
        </div>
        <p className="mt-3 text-[11px] text-white/30">不用钱包 · 领 1000 TEST 就能玩</p>
      </div>

      <Satellite />
      <Astronaut />

      <a
        href="#howto"
        className="absolute bottom-7 right-8 z-20 hidden flex-col items-center gap-1 text-[10px] tracking-[0.16em] text-white/30 transition hover:text-white/70 sm:flex"
      >
        六步上手
        <ChevronDown className="h-4 w-4 animate-bounce" />
      </a>

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


const GUIDE_STEPS = [
  {
    title: "登录即开户",
    body: "演示登录或 X 授权，后端立刻生成托管钱包并加密存库——不用助记词、不用装钱包插件。",
    icon: LogIn,
  },
  {
    title: "领测试币",
    body: "顶栏点「领测试币」，每次领 1000 TEST；链上到账后右上角余额自动刷新，直接能下注。",
    icon: Coins,
  },
  {
    title: "选市场下注",
    body: "发现页选标的物和轮次，买涨或买跌，链成功才记仓。",
    icon: ArrowLeftRight,
  },
  {
    title: "等开奖看收益",
    body: "每轮自动开奖、盈利自动领取；持仓、历史轮次和分代币盈亏都在个人主页能查到。",
    icon: Trophy,
  },
  {
    title: "发观点",
    body: "发布本轮观点，关注看好的交易者；「已关注」只筛你关注的人，排行榜也有已关注视图。",
    icon: MessageSquare,
  },
  {
    title: "收藏自选",
    body: "市场页点星标加入自选；自选按账号存在数据库里，换浏览器登录同一账号还在。",
    icon: Star,
  },
];

function HowTo() {
  return (
    <section id="howto" className="relative overflow-hidden border-t border-white/[0.06] px-5 py-24 sm:px-8">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[320px] w-[720px] -translate-x-1/2 rounded-full bg-brand/[0.07] blur-[120px]" />

      <div className="relative mx-auto max-w-[1000px]">
        <div className="text-center">
          <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-brand2">
            使用说明
          </span>
          <h2 className="mt-3 text-[clamp(28px,3.6vw,40px)] font-semibold tracking-tight text-white">
            六步上手 TikTap
          </h2>
          <p className="mx-auto mt-3 max-w-[500px] text-[14px] leading-relaxed text-white/45">
            全程跑在 X Layer 测试网，TEST币没有真实价值；不需要助记词，也不需要钱包插件。
          </p>
        </div>

        <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GUIDE_STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <li
                key={step.title}
                className="group relative rounded-xl border border-white/[0.08] bg-white/[0.03] p-5 transition hover:border-brand/35 hover:bg-white/[0.05]"
              >
                <span className="num absolute right-4 top-4 text-[10px] tracking-[0.16em] text-white/25">
                  0{index + 1}
                </span>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 ring-1 ring-brand/25">
                  <Icon className="h-4 w-4 text-brand2" />
                </div>
                <h3 className="mt-3.5 text-[15px] font-semibold text-white">{step.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/45">{step.body}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
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

function HackathonBanner() {
  return (
    <section className="px-5 pb-24 sm:px-8">
      <div className="relative mx-auto max-w-[1000px] overflow-hidden rounded-2xl border border-brand/30 bg-[linear-gradient(135deg,rgba(111,92,245,0.18),rgba(255,255,255,0.015))] p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand/25 blur-[80px]" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-[#38bdf8]/10 blur-[80px]" />

        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-[560px]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/35 bg-brand/10 px-3 py-1 text-[10.5px] font-semibold tracking-[0.14em] text-brand2">
              <Trophy className="h-3 w-3" />
              HACKATHON · TAPEOUT ACCELERATE
            </span>
            <h3 className="mt-3 text-[19px] font-semibold leading-snug text-white sm:text-[22px]">
              本项目正在参加 X Layer × TapeOut 黑客松
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-white/50">
              在 X Layer 上持有指定资产就能投票（最多 10 票，可投给多个项目）。觉得这个产品有意思，去投票页支持一下；也可以点开黑客松主页，看看这一季的其他作品。
            </p>
            <p className="mt-2 text-[11px] text-white/30">
              截止 2026/12/07 23:59 UTC · 投票需连接 X Layer 钱包
            </p>
          </div>

          <div className="flex shrink-0 flex-col gap-2.5 sm:items-end">
            <a
              href="https://web3.okx.com/zh-hans/xlayer/hackathon-voting"
              target="_blank"
              rel="noreferrer"
              className="group inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand px-6 text-[13.5px] font-semibold text-white shadow-[0_12px_40px_rgba(111,92,245,0.35)] transition hover:bg-brand/90"
            >
              为项目投票
              <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
            <a
              href="https://web3.okx.com/zh-hans/xlayer/build-x-series"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-6 text-[13px] text-white/75 transition hover:border-white/30 hover:bg-white/[0.07] hover:text-white"
            >
              查看黑客松
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function SocialProof() {
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
            }}
          />
        </div>
      ))}
    </section>
  );
}

const SOCIALS = [{ label: "X / Twitter", icon: AtSign }];

function Footer({ onToast }: { onToast: (message: string) => void }) {
  return (
    <footer className="border-t border-line bg-[#070709] px-5 py-14 sm:px-8">
      <div className="mx-auto flex max-w-[820px] flex-wrap items-center justify-center gap-3">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/35">
          社交媒体
        </h3>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {SOCIALS.map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => onToast(`演示项目未包含「${label}」页面`)}
              className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[12.5px] text-white/60 transition hover:border-white/25 hover:bg-white/[0.07] hover:text-white"
            >
              <Icon className="h-4 w-4 text-white/45 transition group-hover:text-white" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </footer>
  );
}
