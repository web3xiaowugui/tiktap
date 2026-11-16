import { publicClient } from "./chain.ts";
import { POOL_MARKET_ABI } from "./contracts.ts";
import { HttpError } from "./http.ts";
import { listMarkets } from "./markets.ts";
import { readConfig, requireOperator, walletFor, type ChainConfig } from "./tx.ts";
import type { Db } from "./db.ts";

/**
 * 把 markets 表里的「标的×代币」对同步到链上：
 * 1. 用 env 里的代币地址回填 markets.token_address（只填空值）；
 * 2. 逐行读链上配置，不一致才发 setMarket（幂等，正常启动不发交易）。
 */
export async function syncMarkets(db: Db): Promise<{
  configured: number[];
  skipped: string[];
}> {
  const cfg = readConfig();
  if (!cfg.market || !cfg.operatorPkey) {
    return { configured: [], skipped: ["未配置 POOL_MARKET_ADDRESS / OPERATOR_PKEY"] };
  }

  const configured: number[] = [];
  const skipped: string[] = [];

  for (const [symbol, address] of Object.entries(cfg.tokens)) {
    db.prepare(
      "UPDATE markets SET token_address = ? WHERE bet_token = ? AND token_address IS NULL",
    ).run(address, symbol);
  }

  const operator = walletFor(requireOperator(cfg));

  for (const row of listMarkets(db)) {
    if (!row.token_address) {
      skipped.push(`${row.symbol}/${row.bet_token}: 没有代币地址`);
      continue;
    }

    const [token, enabled] = (await publicClient.readContract({
      address: cfg.market,
      abi: POOL_MARKET_ABI,
      functionName: "markets",
      args: [row.market_id],
    })) as readonly [string, boolean];

    if (token.toLowerCase() === row.token_address.toLowerCase() && enabled === true) {
      continue;
    }

    const hash = await operator.writeContract({
      address: cfg.market,
      abi: POOL_MARKET_ABI,
      functionName: "setMarket",
      args: [row.market_id, row.token_address as `0x${string}`, true],
      chain: operator.chain,
      account: operator.account!,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    configured.push(row.market_id);
  }

  return { configured, skipped };
}

/** 让某个用户地址进入合约白名单（建号时必须做一次）。 */
export async function allowUserOnChain(
  cfg: ChainConfig,
  address: `0x${string}`,
): Promise<`0x${string}`> {
  const market = cfg.market;
  if (!market) throw new HttpError(503, "未配置 POOL_MARKET_ADDRESS");

  const already = (await publicClient.readContract({
    address: market,
    abi: POOL_MARKET_ABI,
    functionName: "allowed",
    args: [address],
  })) as boolean;
  if (already) return "0x0";

  const operator = walletFor(requireOperator(cfg));
  const hash = await operator.writeContract({
    address: market,
    abi: POOL_MARKET_ABI,
    functionName: "setAllowed",
    args: [address, true],
    chain: operator.chain,
    account: operator.account!,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
