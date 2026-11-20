import { useEffect } from "react";
import { ArrowLeft, BookOpen } from "lucide-react";
import { Logo } from "@/components/Logo";

/**
 * 使用文档（整页覆盖在落地页之上，不新增路由）。
 * 正文先留空，后续往 CONTENT 里填章节即可。
 */
const CONTENT: React.ReactNode = null;

export function UsageDocs({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
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
        <div className="mx-auto w-full max-w-[860px] px-5 py-12 sm:px-8">
          {CONTENT ?? (
            <div className="rounded-xl border border-dashed border-line2 bg-panel/40 px-6 py-20 text-center">
              <BookOpen className="mx-auto h-6 w-6 text-white/25" />
              <p className="mt-3 text-[13px] text-muted2">文档内容待补充</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
