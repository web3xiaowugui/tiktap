import { registerRoutes } from "./api.ts";
import { countUsers, openDb } from "./db.ts";
import { seedMarkets } from "./markets.ts";
import { syncMarkets } from "./market-sync.ts";
import { Router, startServer } from "./http.ts";
import { publicClient, RPC_URL, tryGetBlockNumber } from "./chain.ts";
import { readConfig } from "./tx.ts";
import { startAutoSettler } from "./settlement.ts";

const db = openDb();
seedMarkets(db);

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
