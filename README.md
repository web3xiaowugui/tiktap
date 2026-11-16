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
- 表结构：`users`（地址 + 加密私钥）、`txs`（txHash 唯一键、pending/confirmed/failed）、`pools`、`rounds`

### 合约

```bash
anvil --block-time 1     # 本地链
pnpm contracts:build
pnpm contracts:test
```

Foundry v1.9.0 已安装（`forge` / `cast` / `anvil` / `chisel` 在 `%USERPROFILE%\.foundry\bin`，已加入用户 PATH）。合约**不引入任何依赖库**（ERC20 与权限自己写），因此不需要 `forge install`。

## 设计要点

- **单一入口**：用户地址在库里托管，后端用用户私钥签名发交易；合约用地址白名单（`onlyUser`）挡住外部钱包，`settle` 仅 operator。所有写操作必经后端，所以一定有 txHash，DB 与链不会漂。
- **数据准确**：每笔写操作 `pending` 落库 → 查 receipt → `confirmed`；`tx_hash` 唯一键保证幂等；重启时补查超时的 pending，不需要链上索引器。
- **轮次**：合约按区块高度派生 roundId（600 区块一轮，前 300 可下注），前端与后端共用 `packages/shared/src/rounds.ts` 的常量。
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
