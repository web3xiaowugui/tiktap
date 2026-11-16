import { registerRoutes } from "./api.ts";
import { countUsers, openDb } from "./db.ts";
import { seedMarkets } from "./markets.ts";
import { Router, startServer } from "./http.ts";
import { publicClient, RPC_URL, tryGetBlockNumber } from "./chain.ts";

const db = openDb();
seedMarkets(db);
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
    blockNumber,
    chainTime: latest ? Number(latest.timestamp) : null,
    serverTime: Math.floor(Date.now() / 1000),
  };
});

registerRoutes(router, db);

const port = Number(process.env.PORT ?? 8787);
startServer(router, port);
