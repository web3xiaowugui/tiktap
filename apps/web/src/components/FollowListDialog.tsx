import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, UserCheck, UserPlus, X } from "lucide-react";
import { getFollowList, setFollow } from "@/api";
import type { FollowEntry } from "@/api/types";
import { Avatar } from "@/components/Avatar";
import { useToast } from "@/context/ToastContext";
import { cn } from "@/lib/cn";

const PAGE_SIZE = 50;

/** 粉丝 / 关注列表弹窗：点整行进个人页，行内可直接关注 / 取关。 */
export function FollowListDialog({
  open,
  kind,
  handle,
  viewer,
  onClose,
  onChanged,
}: {
  open: boolean;
  kind: "followers" | "following";
  handle: string;
  viewer?: string | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const navigate = useNavigate();
  const { push } = useToast();
  const [items, setItems] = useState<FollowEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyHandle, setBusyHandle] = useState<string | null>(null);
  const requestId = useRef(0);

  const loadPage = useCallback(
    async (offset: number) => {
      const id = ++requestId.current;
      if (offset === 0) setLoading(true);
      else setLoadingMore(true);
      try {
        const result = await getFollowList(handle, kind, {
          viewer,
          limit: PAGE_SIZE,
          offset,
        });
        if (id !== requestId.current) return;
        setTotal(result.total);
        setItems((previous) =>
          offset === 0 ? result.items : [...previous, ...result.items],
        );
      } catch (error) {
        if (id !== requestId.current) return;
        push(error instanceof Error ? error.message : "加载失败，请重试", "error");
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [handle, kind, viewer, push],
  );

  // 打开 / 切换 tab 时重新拉第一页
  useEffect(() => {
    if (!open) return;
    setItems([]);
    setTotal(0);
    void loadPage(0);
    return () => {
      requestId.current += 1;
    };
  }, [open, loadPage]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  const toggleFollow = async (entry: FollowEntry) => {
    if (!viewer || entry.isSelf || busyHandle) return;
    const next = !entry.isFollowing;
    setBusyHandle(entry.handle);
    try {
      const result = await setFollow(viewer, entry.handle, next);
      setItems((previous) =>
        previous.map((item) =>
          item.handle === entry.handle
            ? { ...item, isFollowing: result.isFollowing }
            : item,
        ),
      );
      push(next ? `已关注 ${entry.name}` : `已取消关注 ${entry.name}`, "success");
      window.dispatchEvent(new Event("tiktap:activity-refresh"));
      onChanged?.();
    } catch (error) {
      push(error instanceof Error ? error.message : "操作失败，请重试", "error");
    } finally {
      setBusyHandle(null);
    }
  };

  const openProfile = (entry: FollowEntry) => {
    onClose();
    navigate(`/u/${encodeURIComponent(entry.handle)}`);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/20 px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={kind === "followers" ? "粉丝列表" : "关注列表"}
        className="animate-scale-in flex max-h-[72vh] w-full max-w-[420px] flex-col overflow-hidden rounded-2xl border border-line2 bg-[#101014] shadow-[0_40px_120px_rgba(0,0,0,0.75)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[14px] font-semibold text-white">
              {kind === "followers" ? "粉丝" : "关注"}
            </h2>
            <span className="num text-[11px] text-muted2">{total}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted2 transition hover:bg-panel2 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading &&
            Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex animate-pulse items-center gap-2.5 px-4 py-3">
                <span className="h-8 w-8 shrink-0 rounded-full bg-panel2" />
                <span className="h-3 w-32 rounded bg-panel2" />
                <span className="ml-auto h-6 w-14 rounded-full bg-panel2" />
              </div>
            ))}

          {!loading && items.length === 0 && (
            <p className="px-4 py-10 text-center text-[12px] text-muted2">
              {kind === "followers" ? "还没有粉丝" : "还没有关注任何人"}
            </p>
          )}

          {!loading &&
            items.map((entry) => (
              <div
                key={entry.handle}
                role="button"
                tabIndex={0}
                onClick={() => openProfile(entry)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openProfile(entry);
                  }
                }}
                className="flex cursor-pointer items-center gap-2.5 border-b border-line/40 px-4 py-2.5 transition last:border-0 hover:bg-panel2/60"
              >
                <Avatar name={entry.name} gradient={entry.avatar} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-white">
                    {entry.name}
                  </div>
                  <div className="num truncate text-[10px] text-muted2">
                    @{entry.handle} · {entry.followers} 粉丝
                  </div>
                </div>
                {viewer && !entry.isSelf && (
                  <button
                    type="button"
                    disabled={busyHandle === entry.handle}
                    onClick={(event) => {
                      event.stopPropagation();
                      void toggleFollow(entry);
                    }}
                    className={cn(
                      "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
                      entry.isFollowing
                        ? "border border-line bg-panel text-muted hover:border-line2 hover:text-white"
                        : "bg-white text-black hover:bg-white/90",
                    )}
                  >
                    {busyHandle === entry.handle ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : entry.isFollowing ? (
                      <UserCheck className="h-3 w-3" />
                    ) : (
                      <UserPlus className="h-3 w-3" />
                    )}
                    {entry.isFollowing ? "已关注" : "关注"}
                  </button>
                )}
              </div>
            ))}

          {!loading && items.length < total && (
            <div className="px-4 py-3">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadPage(items.length)}
                className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-panel text-[11px] text-muted transition hover:border-line2 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore && <Loader2 className="h-3 w-3 animate-spin" />}
                加载更多（还有 {total - items.length}）
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
