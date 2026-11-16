import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "default" | "success" | "error";

interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

interface ToastContextValue {
  push: (message: string, tone?: Tone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: Tone = "default") => {
      const id = ++idRef.current;
      setItems((current) => [...current.slice(-2), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), 3200);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-12 right-5 z-[120] flex w-[320px] flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "animate-scale-in pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-[12px] shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur",
              item.tone === "success"
                ? "border-up/30 bg-[#0e1b17]/95 text-up"
                : item.tone === "error"
                  ? "border-down/30 bg-[#1d0f13]/95 text-down"
                  : "border-line2 bg-[#15151b]/95 text-white",
            )}
          >
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />
            <span className="flex-1 leading-relaxed">{item.message}</span>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="text-muted2 transition hover:text-white"
              aria-label="关闭提示"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
