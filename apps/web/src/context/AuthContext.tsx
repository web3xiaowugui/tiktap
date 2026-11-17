import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createUser,
  getUser,
  signInAsDemo,
  signInWithXTicket,
  signOut as signOutRequest,
  startXOAuth,
} from "@/api";
import type { AuthUser } from "@/api/types";
import { readEnvironment } from "@/lib/environment";


const STORAGE_KEY = "fomo.demo.auth.v2";
/** 托管地址按环境分开缓存：切到测试网时会自动建一个测试网专用地址。 */
const ADDRESS_KEY = "tiktap.custody.address.v1";

function addressStorageKey(): string {
  return readEnvironment() === "testnet" ? `${ADDRESS_KEY}.testnet` : ADDRESS_KEY;
}

interface AuthContextValue {
  user: AuthUser | null;
  startXLogin: (returnTo?: string) => Promise<void>;
  finishXLogin: (ticket: string) => Promise<AuthUser>;
  signInDemo: () => Promise<AuthUser>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredAddress(): string | null {
  try {
    return localStorage.getItem(addressStorageKey());
  } catch {
    return null;
  }
}

function rememberAddress(address: string): void {
  try {
    localStorage.setItem(addressStorageKey(), address);
  } catch {
    // non-fatal
  }
}

/**
 * 拿到（或创建）这个人的托管钱包地址。
 * 先看本地缓存，再确认后端确实有这个用户，最后才新建 —— 避免每次登录都多造一个号。
 */
async function createCustodialAddress(
  known?: string,
  profile?: { xId?: string; handle?: string; name?: string },
): Promise<string> {
  // 有 X id 就交给后端按 id 复用/新建（顺带刷新 handle/昵称），前端缓存地址仅供参考。
  if (profile?.xId) {
    const created = await createUser({
      xUserId: profile.xId,
      handle: profile.handle,
      name: profile.name,
    });
    rememberAddress(created.address);
    return created.address;
  }

  const candidate = known ?? readStoredAddress();

  if (candidate) {
    try {
      const existing = await getUser(candidate);
      if (existing) {
        rememberAddress(existing.address);
        return existing.address;
      }
    } catch {
      // 缓存地址不属于当前环境（例如测试网数据重建过），继续新建。
    }
  }

  const created = await createUser({
    handle: profile?.handle,
    name: profile?.name,
  });
  rememberAddress(created.address);
  return created.address;
}

let custodyRequest: Promise<string> | null = null;

/**
 * 同一环境只允许一个建号请求在飞：开发模式下 StrictMode 会重复执行 effect，
 * 没有这层去重会一次切换就建出两个测试网账号。
 */
async function ensureCustodialAddress(
  known?: string,
  profile?: { xId?: string; handle?: string; name?: string },
): Promise<string> {
  if (custodyRequest) return custodyRequest;
  custodyRequest = createCustodialAddress(known, profile).finally(() => {
    custodyRequest = null;
  });
  return custodyRequest;
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
        // 缓存地址只作为候选：初次挂载时向后端确认它属于当前环境，
        // 旧测试网地址不存在时自动新建并覆盖缓存。
        return { ...(parsed as AuthUser), address: undefined };
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
      const address = await ensureCustodialAddress(nextUser.address, {
        xId: nextUser.xId,
        handle: nextUser.handle,
        name: nextUser.name,
      });
      return remember({ ...nextUser, address });
    },
    [remember],
  );

  /** 跳到 X 授权页；回来时 Landing 会带着 x_ticket 调 finishXLogin。 */
  const startXLogin = useCallback(async (returnTo?: string) => {
    const url = await startXOAuth(returnTo ?? "/discover");
    window.location.assign(url);
  }, []);

  const finishXLogin = useCallback(
    async (ticket: string) => {
      const nextUser = await signInWithXTicket(ticket);
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
    () => ({ user, startXLogin, finishXLogin, signInDemo, signOut }),
    [user, startXLogin, finishXLogin, signInDemo, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
