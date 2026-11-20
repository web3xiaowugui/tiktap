import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getBetTokens, getWallet } from "@/api";
import type { BetToken } from "@/api/types";
import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/lib/useApi";

interface BetTokenContextValue {
  tokens: BetToken[];
  loading: boolean;
  selected: BetToken | null;
  selectToken: (symbol: string) => void;
  /** 链上原生币余额（gas 用）。 */
  nativeBalance: number;
  /** 下注 / 领币之后刷新余额。 */
  reloadBalances: () => void;
}

const BetTokenContext = createContext<BetTokenContextValue | null>(null);

export function BetTokenProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const address = user?.address ?? null;

  const { data, loading } = useApi(getBetTokens, []);
  const walletState = useApi(
    () => (address ? getWallet(address) : Promise.resolve(null)),
    [address],
  );
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  const tokens = useMemo(() => {
    const base = data ?? [];
    const wallet = walletState.data;
    if (!wallet) return base;

    // 链上余额优先：接口里的 balance 是 0 占位，真实余额只来自钱包接口。
    return base.map((token) => {
      const onChain = wallet.tokens.find((item) => item.symbol === token.symbol);
      return onChain ? { ...token, balance: onChain.balance } : token;
    });
  }, [data, walletState.data]);

  // TEST 是免费领的体验币，默认落在它上面，新号不用先找代币。
  // 停用的代币按钮保留展示，但默认和选中都跳过它们。
  const enabledTokens = tokens.filter((token) => !token.disabled);
  const defaultToken =
    enabledTokens.find((token) => token.symbol === "TEST") ??
    enabledTokens.find((token) => token.symbol === "OKB") ??
    enabledTokens[0] ??
    null;
  const selected =
    enabledTokens.find((token) => token.symbol === selectedSymbol) ?? defaultToken;

  const selectToken = useCallback(
    (symbol: string) => {
      if (tokens.find((token) => token.symbol === symbol)?.disabled) return;
      setSelectedSymbol(symbol);
    },
    [tokens],
  );

  const value = useMemo(
    () => ({
      tokens,
      loading,
      selected,
      selectToken,
      nativeBalance: walletState.data?.native ?? 0,
      reloadBalances: walletState.reload,
    }),
    [tokens, loading, selected, selectToken, walletState.data, walletState.reload],
  );

  return <BetTokenContext.Provider value={value}>{children}</BetTokenContext.Provider>;
}

export function useBetToken(): BetTokenContextValue {
  const context = useContext(BetTokenContext);
  if (!context) throw new Error("useBetToken must be used inside BetTokenProvider");
  return context;
}
