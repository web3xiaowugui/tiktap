import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { SidebarResizeHandle } from "@/components/SidebarResizeHandle";
import { TokenSidebar } from "@/components/TokenSidebar";
import { TopBar } from "@/components/TopBar";
import { TradePanel } from "@/components/TradePanel";
import { useAuth } from "@/context/AuthContext";
import { BetTokenProvider } from "@/context/BetTokenContext";
import { ChainClockProvider } from "@/lib/chainClock";

const getSidebarBaseWidth = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(min-width: 1536px)").matches
    ? 310
    : 280;

export default function AppLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [sidebarBaseWidth, setSidebarBaseWidth] = useState(getSidebarBaseWidth);
  const [sidebarWidth, setSidebarWidth] = useState(getSidebarBaseWidth);
  const minSidebarWidth = sidebarBaseWidth;
  const maxSidebarWidth = Math.round(sidebarBaseWidth * 1.5);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1536px)");
    const syncWidthBounds = () => {
      const nextBaseWidth = media.matches ? 310 : 280;
      setSidebarBaseWidth(nextBaseWidth);
      setSidebarWidth((current) =>
        Math.min(
          Math.max(current, nextBaseWidth),
          Math.round(nextBaseWidth * 1.5),
        ),
      );
    };

    media.addEventListener("change", syncWidthBounds);
    return () => media.removeEventListener("change", syncWidthBounds);
  }, []);

  if (!user) {
    return <Navigate to="/?login=1" replace />;
  }

  const isProfile = pathname.startsWith("/u/");

  return (
    <ChainClockProvider>
      <BetTokenProvider>
      <div className="app-ui flex h-dvh flex-col overflow-hidden bg-ink">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <TokenSidebar width={sidebarWidth} />
          <SidebarResizeHandle
            width={sidebarWidth}
            minWidth={minSidebarWidth}
            maxWidth={maxSidebarWidth}
            onResize={setSidebarWidth}
          />
          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            <Outlet />
          </main>
          {/* 个人主页不需要右侧交易/转账栏，内容区占满 */}
          {!isProfile && <TradePanel />}
        </div>
      </div>
      </BetTokenProvider>
    </ChainClockProvider>
  );
}
