import { createPublicClient, defineChain, http } from "viem";

export const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
export const CHAIN_ID = Number(process.env.CHAIN_ID ?? 195);

/** X Layer（默认测试网 195）。本地开发时把 RPC_URL 指向 anvil。 */
export const xlayer = defineChain({
  id: CHAIN_ID,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

export const publicClient = createPublicClient({
  chain: xlayer,
  transport: http(RPC_URL, { timeout: 10_000, retryCount: 2 }),
});

export async function tryGetBlockNumber(): Promise<string | null> {
  try {
    return (await publicClient.getBlockNumber()).toString();
  } catch {
    return null;
  }
}
