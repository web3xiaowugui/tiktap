import { useSyncExternalStore } from "react";

export type AppEnvironment = "dev" | "testnet" | "mainnet";

export interface EnvironmentOption {
  id: AppEnvironment;
  label: string;
}

const STORAGE_KEY = "tiktap.environment.v1";
const KNOWN_ENVS: AppEnvironment[] = ["dev", "testnet", "mainnet"];

/** 接口还没回来时的兜底标签；线上以 /api/envs 返回的为准。 */
export const ENVIRONMENT_LABELS: Record<AppEnvironment, string> = {
  dev: "开发环境",
  testnet: "X Layer Testnet",
  mainnet: "X Layer 主网",
};

let options: EnvironmentOption[] = [
  { id: "dev", label: ENVIRONMENT_LABELS.dev },
  { id: "testnet", label: ENVIRONMENT_LABELS.testnet },
];
let optionsLoaded = false;

function readStored(): AppEnvironment | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw !== null && (KNOWN_ENVS as string[]).includes(raw)
      ? (raw as AppEnvironment)
      : null;
  } catch {
    return null;
  }
}

/**
 * 当前环境：以本地选择为准；如果后端配置的 APP_ENVS 里没有这个环境
 * （比如线上只开 testnet,mainnet），自动回落到第一个启用的环境。
 */
export function readEnvironment(): AppEnvironment {
  const stored = readStored();
  if (stored && (!optionsLoaded || options.some((item) => item.id === stored))) {
    return stored;
  }
  return options[0]?.id ?? "dev";
}

export function getEnvironmentOptions(): EnvironmentOption[] {
  return options;
}

export function environmentLabel(environment: AppEnvironment): string {
  return (
    options.find((item) => item.id === environment)?.label ??
    ENVIRONMENT_LABELS[environment]
  );
}

/** 用 GET /api/envs 的结果更新可选环境；当前选择失效时自动切到第一个。 */
export function applyEnvironmentOptions(list: Array<{ id: string; label?: string }>): void {
  const valid = list
    .filter((item): item is { id: AppEnvironment; label?: string } =>
      (KNOWN_ENVS as string[]).includes(item.id),
    )
    .map((item) => ({
      id: item.id,
      label: item.label?.trim() || ENVIRONMENT_LABELS[item.id],
    }));
  if (valid.length === 0) return;

  options = valid;
  optionsLoaded = true;

  const stored = readStored();
  if (!stored || !options.some((item) => item.id === stored)) {
    try {
      localStorage.setItem(STORAGE_KEY, options[0]!.id);
    } catch {
      // non-fatal
    }
  }

  for (const listener of listeners) listener();
}

const listeners = new Set<() => void>();

function subscribeEnvironment(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 订阅当前环境；切换环境后组件会自动重渲染。 */
export function useEnvironment(): AppEnvironment {
  return useSyncExternalStore(
    subscribeEnvironment,
    readEnvironment,
    readEnvironment,
  );
}

/**
 * 软切换：只更新本地选择并通知订阅者，不整页重载。
 * useApi 把环境纳入了依赖，会自己重新拉对应环境的数据；
 * 链上时钟、余额、轮次等也都会跟着刷新。
 */
export function switchEnvironment(next: AppEnvironment): void {
  if (!options.some((item) => item.id === next)) return;
  const before = readEnvironment();
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // non-fatal
  }
  if (readEnvironment() !== before) {
    for (const listener of listeners) listener();
  }
}
