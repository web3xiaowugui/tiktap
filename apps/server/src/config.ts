import { type Address, type Hex } from "viem";
import { currentEnv, type AppEnv } from "./runtime.ts";

function prefixFor(env: AppEnv): string {
  if (env === "testnet") return "TESTNET_";
  if (env === "mainnet") return "MAINNET_";
  return "";
}

/**
 * 一个后端进程同时服务 dev / testnet：
 *   dev      -> RPC_URL / POOL_MARKET_ADDRESS / ...
 *   testnet  -> TESTNET_RPC_URL / TESTNET_POOL_MARKET_ADDRESS / ...
 */
export function readConfig(env: AppEnv = currentEnv()) {
  const prefix = prefixFor(env);
  const read = (name: string): string => (process.env[`${prefix}${name}`] ?? "").trim();
  const readShared = (name: string): string => (process.env[name] ?? "").trim();

  const market = read("POOL_MARKET_ADDRESS");
  const operatorPkey = read("OPERATOR_PKEY");
  const gasTopUpWei = BigInt(read("GAS_TOPUP_WEI") || "0");

  const tokens: Record<string, Address> = {};
  for (const symbol of ["TEST", "OKB", "BEM"]) {
    const value = read(`${symbol}_TOKEN_ADDRESS`);
    if (value) tokens[symbol] = value as Address;
  }

  return {
    env,
    market: market ? (market as Address) : null,
    operatorPkey: operatorPkey ? (operatorPkey as Hex) : null,
    gasTopUpWei,
    tokens,
    chainId: Number(read("CHAIN_ID") || "195"),
    rpcUrl: read("RPC_URL") || "http://127.0.0.1:8545",
    walletEncKey: read("WALLET_ENC_KEY"),
    publicBaseUrl: (readShared("PUBLIC_BASE_URL") || "http://127.0.0.1:8787").replace(/\/+$/, ""),
    webBaseUrl: (readShared("WEB_BASE_URL") || "http://127.0.0.1:5173").replace(/\/+$/, ""),
    xClientId: read("X_CLIENT_ID") || readShared("X_CLIENT_ID"),
    xClientSecret: read("X_CLIENT_SECRET") || readShared("X_CLIENT_SECRET"),
  };
}

export type ChainConfig = ReturnType<typeof readConfig>;