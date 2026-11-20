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
  readSessionToken,
  rememberSessionToken,
  signInAsDemo,
  signInWithXTicket,
  signOut as signOutRequest,
  startXOAuth,
} from "@/api";
import type { AuthUser } from "@/api/types";

const STORAGE_KEY = "fomo.demo.auth.v2";
/** 托管地址全局缓存：账号是全局身份，刷新或切换环境都复用同一个地址。 */
const ADDRESS_KEY = "tiktap.custody.address.v1";
/** 旧版按环境分开缓存时测试网用的 key，只作迁移兜底。 */
const LEGACY_TESTNET_ADDRESS_KEY = `${ADDRESS_KEY}.testnet`;

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
    return (
      localStorage.getItem(ADDRESS_KEY) ?? localStorage.getItem(LEGACY_TESTNET_ADDRESS_KEY)
    );
  } catch {
    return null;
  }
}

function rememberAddress(address: string): void {
  try {
    localStorage.setItem(ADDRESS_KEY, address);
    // 旧的按环境分键已废弃，清掉避免兜底时读到过期地址。
    localStorage.removeItem(LEGACY_TESTNET_ADDRESS_KEY);
  } catch {
    // non-fatal
  }
}

/**
 * 拿到（或创建）这个人的托管钱包地址。
 * 有 X id 时交给后端按 id 全局复用（刷新、切环境都用同一个地址）；
 * 没有 X id 时先看本地缓存，再确认后端确实有这个用户，最后才新建。
 */
async function createCustodialAddress(
  known?: string,
  profile?: { xId?: string; handle?: string; name?: string },
): Promise<string> {
  const candidate = known ?? readStoredAddress();

  // 只有持有有效会话 token 时才信任缓存地址；否则必须走建号拿新 token，
  // 不然会出现「有地址但所有写接口都 401」的状态。
  if (candidate && readSessionToken()) {
    try {
      const existing = await getUser(candidate);
      if (existing) {
        rememberAddress(existing.address);
        return existing.address;
      }
    } catch {
      // 缓存地址在库里查不到（例如数据库重建过），继续新建。
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
 * 同一时间只允许一个建号请求在飞：开发模式下 StrictMode 会重复执行 effect，
 * 没有这层去重，一次刷新/切环境会重复建号。
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

  // 已经登录但还没有托管地址（刷新或切换环境后的老会话）：补建一次。
  // 带上 X id，后端才能按全局身份复用原账号，而不是新建一个匿名号。
  useEffect(() => {
    if (!user) return;

    // 没有会话 token：demo 账号自动补建一次（会拿到新 token）；
    // X 账号必须重新走一遍授权，避免拿本地缓存冒充身份。
    if (!readSessionToken()) {
      if (user.provider === "demo") {
        let alive = true;
        void ensureCustodialAddress(undefined, { handle: user.handle, name: user.name })
          .then((address) => {
            if (alive) remember({ ...user, address });
          })
          .catch(() => {
            // demo 登录被服务端关闭（403）时，清掉本地登录态
            if (!alive) return;
            try {
              localStorage.removeItem(STORAGE_KEY);
            } catch {
              // non-fatal
            }
            setUser(null);
          });
        return () => {
          alive = false;
        };
      }
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // non-fatal
      }
      setUser(null);
      return;
    }

    if (user.address) return;
    let alive = true;
    void ensureCustodialAddress(user.address, {
      xId: user.xId,
      handle: user.handle,
      name: user.name,
    })
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

  /**
   * X 授权回来：票据换账号。建号 + 会话 token 都由服务端完成，
   * 客户端拿不到「按 xUserId 复用任何人」的入口。
   */
  const finishXLogin = useCallback(
    async (ticket: string) => {
      const account = await signInWithXTicket(ticket);
      rememberAddress(account.address);
      return remember({
        name: account.name,
        handle: account.handle,
        email: account.email,
        provider: "x",
        xId: account.xId,
        address: account.address,
      });
    },
    [remember],
  );

  const signInDemo = useCallback(async () => {
    const nextUser = await signInAsDemo();
    return withCustody(nextUser);
  }, [withCustody]);

  const signOut = useCallback(async () => {
    await signOutRequest();
    rememberSessionToken(null);
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
