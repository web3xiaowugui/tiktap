import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { SidebarResizeHandle } from "@/components/SidebarResizeHandle";
import { TickerBar } from "@/components/TickerBar";
import { TokenSidebar } from "@/components/TokenSidebar";
import { TopBar } from "@/components/TopBar";
import { TradePanel } from "@/components/TradePanel";
import { TransferPanel } from "@/components/TransferPanel";
import { useAuth } from "@/context/AuthContext";
import { BetTokenProvider } from "@/context/BetTokenContext";

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
          {isProfile ? <TransferPanel /> : <TradePanel />}
        </div>
        <TickerBar />
      </div>
    </BetTokenProvider>
  );
}
