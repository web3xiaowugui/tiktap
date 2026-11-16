# TikTap — Monorepo

X Layer 二元彩池下注终端。仓库包含三端 + 一个共享包：

```
apps/web        React 19 + Vite 7 + Tailwind 4 前端（原 fomo 前端整体搬入）
apps/server     Node 26 后端：node:http + node:sqlite + viem，无需构建步骤
packages/shared 两端共享：领域类型、轮次数学
contracts       Foundry 工程（Solidity，暂无依赖库）
data/           本地 SQLite（gitignored）
```

## 快速开始

```bash
pnpm install
pnpm dev            # 同时起前端(5173) 和后端(8787)
pnpm dev:web        # 只起前端
pnpm dev:server     # 只起后端
pnpm typecheck      # 三端类型检查
pnpm build          # 构建前端到 apps/web/dist
```

前端把 `/api/*` 代理到 `http://127.0.0.1:8787`（见 `apps/web/vite.config.ts`）。

### 后端

```bash
cp .env.example .env    # 填 WALLET_ENC_KEY、OPERATOR_PKEY、RPC_URL
pnpm dev:server
curl http://127.0.0.1:8787/api/health
```

- 运行时：Node 26 直接用类型剥离跑 `.ts`，**没有编译步骤**
- 数据库：`node:sqlite`，单文件 `data/tiktap.db`，schema 在 `apps/server/schema.sql`（启动时幂等应用）
- 链交互：`viem`（唯一运行时依赖）
- 表结构：`users`（地址 + 加密私钥）、`txs`（txHash 唯一键、pending/confirmed/failed）、`markets`（标的×下注代币 → marketId）、`pools`、`rounds`、`quick_amounts`

#### 接口一览

前端只调这些（`apps/web/src/api/index.ts` 是唯一的调用点）：

| 方法 | 路径 | 返回 |
| --- | --- | --- |
| GET | `/api/health` | 服务状态、用户数、当前区块 |
| GET | `/api/tokens` / `/api/tokens/:symbol` | 交易对列表 / 单个 |
| GET | `/api/bet-tokens` | 下注代币（OKB / BEM） |
| GET | `/api/sidebar-menu` | 侧栏一级 Tab 与二级分类 |
| GET | `/api/leaderboard` | 排行榜 |
| GET | `/api/pools?market&token&round` | 涨/跌池、人数、获胜方 |
| GET | `/api/my-bet?market&token&round` | 我在本轮的仓位（可为 `null`） |
| GET/PUT | `/api/quick-amounts/:symbol` | 5 个快捷金额（存 SQLite） |
| GET | `/api/candles?symbol&timeframe` | 预算好的 K 线（确定性生成；1m 实时行情由前端直连 OKX，见下） |
| GET | `/api/holders` `feed` `activity` | 持有人 / 动态 / 成交（按 symbol+round） |
| GET | `/api/holdings` | 我的持仓 |
| GET | `/api/profiles/:handle` `+ /positions` `+ /activity` | 个人主页三块 |
| GET | `/api/profiles/:handle/equity?range=24h\|7d\|30d` | 组合曲线 |
| POST | `/api/auth/demo` `/api/auth/okx` `/api/auth/signout` | 登录 / 登出 |

模拟数据在后端 `apps/server/src/data/mockData.ts`（原前端文件整体搬入），要改数值只改这一处。

**K 线是例外**：1m 实时行情由浏览器直连 OKX 公共接口（`apps/web/src/api/liveMarket.ts`）。免费额度按用户 IP 分摊，服务端既不吃额度也不需要存 K 线；`/api/candles` 只提供确定性生成的演示数据。

登录态仍存在浏览器 localStorage（前端会话，不含敏感信息）；链上写操作（下注 / 领取）这一版还没有接口，等合约和托管钱包接通后再加。

### 合约

### 合约

| 文件 | 内容 |
| --- | --- |
| `contracts/src/TikTapToken.sol` | 下注代币，公开 `mint` + 单地址上限 |
| `contracts/src/PoolMarket.sol` | 二元彩池：市场 = 标的×下注代币（每市场绑一个 ERC20），池子 = (市场, 轮次)；白名单、600 块一轮、前 300 块可下注、operator 结算、按份额派奖、单边退款 |

```bash
pnpm contracts:test      # 35 个用例，内存 EVM，约 10ms
pnpm contracts:node      # anvil：1 秒一块、chain id 195、RPC 8545
PRIVATE_KEY=0x... pnpm contracts:deploy   # 部署到本地 anvil
```

Foundry v1.9.0 已安装（`forge` / `cast` / `anvil` / `chisel` 在 `%USERPROFILE%\.foundry\bin`，已加入用户 PATH）。合约本身**不引入任何 Solidity 依赖**（ERC20 与权限自己写）；只有测试用 vendored 的 `forge-std`（新环境跑一次 `pnpm contracts:setup`）。细节（常量、白名单、派奖取整、本地完整流程）见 [contracts/README.md](contracts/README.md)。

## 设计要点

- **单一入口**：用户地址在库里托管，后端用用户私钥签名发交易；合约用 `allowed` 地址白名单挡住外部钱包（`bet` 显式校验，不依赖 `msg.sender` 的身份含义），`settle` 仅 operator。所有写操作必经后端，所以一定有 txHash，DB 与链不会漂。
- **数据准确**：每笔写操作 `pending` 落库 → 查 receipt → `confirmed`；`tx_hash` 唯一键保证幂等；重启时补查超时的 pending，不需要链上索引器。
- **轮次**：合约按区块高度派生 roundId（600 区块一轮，前 300 可下注），前端与后端共用 `packages/shared/src/rounds.ts` 的常量。`markets` 表（`symbol + bet_token → market_id`）是「前端 symbol ↔ 链上 marketId」的唯一映射。
- **共享代码用转发壳**：`apps/web/src/api/types.ts` 与 `src/lib/rounds.ts` 只剩一行 `export * from "@tiktap/shared/…"`，所以全站 import 未改。

## 前端（apps/web）

营销首页 + 交易终端（发现 / 个人主页）。K 线用 TradingView Lightweight Charts，1 分钟行情来自 OKX 公共接口；其余数据来自 `src/api` 门面（目前仍是 mock，切后端时只替换这一层的实现）。

| 路由 | 内容 |
| --- | --- |
| `/` | 营销首页 |
| `/discover?symbol=BTC` | 交易终端：币种侧栏、K 线、观点 / 活动 / 参与者、下注面板、我的持仓 |
| `/u/:handle` | 个人主页 |

`?demo=1` 可跳过登录直接进演示账户。

## 环境变量

见 `.env.example`。生产环境必须自己生成 `WALLET_ENC_KEY`（`openssl rand -hex 32`），它用于 AES-256-GCM 加密用户私钥。

## 说明

演示项目，与 FOMO Labs 无关联，不提供真实交易服务。界面中的名称、数值和头像均为模拟数据。
