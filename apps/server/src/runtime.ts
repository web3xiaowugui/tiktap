import { AsyncLocalStorage } from "node:async_hooks";

export type AppEnv = "dev" | "testnet" | "mainnet";

const VALID_ENVS = new Set<AppEnv>(["dev", "testnet", "mainnet"]);

export const ENV_LABELS: Record<AppEnv, string> = {
  dev: "开发环境",
  testnet: "X Layer Testnet",
  mainnet: "X Layer 主网",
};

/**
 * 本进程启用的环境，按 APP_ENVS 配置（逗号分隔，顺序就是前端下拉顺序）。
 * 默认 dev,testnet；线上部署只想要测试网+主网时设 APP_ENVS=testnet,mainnet。
 */
export function enabledEnvs(): AppEnv[] {
  const raw = (process.env.APP_ENVS ?? "").trim();
  const picked = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is AppEnv => VALID_ENVS.has(item as AppEnv));
  const unique = [...new Set(picked)];
  return unique.length > 0 ? unique : ["dev", "testnet"];
}

const storage = new AsyncLocalStorage<AppEnv>();

export function normalizeEnv(value: string | null | undefined): AppEnv {
  const raw = (value ?? "").trim().toLowerCase();
  const enabled = enabledEnvs();
  return enabled.includes(raw as AppEnv) ? (raw as AppEnv) : enabled[0]!;
}

/** 当前请求所属环境；没有请求上下文时回落到 APP_ENV（脚本/启动用）。 */
export function currentEnv(): AppEnv {
  return storage.getStore() ?? normalizeEnv(process.env.APP_ENV);
}

export function runWithEnv<T>(env: AppEnv, task: () => T): T {
  return storage.run(env, task);
}
