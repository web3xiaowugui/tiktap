import type { Db } from "./db.ts";

/** 账号的自选市场（跨环境共用，symbol 是全局的）。 */
export function readWatchlist(db: Db, userId: number): string[] {
  const rows = db
    .prepare("SELECT symbol FROM watchlist WHERE user_id = ? ORDER BY created_at")
    .all(userId) as Array<{ symbol: string }>;
  return rows.map((row) => row.symbol);
}

export function addWatchlist(db: Db, userId: number, symbol: string): void {
  db.prepare(
    "INSERT OR IGNORE INTO watchlist (user_id, symbol, created_at) VALUES (?, ?, ?)",
  ).run(userId, symbol, Date.now());
}

export function removeWatchlist(db: Db, userId: number, symbol: string): void {
  db.prepare("DELETE FROM watchlist WHERE user_id = ? AND symbol = ?").run(userId, symbol);
}
