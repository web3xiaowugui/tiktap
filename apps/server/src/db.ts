import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const defaultDbPath = resolve(here, "../../../data/tiktap.db");
const schemaPath = resolve(here, "../schema.sql");

export type Db = DatabaseSync;

/** 打开（或创建）本地库，并把 schema 幂等地应用一遍。 */
export function openDb(path: string = process.env.DB_PATH ?? defaultDbPath): Db {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(readFileSync(schemaPath, "utf8"));
  // 并发写入时不要直接抛 SQLITE_BUSY，排队等一会儿；WAL 下 NORMAL 已经够安全
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA synchronous = NORMAL");
  ensureColumn(db, "users", "x_user_id", "x_user_id TEXT");
  ensureColumn(db, "users", "x_handle", "x_handle TEXT");
  ensureColumn(db, "users", "x_name", "x_name TEXT");
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_x ON users(x_user_id)",
  );
  return db;
}

/** 老库补列：SQLite 没有 ADD COLUMN IF NOT EXISTS，只能先查再改。 */
function ensureColumn(db: Db, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

export function countUsers(db: Db): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  return Number(row.n ?? 0);
}
