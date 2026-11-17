import { createPublicClient, defineChain, http } from "viem";
import { readConfig } from "./config.ts";
import { currentEnv, type AppEnv } from "./runtime.ts";

interface EnvChain {
  chain: ReturnType<typeof defineChain>;
  publicClient: ReturnType<typeof createPublicClient>;
  rpcUrl: string;
  chainId: number;
}

const cache = new Map<AppEnv, EnvChain>();

function build(env: AppEnv): EnvChain {
  const cfg = readConfig(env);
  const chain = defineChain({
    id: cfg.chainId,
    name: env === "testnet" ? "X Layer Testnet" : "X Layer",
    nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
  });
  const publicClient = createPublicClient({
    chain,
    transport: http(cfg.rpcUrl, { timeout: 10_000, retryCount: 2 }),
  });
  return { chain, publicClient, rpcUrl: cfg.rpcUrl, chainId: cfg.chainId };
}

export function envChain(env: AppEnv = currentEnv()): EnvChain {
  const cached = cache.get(env);
  if (cached) return cached;
  const built = build(env);
  cache.set(env, built);
  return built;
}

export function publicClientFor(env: AppEnv = currentEnv()): ReturnType<typeof createPublicClient> {
  return envChain(env).publicClient;
}

export async function tryGetBlockNumber(env: AppEnv = currentEnv()): Promise<string | null> {
  try {
    return (await publicClientFor(env).getBlockNumber()).toString();
  } catch {
    return null;
  }
}
