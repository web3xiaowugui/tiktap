import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getWatchlist, setWatchlist } from "@/api";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";

/** 旧版存在浏览器里的自选，只用于登录后一次性迁移进数据库。 */
const LEGACY_KEY = "fomo.watchlist.v2";

interface WatchlistContextValue {
  symbols: string[];
  isWatched: (symbol: string) => boolean;
  toggle: (symbol: string) => void;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

function readLegacy(): string[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

/** 自选存后端数据库（按账号、跨环境共用），不再是浏览器本地。 */
export function WatchlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { push } = useToast();
  const [symbols, setSymbols] = useState<string[]>([]);
  const address = user?.address ?? null;
  const addressRef = useRef(address);
  addressRef.current = address;

  // 登录 / 切账号时从库里读；旧的本地自选一次性合并进来，然后删掉本地 key
  useEffect(() => {
    let alive = true;
    if (!address) {
      setSymbols([]);
      return () => {
        alive = false;
      };
    }

    const legacy = readLegacy();
    getWatchlist(address)
      .then(({ symbols: stored }) => {
        if (!alive) return;
        const missing = legacy.filter((symbol) => !stored.includes(symbol));
        if (missing.length === 0) {
          localStorage.removeItem(LEGACY_KEY);
          setSymbols(stored);
          return;
        }
        Promise.all(missing.map((symbol) => setWatchlist(address, symbol, true)))
          .then((results) => {
            if (!alive) return;
            localStorage.removeItem(LEGACY_KEY);
            setSymbols(results[results.length - 1].symbols);
          })
          .catch(() => {
            if (alive) setSymbols(stored);
          });
      })
      .catch(() => {
        if (alive) setSymbols([]);
      });

    return () => {
      alive = false;
    };
  }, [address]);

  const toggle = useCallback(
    (symbol: string) => {
      if (!address) {
        push("登录后可以收藏市场", "error");
        return;
      }
      const watched = symbols.includes(symbol);
      const optimistic = watched
        ? symbols.filter((item) => item !== symbol)
        : [...symbols, symbol];
      setSymbols(optimistic);
      setWatchlist(address, symbol, !watched)
        .then((result) => {
          if (addressRef.current === address) setSymbols(result.symbols);
        })
        .catch(() => {
          setSymbols(symbols);
          push("收藏失败，请重试", "error");
        });
    },
    [address, push, symbols],
  );

  const value = useMemo(
    () => ({
      symbols,
      isWatched: (symbol: string) => symbols.includes(symbol),
      toggle,
    }),
    [symbols, toggle],
  );

  return (
    <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>
  );
}

export function useWatchlist(): WatchlistContextValue {
  const context = useContext(WatchlistContext);
  if (!context) throw new Error("useWatchlist must be used inside WatchlistProvider");
  return context;
}
