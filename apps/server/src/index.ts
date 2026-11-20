import { registerRoutes } from "./api.ts";
import { countUsers, openDb } from "./db.ts";
import { seedMarkets } from "./markets.ts";
import { backfillBetsFromTxs } from "./bets.ts";
import { backfillOpinionSnapshots } from "./opinions.ts";
import { syncMarkets } from "./market-sync.ts";
import { Router, startServer } from "./http.ts";
import { publicClientFor, tryGetBlockNumber } from "./chain.ts";
import { readConfig } from "./config.ts";
import { backfillBetResults, getRoundInfo, startAutoSettler } from "./settlement.ts";
import { backfillRoundPrices } from "./round-prices.ts";
import { currentEnv, enabledEnvs, runWithEnv, type AppEnv } from "./runtime.ts";

const db = openDb();
const ENVS: AppEnv[] = enabledEnvs();

for (const env of ENVS) {
  runWithEnv(env, () => {
    seedMarkets(db);
    const backfilledBets = backfillBetsFromTxs(db);
    if (backfilledBets > 0) {
      console.log(`[bets] ${env} 从 txs 回填了 ${backfilledBets} 条下注记录`);
    }
    const backfilledOpinions = backfillOpinionSnapshots(db);
    if (backfilledOpinions > 0) {
      console.log(`[opinions] ${env} 回填了 ${backfilledOpinions} 条观点的仓位快照`);
    }
  });
}

const router = new Router();

router.get("/api/health", async () => {
  const env = currentEnv();
  const cfg = readConfig(env);
  const blockNumber = await tryGetBlockNumber(env);
  const latest = blockNumber
    ? await publicClientFor(env).getBlock({ blockNumber: BigInt(blockNumber) })
    : null;
  return {
    ok: true,
    env,
    users: countUsers(db),
    rpc: cfg.rpcUrl,
    chainId: cfg.chainId,
    market: cfg.market,
    tokens: cfg.tokens,
    blockNumber,
    chainTime: latest ? Number(latest.timestamp) : null,
    serverTime: Math.floor(Date.now() / 1000),
  };
});

registerRoutes(router, db);

const port = Number(process.env.PORT ?? 8787);
const host = "127.0.0.1";
startServer(router, port, host);

for (const env of ENVS) {
  const cfg = readConfig(env);
  if (!cfg.market) {
    console.log(`[markets] ${env} 未配置 POOL_MARKET_ADDRESS，链上写操作不可用`);
    continue;
  }

  void runWithEnv(env, async () => {
    try {
      const synced = await syncMarkets(db);
      if (synced.configured.length > 0) {
        console.log(`[markets] ${env} 已在链上配置：${synced.configured.join(", ")}`);
      }
      if (synced.skipped.length > 0) {
        console.log(
          `[markets] ${env} 跳过 ${synced.skipped.length} 个：${synced.skipped.slice(0, 3).join("；")}`,
        );
      }
    } catch (error) {
      console.warn(`[markets] ${env} 同步失败（链上写操作暂时不可用）：`, String(error).slice(0, 200));
    }

    try {
      const filled = await backfillBetResults(db, cfg);
      if (filled > 0) {
        console.log(`[bets] ${env} 补齐了 ${filled} 组已结算轮次的下注结果`);
      }
    } catch (error) {
      console.warn(`[bets] ${env} 回填结算结果失败：`, String(error).slice(0, 200));
    }

    if (process.env.AUTO_SETTLE !== "0") {
      startAutoSettler(db, cfg, 3_000, env);
    }

    try {
      const info = await getRoundInfo(cfg);
      const result = await backfillRoundPrices(db, cfg, info.currentRound);
      if (result.attempted > 0) {
        console.log(
          `[prices] ${env} 已开奖轮次价格补齐：成功 ${result.filled}，失败 ${result.failed}`,
        );
      }
    } catch (error) {
      console.warn(`[prices] ${env} 回填已开奖轮次价格失败：`, String(error).slice(0, 200));
    }
  });
}
