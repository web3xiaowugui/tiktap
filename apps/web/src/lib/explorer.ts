import { readEnvironment, type AppEnvironment } from "@/lib/environment";

/** X Layer 区块浏览器（OKLink）的每环境基地址。 */
const EXPLORER_BASE: Record<AppEnvironment, string | null> = {
  dev: null,
  testnet: "https://www.oklink.com/x-layer-testnet",
  mainnet: "https://www.oklink.com/x-layer",
};

/** 交易哈希 → 区块浏览器链接；本地 dev 没有浏览器时返回 null。 */
export function txExplorerUrl(
  txHash: string,
  environment: AppEnvironment = readEnvironment(),
): string | null {
  const base = EXPLORER_BASE[environment];
  return base ? `${base}/tx/${txHash}` : null;
}
