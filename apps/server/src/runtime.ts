import { AsyncLocalStorage } from "node:async_hooks";

export type AppEnv = "dev" | "testnet" | "mainnet";

const VALID_ENVS = new Set<AppEnv>(["dev", "testnet", "mainnet"]);
const storage = new AsyncLocalStorage<AppEnv>();

export function normalizeEnv(value: string | null | undefined): AppEnv {
  const raw = (value ?? "").trim().toLowerCase();
  return VALID_ENVS.has(raw as AppEnv) ? (raw as AppEnv) : "dev";
}

/** 当前请求所属环境；没有请求上下文时回落到 APP_ENV（脚本/启动用）。 */
export function currentEnv(): AppEnv {
  return storage.getStore() ?? normalizeEnv(process.env.APP_ENV);
}

export function runWithEnv<T>(env: AppEnv, task: () => T): T {
  return storage.run(env, task);
}