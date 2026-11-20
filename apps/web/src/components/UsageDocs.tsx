import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/cn";

const DOCS_BASE = "/docs";

function Shot({
  src,
  alt,
  caption,
  onZoom,
}: {
  src: string;
  alt: string;
  caption?: string;
  onZoom: (src: string) => void;
}) {
  return (
    <figure className="mt-4">
      <button
        type="button"
        onClick={() => onZoom(src)}
        className="block w-full overflow-hidden rounded-xl border border-line bg-panel/40 transition hover:border-line2"
        title="点击放大"
      >
        <img
          src={`${DOCS_BASE}/${src}`}
          alt={alt}
          loading="lazy"
          className="w-full"
        />
      </button>
      {caption && (
        <figcaption className="mt-1.5 text-[11px] leading-relaxed text-muted2">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

function Section({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-9 first:mt-0">
      <h2 className="flex items-baseline gap-2 text-[15px] font-semibold text-white">
        <span className="num text-[12px] font-bold text-brand2">
          {String(index).padStart(2, "0")}
        </span>
        {title}
      </h2>
      <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-muted">
        {children}
      </div>
    </section>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border border-brand/25 bg-brand/5 px-3 py-2 text-[12px] leading-relaxed text-white/75">
      {children}
    </div>
  );
}

export function UsageDocs({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (zoom) setZoom(null);
      else onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, zoom]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[130] flex flex-col bg-[#08080a] text-white">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-5 sm:px-8">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line2 bg-white/[0.04] px-3 text-[13px] text-white/85 transition hover:bg-white/[0.08] hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </button>
        <div className="flex items-center gap-2 text-white/90">
          <BookOpen className="h-4 w-4 text-brand2" />
          <span className="text-[13px] font-medium">使用文档</span>
        </div>
        <div className="ml-auto opacity-50">
          <Logo size="sm" />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[860px] px-5 pb-20 pt-10 sm:px-8">
          <p className="text-[13px] leading-relaxed text-muted">
            TikTap 是 X Layer 上的涨跌二元彩池：选一个标的、看涨或看跌、押注，区块到达后自动开奖。
            不需要钱包插件，也不需要助记词——登录后后端会为你生成一个托管钱包并代签交易。
          </p>

          <Section index={1} title="登录 / 开户">
            <p>
              点击右上角「登录」，选择「使用 X 账号登录」，会跳到 X 的授权页面，确认授权后自动跳回。
            </p>
            <Shot
              src="02-login-modal.png"
              alt="登录弹窗"
              caption="① 右上角「登录」打开登录弹窗，选择 X 账号登录。"
              onZoom={setZoom}
            />
            <Shot
              src="03-x-oauth.png"
              alt="X 授权页面"
              caption="② X 授权页：确认后回到 TikTap，账号自动建立。"
              onZoom={setZoom}
            />
            <Tip>
              授权只用于拿到你的 X 公开资料（昵称、头像）。托管钱包的私钥加密存在服务端，
              你在页面上看不到也不需要保存助记词。
            </Tip>
          </Section>

          <Section index={2} title="领取测试币">
            <p>
              新账号余额为 0，先在顶栏点「领测试币」。每次固定发放 <span className="num text-white">1000 TEST</span>，
              同一个地址每 5 分钟可以领一次。
            </p>
            <Shot
              src="05-faucet.png"
              alt="领取测试币弹窗"
              caption="③ 领测试币弹窗：显示本次数量、当前余额、累计已领。"
              onZoom={setZoom}
            />
            <p>
              冷却期没结束时，确认按钮会变成倒计时（例如「04:43 后可领取」），归零后才能再点。
              这个限制是按地址算的，刷新页面也不会重置。
            </p>
          </Section>

          <Section index={3} title="发现页导览">
            <p>
              左侧是「自选 / 发现 / 主页」三个入口；顶部可以搜索代币、合约或交易者；
              中间是标的物选择和 K 线；右侧是下注面板，下面是当前市场的活动、参与者、观点和我的下注。
            </p>
            <Shot
              src="06-discover.png"
              alt="发现页"
              caption="④ 发现页整体：左侧导航、中间 K 线、右侧下注面板。"
              onZoom={setZoom}
            />
            <p>
              K 线支持 15 秒 / 30 秒 / 1 分钟，行情由浏览器直连 OKX 公共接口，不占服务端额度。
            </p>
          </Section>

          <Section index={4} title="选标的、轮次与封盘">
            <p>
              在标的物区域选择要参与的市场（例如 BTC）。每轮固定 <span className="num text-white">600</span> 个区块，
              前 <span className="num text-white">300</span> 个区块可以下注，后 <span className="num text-white">300</span> 个区块等待开奖；
              所以任意时刻都有一轮可以下注、一轮正在等开奖。
            </p>
            <Shot
              src="09-round-window.png"
              alt="轮次规则示意"
              caption="⑤ 轮次规则：600 块一轮，前 300 块下注、后 300 块等待开奖；下注代币当前只开放 TEST。"
              onZoom={setZoom}
            />
            <Tip>
              轮次由链上区块驱动，不依赖服务器时间。刷新页面、切换设备看到的都是同一轮。
            </Tip>
          </Section>

          <Section index={5} title="下注">
            <p>
              先填金额（或点快捷金额），再点「Tap涨」或「Tap跌」。交易由后端用你的托管钱包代签上链，
              <span className="text-white">上链成功才记仓</span>，失败不会产生持仓。
            </p>
            <p>
              面板上的收益率是按当前池子和手续费算出来的百分比，池子越大、对手越少，收益率越高；
              下单前就能看到。
            </p>
            <Tip>
              同一个地址的交易是串行提交的，连续点击时后一笔会等前一笔上链完成，避免 nonce 冲突。
            </Tip>
            <p>
              下注代币当前只开放 <span className="text-white">TEST</span>；OKB / BEM 还在准备中，
              点它们的按钮会提示「暂未开放」。
            </p>
          </Section>

          <Section index={6} title="开奖与领奖">
            <p>
              封盘后系统自动结算（按开奖价与锁定价的涨跌判定），赢家按池子份额分钱。
              开奖后不需要你手动操作，盈利会自动代领回你的余额。
            </p>
            <p>
              「我的下注」会显示本轮你押的方向、金额和结果；历史轮次和盈亏能在个人主页里查。
            </p>
          </Section>

          <Section index={7} title="活动 / 参与者 / 观点">
            <p>
              活动流按时间倒序列出下注、开奖、自动领奖；参与者面板显示本轮谁在买涨 / 买跌。
              两个面板都支持「仅看本轮」和「仅看已关注」筛选。
            </p>
            <p>
              你可以在观点区发布对当前市场的看法，点用户名可以直接进对方的个人主页。
            </p>
          </Section>

          <Section index={8} title="排行榜">
            <p>
              排行榜按<span className="text-white">已结算下注的净盈利</span>排序，同时显示具体 TEST 数量和盈亏百分比；
              亏损也会出现在榜上（负数标红）。切到「已关注」只看你关注的人。
            </p>
            <Shot
              src="07-leaderboard.png"
              alt="排行榜"
              caption="⑥ 排行榜：盈利金额 + 百分比。"
              onZoom={setZoom}
            />
          </Section>

          <Section index={9} title="个人主页与关注">
            <p>
              个人主页汇总参与轮次、胜率、账户余额、总盈亏、当前持仓、轮次历史和活动记录。
              点「粉丝 / 关注」可以打开列表，在列表里直接关注或取关。
            </p>
            <Shot
              src="08-profile.png"
              alt="个人主页"
              caption="⑦ 个人主页：统计、余额、持仓、轮次历史与活动。"
              onZoom={setZoom}
            />
          </Section>

          <Section index={10} title="常见问题">
            <p>
              <span className="text-white">需要装钱包或记助记词吗？</span>
              不需要。登录即开户，交易由后端托管钱包代签。
            </p>
            <p>
              <span className="text-white">TEST 是真的钱吗？</span>
              不是。这是跑在 X Layer 测试网上的演示环境，TEST 没有真实价值，只用于体验流程。
            </p>
            <p>
              <span className="text-white">为什么点下注没反应？</span>
              大概率是已封盘、余额不足，或者该下注代币暂时停用；面板上会有对应的提示。
            </p>
          </Section>

          <div className="mt-12 border-t border-line pt-4 text-[11px] text-muted2">
            文档会随功能更新；发现和截图不一致的地方，以页面实际行为为准。
          </div>
        </div>
      </div>

      {/* 点击截图放大 */}
      {zoom && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/85 p-6"
          onClick={() => setZoom(null)}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setZoom(null);
          }}
        >
          <button
            type="button"
            onClick={() => setZoom(null)}
            aria-label="关闭大图"
            className={cn(
              "absolute right-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-full",
              "border border-white/20 bg-white/10 text-white transition hover:bg-white/20",
            )}
          >
            <X className="h-4 w-4" />
          </button>
          <img
            src={`${DOCS_BASE}/${zoom}`}
            alt="文档截图大图"
            className="max-h-full max-w-full rounded-lg border border-white/15 shadow-[0_30px_120px_rgba(0,0,0,0.8)]"
          />
        </div>
      )}
    </div>
  );
}
