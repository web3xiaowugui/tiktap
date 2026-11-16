import { createHash, randomBytes } from "node:crypto";
import { HttpError } from "./http.ts";

/**
 * X（Twitter）OAuth 2.0 授权码流程，带 PKCE。
 *
 * 用的是 X 官方 v2 端点：
 *   https://developer.x.com/en/docs/authentication/oauth-2-0/authorization-code
 * 需要在 X 开发者后台建一个 OAuth 2.0 应用，把「回调地址」填成 X_REDIRECT_URI
 * （默认 http://127.0.0.1:8787/api/auth/x/callback），拿到 Client ID/Secret 填进 .env。
 * 应用设为「客户端类型 = Web App / 需要 Client Secret」时走 Basic 认证，
 * 只给了 Client ID 就走公开客户端（纯 PKCE）。
 */

const AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const ME_URL = "https://api.x.com/2/users/me";

/** 一次性的授权中途态（state → PKCE verifier + 回来以后去哪儿）。 */
interface PendingLogin {
  verifier: string;
  returnTo: string;
  createdAt: number;
}

/** 回调成功后给前端的一次性票据。 */
export interface XTicketPayload {
  handle: string;
  name: string;
  createdAt: number;
}

const pending = new Map<string, PendingLogin>();
const tickets = new Map<string, XTicketPayload>();

const PENDING_TTL_MS = 10 * 60 * 1000;
const TICKET_TTL_MS = 5 * 60 * 1000;

export interface XConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  webUrl: string;
}

export function readXConfig(): XConfig {
  const baseUrl = (process.env.PUBLIC_BASE_URL ?? "http://127.0.0.1:8787").replace(/\/+$/, "");
  return {
    clientId: (process.env.X_CLIENT_ID ?? "").trim(),
    clientSecret: (process.env.X_CLIENT_SECRET ?? "").trim(),
    redirectUri: (
      process.env.X_REDIRECT_URI ?? `${baseUrl}/api/auth/x/callback`
    ).trim(),
    webUrl: (process.env.WEB_BASE_URL ?? "http://127.0.0.1:5173").replace(/\/+$/, ""),
  };
}

export function isXOAuthConfigured(): boolean {
  return Boolean(readXConfig().clientId);
}

/** 只接受站内相对路径，避免开放重定向。 */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/discover";
  return value;
}

export function buildAuthorizeUrl(returnTo: string): string {
  const cfg = readXConfig();
  if (!cfg.clientId) {
    throw new HttpError(
      503,
      "还没有配置 X 应用：请在 .env 里填 X_CLIENT_ID（有 Secret 就一起填 X_CLIENT_SECRET），并把回调地址登记到 X 开发者后台的 User authentication settings。",
    );
  }

  const state = randomBytes(16).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  pending.set(state, { verifier, returnTo, createdAt: Date.now() });

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("scope", "users.read tweet.read");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

/** 用 code 换 access_token，再取 users/me，最后发一张一次性票据给前端。 */
export async function exchangeXCode(
  code: string,
  state: string,
): Promise<{ ticket: string; returnTo: string; webUrl: string }> {
  const entry = pending.get(state);
  pending.delete(state);
  if (!entry) throw new HttpError(400, "X 登录状态已失效，请重新发起登录。");
  if (Date.now() - entry.createdAt > PENDING_TTL_MS) {
    throw new HttpError(400, "X 登录超时，请重新发起登录。");
  }

  const cfg = readXConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    code_verifier: entry.verifier,
    client_id: cfg.clientId,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (cfg.clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(
      `${cfg.clientId}:${cfg.clientSecret}`,
    ).toString("base64")}`;
  }

  const tokenRes = await fetch(TOKEN_URL, { method: "POST", headers, body });
  const rawToken = (await tokenRes.text()) || "{}";
  let token: TokenResponse = {};
  try {
    token = JSON.parse(rawToken) as TokenResponse;
  } catch {
    // 非 JSON 的话下面统一按失败处理
  }

  if (!tokenRes.ok || !token.access_token) {
    const reason =
      token.error_description ?? token.error ?? rawToken.slice(0, 200);
    throw new HttpError(502, `X 换取 token 失败（${tokenRes.status}）：${reason}`);
  }

  const meRes = await fetch(`${ME_URL}?user.fields=username,name`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!meRes.ok) {
    throw new HttpError(502, `读取 X 账号资料失败（${meRes.status}）`);
  }

  const me = (await meRes.json()) as {
    data?: { id?: string; username?: string; name?: string };
  };
  const username = me.data?.username;
  if (!username) throw new HttpError(502, "X 没有返回用户名");

  const ticket = randomBytes(24).toString("hex");
  tickets.set(ticket, {
    handle: username.toLowerCase(),
    name: me.data?.name?.trim() || username,
    createdAt: Date.now(),
  });

  return { ticket, returnTo: entry.returnTo, webUrl: cfg.webUrl };
}

/** 前端拿票换资料；票据一次性、5 分钟内有效。 */
export function consumeXTicket(ticket: string): { handle: string; name: string } {
  const entry = tickets.get(ticket);
  if (!entry) throw new HttpError(400, "X 登录票据无效或已使用，请重新登录。");
  tickets.delete(ticket);
  if (Date.now() - entry.createdAt > TICKET_TTL_MS) {
    throw new HttpError(400, "X 登录票据已过期，请重新登录。");
  }
  return { handle: entry.handle, name: entry.name };
}
