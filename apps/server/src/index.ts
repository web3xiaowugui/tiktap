import { registerRoutes } from "./api.ts";
import { countUsers, openDb } from "./db.ts";
import { seedMarkets } from "./markets.ts";
import { backfillBetsFromTxs } from "./bets.ts";
import { backfillOpinionSnapshots } from "./opinions.ts";
import { syncMarkets } from "./market-sync.ts";
import { Router, startServer } from "./http.ts";
import { publicClient, RPC_URL, tryGetBlockNumber } from "./chain.ts";
import { readConfig } from "./tx.ts";
import { backfillBetResults, getRoundInfo, startAutoSettler } from "./settlement.ts";
import { backfillRoundPrices } from "./round-prices.ts";

const db = openDb();
seedMarkets(db);

const backfilledBets = backfillBetsFromTxs(db);
if (backfilledBets > 0) {
  console.log(`[bets] 从 txs 回填了 ${backfilledBets} 条下注记录`);
}

const backfilledOpinions = backfillOpinionSnapshots(db);
if (backfilledOpinions > 0) {
  console.log(`[opinions] 回填了 ${backfilledOpinions} 条观点的仓位快照`);
}

const cfg = readConfig();
if (cfg.market) {
  try {
    const synced = await syncMarkets(db);
    if (synced.configured.length > 0) {
      console.log(`[markets] 已在链上配置：${synced.configured.join(", ")}`);
    }
    if (synced.skipped.length > 0) {
      console.log(`[markets] 跳过 ${synced.skipped.length} 个：${synced.skipped.slice(0, 3).join("；")}`);
    }
  } catch (error) {
    console.warn("[markets] 同步失败（链上写操作暂时不可用）：", String(error).slice(0, 200));
  }

  try {
    const filled = await backfillBetResults(db, cfg);
    if (filled > 0) {
      console.log(`[bets] 补齐了 ${filled} 组已结算轮次的下注结果`);
    }
  } catch (error) {
    console.warn("[bets] 回填结算结果失败：", String(error).slice(0, 200));
  }
} else {
  console.log("[markets] 未配置 POOL_MARKET_ADDRESS，链上写操作不可用");
}

const router = new Router();

router.get("/api/health", async () => {
  const blockNumber = await tryGetBlockNumber();
  const latest = blockNumber
    ? await publicClient.getBlock({ blockNumber: BigInt(blockNumber) })
    : null;
  return {
    ok: true,
    users: countUsers(db),
    rpc: RPC_URL,
    chainId: cfg.chainId,
    market: cfg.market,
    tokens: cfg.tokens,
    blockNumber,
    chainTime: latest ? Number(latest.timestamp) : null,
    serverTime: Math.floor(Date.now() / 1000),
  };
});

registerRoutes(router, db);

if (cfg.market && process.env.AUTO_SETTLE !== "0") {
  startAutoSettler(db, cfg);
}

const port = Number(process.env.PORT ?? 8787);
startServer(router, port);

// 所有已结束轮次都要有开奖价，不依赖有没有下注 / 有没有人点开。
// 启动后后台补齐历史轮次；新结束的轮次由自动结算任务继续预取。
if (cfg.market) {
  void (async () => {
    try {
      const info = await getRoundInfo(cfg);
      const result = await backfillRoundPrices(db, cfg, info.currentRound);
      if (result.attempted > 0) {
        console.log(
          `[prices] 已开奖轮次价格补齐：成功 ${result.filled}，失败 ${result.failed}`,
        );
      }
    } catch (error) {
      console.warn("[prices] 回填已开奖轮次价格失败：", String(error).slice(0, 200));
    }
  })();
}
