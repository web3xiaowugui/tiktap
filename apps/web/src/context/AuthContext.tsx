import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createUser, getUser, signInAsDemo, signInWithX, signOut as signOutRequest } from "@/api";
import type { AuthUser } from "@/api/types";


const STORAGE_KEY = "fomo.demo.auth.v2";
/** 托管地址单独存一份，换账号登录也不会丢。 */
const ADDRESS_KEY = "tiktap.custody.address.v1";

interface AuthContextValue {
  user: AuthUser | null;
  connectX: (handle: string) => Promise<AuthUser>;
  signInDemo: () => Promise<AuthUser>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredAddress(): string | null {
  try {
    return localStorage.getItem(ADDRESS_KEY);
  } catch {
    return null;
  }
}

function rememberAddress(address: string): void {
  try {
    localStorage.setItem(ADDRESS_KEY, address);
  } catch {
    // non-fatal
  }
}

/**
 * 拿到（或创建）这个人的托管钱包地址。
 * 先看本地缓存，再确认后端确实有这个用户，最后才新建 —— 避免每次登录都多造一个号。
 */
async function ensureCustodialAddress(known?: string): Promise<string> {
  const candidate = known ?? readStoredAddress();

  if (candidate) {
    const existing = await getUser(candidate);
    if (existing) {
      rememberAddress(existing.address);
      return existing.address;
    }
  }

  const created = await createUser();
  rememberAddress(created.address);
  return created.address;
}

function readInitialUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AuthUser> | null;
      if (
        parsed &&
        typeof parsed.name === "string" &&
        typeof parsed.handle === "string" &&
        (parsed.provider === "x" || parsed.provider === "demo")
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

  // 已经登录但还没有托管地址（比如老会话）：补建一次。
  useEffect(() => {
    if (!user || user.address) return;
    let alive = true;
    void ensureCustodialAddress()
      .then((address) => {
        if (alive) remember({ ...user, address });
      })
      .catch(() => {
        // 后端/链不可用时保持无地址状态，下注按钮会提示
      });
    return () => {
      alive = false;
    };
  }, [user, remember]);

  const withCustody = useCallback(
    async (nextUser: AuthUser) => {
      const address = await ensureCustodialAddress(nextUser.address);
      return remember({ ...nextUser, address });
    },
    [remember],
  );

  const connectX = useCallback(
    async (handle: string) => {
      const nextUser = await signInWithX(handle);
      return withCustody(nextUser);
    },
    [withCustody],
  );

  const signInDemo = useCallback(async () => {
    const nextUser = await signInAsDemo();
    return withCustody(nextUser);
  }, [withCustody]);

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
    () => ({ user, connectX, signInDemo, signOut }),
    [user, connectX, signInDemo, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
