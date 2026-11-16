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
  return db;
}

export function countUsers(db: Db): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  return Number(row.n ?? 0);
}
