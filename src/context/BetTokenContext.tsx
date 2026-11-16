import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getBetTokens } from "@/api";
import type { BetToken } from "@/api/types";
import { useApi } from "@/lib/useApi";

interface BetTokenContextValue {
  tokens: BetToken[];
  loading: boolean;
  selected: BetToken | null;
  selectToken: (symbol: string) => void;
}

const BetTokenContext = createContext<BetTokenContextValue | null>(null);

export function BetTokenProvider({ children }: { children: ReactNode }) {
  const { data, loading } = useApi(getBetTokens, []);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  const tokens = data ?? [];
  const defaultToken =
    tokens.find((token) => token.symbol === "OKB") ?? tokens[0] ?? null;
  const selected =
    tokens.find((token) => token.symbol === selectedSymbol) ?? defaultToken;

  const selectToken = useCallback((symbol: string) => {
    setSelectedSymbol(symbol);
  }, []);

  const value = useMemo(
    () => ({ tokens, loading, selected, selectToken }),
    [tokens, loading, selected, selectToken],
  );

  return (
    <BetTokenContext.Provider value={value}>
      {children}
    </BetTokenContext.Provider>
  );
}

export function useBetToken(): BetTokenContextValue {
  const context = useContext(BetTokenContext);
  if (!context) throw new Error("useBetToken must be used inside BetTokenProvider");
  return context;
}
