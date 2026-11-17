export type AppEnvironment = "dev" | "testnet";

const STORAGE_KEY = "tiktap.environment.v1";

export const ENVIRONMENT_LABELS: Record<AppEnvironment, string> = {
  dev: "开发环境",
  testnet: "X Layer Testnet",
};

export function readEnvironment(): AppEnvironment {
  try {
    return localStorage.getItem(STORAGE_KEY) === "testnet" ? "testnet" : "dev";
  } catch {
    return "dev";
  }
}

/** 切换环境后整页重载，让所有 useApi 重新走对应后端的数据库。 */
export function switchEnvironment(next: AppEnvironment): void {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // non-fatal
  }
  window.location.reload();
}
