import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { currentEnv } from "./runtime.ts";

const here = dirname(fileURLToPath(import.meta.url));
const defaultDbPath = resolve(here, "../../../data/tiktap.db");
const schemaPath = resolve(here, "../schema.sql");

export type Db = DatabaseSync;

function tableExists(db: Db, table: string): boolean {
  return Boolean(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table),
  );
}

function hasColumn(db: Db, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((item) => item.name === column);
}

/** 老库补列：SQLite 没有 ADD COLUMN IF NOT EXISTS，只能先查再改。 */
function ensureColumn(db: Db, table: string, column: string, ddl: string): void {
  if (tableExists(db, table) && !hasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

/**
 * 把原来“一个环境一个库”的表升级成带 env 的单库结构。
 * 已有数据的 env 一律标成 dev；testnet 从空表开始。
 *
 * 几张带复合主键 / 唯一键的表必须重建，否则 dev 和 testnet 的
 * market_id=1、round_id 相同的数据会互相顶掉。
 */
function migrateToEnv(db: Db): void {
  const oldTables = [
    "meta",
    "users",
    "txs",
    "pools",
    "markets",
    "bets",
    "round_prices",
    "rounds",
    "quick_amounts",
    "opinions",
  ].filter((table) => tableExists(db, table) && !hasColumn(db, table, "env"));

  if (oldTables.length === 0) return;

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN IMMEDIATE");
  try {
    if (oldTables.includes("users")) {
      db.exec("DROP TABLE IF EXISTS users_new");
      db.exec(`
        CREATE TABLE users_new (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          env        TEXT NOT NULL DEFAULT 'dev',
          email      TEXT NOT NULL,
          address    TEXT NOT NULL,
          enc_pkey   TEXT NOT NULL,
          x_user_id  TEXT,
          x_handle   TEXT,
          x_name     TEXT,
          creator    TEXT,
          created_at INTEGER NOT NULL,
          UNIQUE (env, email),
          UNIQUE (env, address)
        )
      `);
      db.exec(`
        INSERT INTO users_new (id, env, email, address, enc_pkey, x_user_id, x_handle, x_name, creator, created_at)
        SELECT id, 'dev', email, address, enc_pkey, x_user_id, x_handle, x_name, creator, created_at FROM users
      `);
      db.exec("DROP TABLE users");
      db.exec("ALTER TABLE users_new RENAME TO users");
    }

    if (oldTables.includes("markets")) {
      db.exec("DROP TABLE IF EXISTS markets_new");
      db.exec(`
        CREATE TABLE markets_new (
          env           TEXT NOT NULL DEFAULT 'dev',
          market_id     INTEGER NOT NULL,
          symbol        TEXT NOT NULL DEFAULT '',
          bet_token     TEXT NOT NULL DEFAULT '',
          token_address TEXT,
          enabled       INTEGER NOT NULL DEFAULT 1,
          sort_order    INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (env, market_id),
          UNIQUE (env, symbol, bet_token)
        )
      `);
      db.exec(`
        INSERT INTO markets_new (env, market_id, symbol, bet_token, token_address, enabled, sort_order)
        SELECT 'dev', market_id, symbol, bet_token, token_address, enabled, sort_order FROM markets
      `);
      db.exec("DROP TABLE markets");
      db.exec("ALTER TABLE markets_new RENAME TO markets");
    }

    if (oldTables.includes("round_prices")) {
      db.exec("DROP TABLE IF EXISTS round_prices_new");
      db.exec(`
        CREATE TABLE round_prices_new (
          env          TEXT NOT NULL DEFAULT 'dev',
          symbol       TEXT NOT NULL,
          round_id     INTEGER NOT NULL,
          start_block  INTEGER,
          lock_time    INTEGER,
          lock_price   TEXT,
          settle_time  INTEGER,
          settle_price TEXT,
          source       TEXT NOT NULL DEFAULT 'okx-1m',
          updated_at   INTEGER,
          PRIMARY KEY (env, symbol, round_id)
        )
      `);
      db.exec(`
        INSERT INTO round_prices_new (env, symbol, round_id, start_block, lock_time, lock_price, settle_time, settle_price, source, updated_at)
        SELECT 'dev', symbol, round_id, start_block, lock_time, lock_price, settle_time, settle_price, source, updated_at FROM round_prices
      `);
      db.exec("DROP TABLE round_prices");
      db.exec("ALTER TABLE round_prices_new RENAME TO round_prices");
    }

    if (oldTables.includes("pools")) {
      db.exec("DROP TABLE IF EXISTS pools_new");
      db.exec(`
        CREATE TABLE pools_new (
          env          TEXT NOT NULL DEFAULT 'dev',
          market_id    TEXT NOT NULL,
          round_id     INTEGER NOT NULL,
          side         INTEGER NOT NULL,
          amount       TEXT NOT NULL,
          participants INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (env, market_id, round_id, side)
        )
      `);
      db.exec(`
        INSERT INTO pools_new (env, market_id, round_id, side, amount, participants)
        SELECT 'dev', market_id, round_id, side, amount, participants FROM pools
      `);
      db.exec("DROP TABLE pools");
      db.exec("ALTER TABLE pools_new RENAME TO pools");
    }

    if (oldTables.includes("rounds")) {
      db.exec("DROP TABLE IF EXISTS rounds_new");
      db.exec(`
        CREATE TABLE rounds_new (
          env          TEXT NOT NULL DEFAULT 'dev',
          market_id    TEXT NOT NULL,
          round_id     INTEGER NOT NULL,
          settle_price TEXT,
          winner_side  INTEGER,
          total        TEXT,
          settled_at   INTEGER,
          PRIMARY KEY (env, market_id, round_id)
        )
      `);
      db.exec(`
        INSERT INTO rounds_new (env, market_id, round_id, settle_price, winner_side, total, settled_at)
        SELECT 'dev', market_id, round_id, settle_price, winner_side, total, settled_at FROM rounds
      `);
      db.exec("DROP TABLE rounds");
      db.exec("ALTER TABLE rounds_new RENAME TO rounds");
    }

    if (oldTables.includes("quick_amounts")) {
      db.exec("DROP TABLE IF EXISTS quick_amounts_new");
      db.exec(`
        CREATE TABLE quick_amounts_new (
          env        TEXT NOT NULL DEFAULT 'dev',
          symbol     TEXT NOT NULL,
          amounts    TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (env, symbol)
        )
      `);
      db.exec(`
        INSERT INTO quick_amounts_new (env, symbol, amounts, updated_at)
        SELECT 'dev', symbol, amounts, updated_at FROM quick_amounts
      `);
      db.exec("DROP TABLE quick_amounts");
      db.exec("ALTER TABLE quick_amounts_new RENAME TO quick_amounts");
    }

    if (oldTables.includes("meta")) {
      db.exec("DROP TABLE IF EXISTS meta_new");
      db.exec(`
        CREATE TABLE meta_new (
          env   TEXT NOT NULL DEFAULT 'dev',
          key   TEXT NOT NULL,
          value TEXT NOT NULL,
          PRIMARY KEY (env, key)
        )
      `);
      db.exec(`
        INSERT INTO meta_new (env, key, value)
        SELECT 'dev', key, value FROM meta
      `);
      db.exec("DROP TABLE meta");
      db.exec("ALTER TABLE meta_new RENAME TO meta");
    }

    // 无复合键冲突的表直接补列即可，保留原有外键和索引。
    for (const table of ["txs", "bets", "opinions"]) {
      if (oldTables.includes(table)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN env TEXT NOT NULL DEFAULT 'dev'`);
      }
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

/** 打开（或创建）本地库，并把 schema 幂等地应用一遍。 */
export function openDb(path: string = process.env.DB_PATH ?? defaultDbPath): Db {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");

  // 先补旧字段，再做 env 迁移，最后建新表 / 新索引。
  ensureColumn(db, "users", "x_user_id", "x_user_id TEXT");
  ensureColumn(db, "users", "x_handle", "x_handle TEXT");
  ensureColumn(db, "users", "x_name", "x_name TEXT");
  ensureColumn(db, "opinions", "bet_amount_wei", "bet_amount_wei TEXT");
  ensureColumn(db, "opinions", "bet_side", "bet_side INTEGER");
  ensureColumn(db, "opinions", "bet_count", "bet_count INTEGER");
  ensureColumn(db, "bets", "fee_wei", "fee_wei TEXT");
  migrateToEnv(db);

  db.exec(readFileSync(schemaPath, "utf8"));
  db.exec("DROP INDEX IF EXISTS idx_users_x");
  db.exec("CREATE UNIQUE INDEX idx_users_x ON users(env, x_user_id)");
  return db;
}

export function countUsers(db: Db): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE env = ?")
    .get(currentEnv()) as { n: number };
  return Number(row.n ?? 0);
}
