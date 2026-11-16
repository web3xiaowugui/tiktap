import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  signInAsDemo,
  signInWithOkx,
  signOut as signOutRequest,
} from "@/api";
import type { AuthUser } from "@/api/types";
import { connectOkxWallet } from "@/lib/okxWallet";

const STORAGE_KEY = "fomo.demo.auth.v2";

interface AuthContextValue {
  user: AuthUser | null;
  connectOkx: () => Promise<AuthUser>;
  signInDemo: () => Promise<AuthUser>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readInitialUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AuthUser> | null;
      if (
        parsed &&
        typeof parsed.name === "string" &&
        typeof parsed.handle === "string" &&
        (parsed.provider === "okx" || parsed.provider === "demo")
      ) {
        return parsed as AuthUser;
      }
    }
  } catch {
    // ignore corrupt storage
  }

  // `?demo=1` is a shortcut for reviewers: skip the wallet connection.
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "1") {
      const demo: AuthUser = {
        name: "end",
        handle: "end837",
        email: "end@tiktap.demo",
        provider: "demo",
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
      } catch {
        // storage can be unavailable in private mode
      }
      return demo;
    }
  }

  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(readInitialUser);

  const remember = useCallback((nextUser: AuthUser) => {
    setUser(nextUser);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
    } catch {
      // non-fatal
    }
    return nextUser;
  }, []);

  const connectOkx = useCallback(async () => {
    const account = await connectOkxWallet();
    const nextUser = await signInWithOkx(account.address, account.chainId);
    return remember(nextUser);
  }, [remember]);

  const signInDemo = useCallback(async () => {
    const nextUser = await signInAsDemo();
    return remember(nextUser);
  }, [remember]);

  const signOut = useCallback(async () => {
    await signOutRequest();
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // non-fatal
    }
  }, []);

  const value = useMemo(
    () => ({ user, connectOkx, signInDemo, signOut }),
    [user, connectOkx, signInDemo, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
