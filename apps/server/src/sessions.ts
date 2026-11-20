import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { HttpError } from "./http.ts";
import type { Db } from "./db.ts";

/** 30 天有效；过期后需要重新登录（或重新建号拿新 token）。 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  userId: number;
  address: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * 签发会话：返回明文 token 给客户端，库里只存 sha256。
 * 顺手清理过期记录，避免表无限增长。
 */
export function createSession(db: Db, userId: number, address: string): string {
  const token = randomBytes(24).toString("hex");
  const now = Date.now();
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
  db.prepare(
    "INSERT INTO sessions (token_hash, user_id, address, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
  ).run(hashToken(token), userId, address, now, now + SESSION_TTL_MS);
  return token;
}

/** 读 Authorization: Bearer <token>，没有就返回 null。 */
export function readSessionToken(req: IncomingMessage): string | null {
  const header = String(req.headers.authorization ?? "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

/** 写接口统一鉴权：没 token / token 过期都直接 401。 */
export function requireSession(db: Db, req: IncomingMessage): SessionUser {
  const token = readSessionToken(req);
  if (!token) throw new HttpError(401, "请先登录");

  const row = db
    .prepare(
      "SELECT user_id, address, expires_at FROM sessions WHERE token_hash = ?",
    )
    .get(hashToken(token)) as
    | { user_id: number; address: string; expires_at: number }
    | undefined;

  if (!row) throw new HttpError(401, "登录已失效，请重新登录");
  if (row.expires_at < Date.now()) throw new HttpError(401, "登录已过期，请重新登录");

  return { userId: row.user_id, address: row.address };
}
