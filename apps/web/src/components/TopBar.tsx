import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, Search, Settings, Trophy, User, Wallet } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Logo } from "@/components/Logo";
import { SearchDialog, useSearchHotkey } from "@/components/SearchDialog";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { cn } from "@/lib/cn";
import { shortAddress } from "@/lib/format";

const DEMO_AVATAR = "linear-gradient(135deg,#5eead4,#2563eb 55%,#4c1d95)";

export function TopBar() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { push } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  useSearchHotkey(openSearch);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen]);

  const handleSignOut = async () => {
    setMenuOpen(false);
    navigate("/", { replace: true });
    await signOut();
  };

  return (
    <header className="relative z-40 flex h-[52px] shrink-0 items-center gap-2 border-b border-line bg-ink px-3">
      <div className="flex shrink-0 items-center gap-3">
        <Link to="/" className="flex items-center" aria-label="回到首页">
          <Logo size="md" />
        </Link>
        <span className="hidden h-4 w-px bg-line2 sm:block" />
        <button
          type="button"
          onClick={() => navigate("/discover")}
          className="hidden items-center rounded-md bg-panel2 px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-panel3 sm:flex"
        >
          发现
        </button>
      </div>

      <div className="flex min-w-0 flex-1 justify-center px-2 sm:px-6">
        <button
          type="button"
          onClick={openSearch}
          className="group flex h-8 w-full max-w-[520px] items-center gap-2 rounded-md border border-line bg-panel px-3 text-left text-[11.5px] text-muted2 transition hover:border-line2 hover:bg-panel2"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">搜索代币、永续合约或交易者...</span>
          <kbd className="ml-auto hidden shrink-0 rounded border border-line2 bg-panel2 px-1.5 py-0.5 text-[9px] text-muted2 md:block">
            ⌘ K
          </kbd>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <div className="hidden items-center gap-1.5 md:flex">
          <span className="num text-[11.5px] text-white">$0.00</span>
          <span className="text-[9.5px] text-muted">现金</span>
          <button
            type="button"
            onClick={() => push("演示环境：充值入口暂未开放")}
            className="rounded border border-line bg-panel px-1.5 py-0.5 text-[9.5px] text-muted transition hover:border-line2 hover:text-white"
          >
            充值
          </button>
        </div>

        <span className="hidden h-4 w-px bg-line md:block" />

        <span className="hidden items-center gap-1.5 sm:flex">
          <Wallet className="h-3.5 w-3.5 text-muted2" />
          <span className="num text-[11.5px] text-white">$0.00</span>
        </span>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className={cn(
              "rounded-full ring-offset-2 ring-offset-ink transition hover:opacity-90",
              menuOpen && "ring-2 ring-brand/60",
            )}
            aria-label="账户菜单"
          >
            <Avatar name={user?.name ?? "F"} gradient={DEMO_AVATAR} size={27} />
          </button>

          {menuOpen && (
            <div className="animate-scale-in absolute right-0 top-[38px] w-[232px] overflow-hidden rounded-lg border border-line2 bg-[#121217] shadow-[0_24px_70px_rgba(0,0,0,0.65)]">
              <div className="flex items-center gap-2.5 border-b border-line px-3 py-3">
                <Avatar name={user?.name ?? "F"} gradient={DEMO_AVATAR} size={32} />
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-semibold text-white">
                    {user?.name ?? "访客"}
                  </div>
                  <div className="truncate text-[10px] text-muted2">@{user?.handle ?? "guest"}</div>
                  {user?.provider === "x" && user.address && (
                    <div
                      className="mt-1 flex items-center gap-1 text-[9px] text-muted2"
                      title={user.address}
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand2" />
                      <span className="truncate">托管账户 · {shortAddress(user.address)}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="p-1">
                <MenuItem
                  icon={<User className="h-3.5 w-3.5" />}
                  label="个人主页"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate(`/u/${user?.handle ?? "end837"}`);
                  }}
                />
                <MenuItem
                  icon={<Trophy className="h-3.5 w-3.5" />}
                  label="排行榜"
                  onClick={() => {
                    setMenuOpen(false);
                    push("排行榜将在裁剪版的下一次迭代中开放");
                  }}
                />
                <MenuItem
                  icon={<Settings className="h-3.5 w-3.5" />}
                  label="设置"
                  onClick={() => {
                    setMenuOpen(false);
                    push("演示环境：设置页暂未开放");
                  }}
                />
              </div>
              <div className="border-t border-line p-1">
                <MenuItem
                  icon={<LogOut className="h-3.5 w-3.5" />}
                  label="退出登录"
                  danger
                  onClick={handleSignOut}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[11.5px] transition hover:bg-panel2",
        danger ? "text-down/90 hover:text-down" : "text-white hover:text-white",
      )}
    >
      <span className="text-muted2">{icon}</span>
      {label}
    </button>
  );
}
