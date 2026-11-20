import { type DependencyList, useCallback, useEffect, useState } from "react";
import { useEnvironment } from "@/lib/environment";

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Tiny data-fetching hook around the mock API.
 * The previous data is kept while the next request is in flight so the UI
 * does not flash an empty state when the user switches markets.
 */
export function useApi<T>(loader: () => Promise<T>, deps: DependencyList) {
  // 切换环境时所有 useApi 都自动重新请求，不用整页刷新。
  const environment = useEnvironment();
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: true,
    error: null,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((prev) => ({ data: prev.data, loading: true, error: null }));
    loader()
      .then((data) => {
        if (alive) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (alive) {
          setState((prev) => ({
            data: prev.data,
            loading: false,
            error: error instanceof Error ? error.message : "加载失败",
          }));
        }
      });
    return () => {
      alive = false;
    };
    // The caller owns the dependency list on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, environment]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { ...state, reload };
}
