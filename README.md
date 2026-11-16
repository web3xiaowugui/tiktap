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
| GET | `/api/bet-tokens` | 下注代币（BEM / OKB / TEST） |
| GET | `/api/sidebar-menu` | 侧栏一级 Tab 与二级分类 |
| GET | `/api/leaderboard` | 排行榜 |
| GET | `/api/markets` | 市场表（标的×下注代币 → marketId） |
| GET | `/api/pools?market&token&round` | 涨/跌池、人数、获胜方、marketId（配了合约读链上 `pools`） |
| GET | `/api/my-bet?market&token&round&address` | 我在本轮的仓位、可领金额（配了合约读链上 `stakeOf`/`previewClaim`） |
| GET | `/api/wallet/:address` | 原生币 + 三个下注代币的真实余额 |
| GET/PUT | `/api/quick-amounts/:symbol` | 5 个快捷金额（存 SQLite） |
| GET | `/api/candles?symbol&timeframe` | 预算好的 K 线（确定性生成；1m 实时行情由前端直连 OKX，见下） |
| GET | `/api/holders` `feed` `activity` | 持有人 / 动态 / 成交（按 symbol+round） |
| GET | `/api/holdings?address` | 我的持仓（配了合约只返回当前轮 + 上一轮还没开奖的仓位） |
| GET | `/api/profiles/:handle` `+ /positions` `+ /activity` | 个人主页三块 |
| GET | `/api/profiles/:handle/equity?range=24h\|7d\|30d` | 组合曲线 |
| GET | `/api/auth/x/start` | 返回 X 授权地址（state + PKCE，服务端生成） |
| GET | `/api/auth/x/callback` | X 授权回调：换 token、取 users/me，302 回前端带一次性票据 |
| POST | `/api/auth/x/session` | 票据换账号资料，随后前端建/复用托管账户 |
| POST | `/api/auth/demo` `/api/auth/signout` | 演示登录 / 登出 |

模拟数据在后端 `apps/server/src/data/mockData.ts`（原前端文件整体搬入），要改数值只改这一处。

**K 线是例外**：1m 实时行情由浏览器直连 OKX 公共接口（`apps/web/src/api/liveMarket.ts`）。免费额度按用户 IP 分摊，服务端既不吃额度也不需要存 K 线；`/api/candles` 只提供确定性生成的演示数据。

登录态仍存在浏览器 localStorage（前端会话，不含敏感信息）。

**X 账号登录**走真实 OAuth 2.0 授权码 + PKCE（[x-oauth.ts](apps/server/src/x-oauth.ts)）：

1. 在 https://developer.x.com 建 OAuth 2.0 应用，Client type 选 Web App / Native App，回调地址填 `http://127.0.0.1:8787/api/auth/x/callback`；
2. `.env` 填 `X_CLIENT_ID`、`X_CLIENT_SECRET`（公开客户端可不填 Secret）、`PUBLIC_BASE_URL`、`WEB_BASE_URL`；
3. 前端点「使用 X 账号登录」→ `GET /api/auth/x/start` → 跳 X 授权 → 回调换 token 取 `users/me` → 302 回 `WEB_BASE_URL/?x_ticket=…` → `POST /api/auth/x/session` 换资料 → 走托管建号；`users.x_user_id` 存 X 数字 id，同一个 id 永远复用同一个托管地址（改 handle 不影响）。

没配置 `X_CLIENT_ID` 时该接口返回 503 并说明缺什么；授权失败会带 `?x_error=` 回来提示。

#### 链上写操作（已接通，anvil 上端到端验证过）

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| POST | `/api/users` | 建号：生成托管地址 → 加密私钥入库 → 合约 `setAllowed` →（可选）打一点原生币当 gas |
| GET | `/api/users/:address` | 查已建号用户 |
| POST | `/api/faucet` | 用用户地址 `mint` 体验币（gas 由用户地址出） |
| POST | `/api/bet` | 校验 → 首次补一次无限 `approve` → `bet(marketId, side, amount)` → txHash 落 `txs` → 查 receipt 回填 |
| POST | `/api/markets/sync` | 按 `markets` 表把 `marketId → 代币地址` 同步到链上（幂等，配置不一致才发交易） |
| GET | `/api/round` | 当前轮次、是否可下注、轮首/轮末区块、窗口剩余块数 |
| POST | `/api/settle` | 结算单个市场（不传 `winner` 就按行情判涨跌） |
| POST | `/api/settle/round` | 结算一整轮：每个标的判一次涨跌，只对真有下注的市场发交易 |
| POST | `/api/claim` | 用户领奖（份额由合约计算） |

```bash
POST /api/bet
{"address":"0x…","market":"BTC","betToken":"TEST","side":"long","amount":"10"}
```

`side` 取 `long` / `short`；`amount` 是按代币单位（18 位小数）的字符串，后端用 `parseUnits` 转 wei。
同一个地址的写操作串行排队（`withAddressLock`），并发请求不会撞 nonce。

#### 前端怎么连（全部已接通）

| 界面动作 | 实际调用 |
| --- | --- |
| 登录（X 账号或演示账号） | 先复用 localStorage 里的托管地址，查不到就 `POST /api/users` 建号；地址写回会话 |
| 可用余额 / 代币列表 | `GET /api/wallet/:address` → 覆盖 `/api/bet-tokens` 里的 mock 余额 |
| 「领币」 | `POST /api/faucet`（每地址有 mint 上限，gas 从用户地址出） |
| Tap涨 / Tap跌 | `POST /api/bet`（`address` + URL 上的 `?symbol=` + 选中的下注代币 + 输入金额）；提交中按钮置灰，封盘后禁用并提示 |
| 池子数字 / 人数 | `GET /api/pools` → 链上 `pools(round, marketId)`；人数从 `txs` 统计（合约只存金额，不存地址列表） |
| 我的下注 / 收到多少 / 领取 | `GET /api/my-bet` → `stakeOf` + `previewClaim` + `claimed`；几千块后出现「领取」按钮走 `POST /api/claim` |
| 我的持仓 | `GET /api/holdings?address` → 只列当前轮（下注中）和上一轮（待开奖）的仓位，已开奖的不在这里 |
| 轮次 / 倒计时 / 封盘 | `GET /api/round`（每 4s 轮询一次，块高用本地时钟外推）；网格按合约的 `anchor + 300n` 算（每 300 块起一轮、每轮 600 块，所以相邻两轮重叠一半：一轮在下注期，上一轮在封盘期） |

K 线仍是浏览器直连 OKX（见上），行情不进后端。观点 / 动态 / 持有人 / 排行榜 / 个人主页仍是后端 mock 数据，还没上链、也没进 SQLite。

#### 结算怎么判涨跌

一轮 = 600 块 ≈ 600 秒，所以拿「轮首那一分钟」和「轮末那一分钟」的两根 1m K 线比收盘价：

```bash
POST /api/settle/round
{"roundIndex": 0}                        # 不给结果 → 后端起 OKX 1m K 线判涨跌
{"roundIndex": 0, "winners": {"BTC": "long"}}   # 给结果 → 不查行情，直接按指定结果结算
```

- **同一标的的所有下注代币共用同一个涨跌结果**（BTC/BEM、BTC/OKB、BTC/TEST 一起结算），但每笔各自结算、各自派奖。
- **价格落库**：每轮的锁定价格（轮次开始那一分钟 1m K 线收盘价）和开奖价格（轮次结束那一分钟收盘价）存在 `round_prices(symbol, round_id)`；轮首那根 K 线收盘后由自动结算任务写入锁定价，结算时写开奖价，之后一律读库、不再重复请求行情。
- **只结算真有下注的市场**：两边都是 0 的市场发交易也是空转，直接跳过并回报原因。
- **行情必须精确覆盖那两分钟**，缺一根就报错、绝不用过期 K 线凑数（避免「开盘=收盘」永远判涨）。本地 `anvil_mine` 快进会让链上时间跑到真实时间前面，这时请用显式 `winners`。
- **单边池自动退款**：只有一边有人押，或显式传 `void`，合约按原额退回，不用 operator 额外处理。
- **自动结算**：服务启动后每 3 秒检查「上一轮 / 上上轮」里还没结算且有下注的市场，自动判价并结算（`AUTO_SETTLE=0` 可关掉）。

结算之后用户就能领：

```bash
POST /api/claim
{"address":"0x…","market":"BTC","betToken":"TEST","roundIndex":0}
```
同一个地址的写操作串行排队（`withAddressLock`），并发请求不会撞 nonce。

### 合约

| 文件 | 内容 |
| --- | --- |
| `contracts/src/TikTapToken.sol` | 下注代币，公开 `mint` + 单地址上限 |
| `contracts/src/PoolMarket.sol` | 二元彩池：市场 = 标的×下注代币（每市场绑一个 ERC20），池子 = (市场, 轮次)；白名单、每 300 块起一轮（每轮 600 块 = 300 下注 + 300 封盘，两轮重叠）、operator 结算、按份额派奖、单边退款 |

```bash
pnpm contracts:test      # 41 个用例，内存 EVM，约 12ms
pnpm contracts:node      # anvil：1 秒一块、chain id 195、RPC 8545
PRIVATE_KEY=0x... pnpm contracts:deploy   # 部署到本地 anvil
```

Foundry v1.9.0 已安装（`forge` / `cast` / `anvil` / `chisel` 在 `%USERPROFILE%\.foundry\bin`，已加入用户 PATH）。合约本身**不引入任何 Solidity 依赖**（ERC20 与权限自己写）；只有测试用 vendored 的 `forge-std`（新环境跑一次 `pnpm contracts:setup`）。细节（常量、白名单、派奖取整、本地完整流程）见 [contracts/README.md](contracts/README.md)。

## 设计要点

- **单一入口**：用户地址在库里托管，后端用用户私钥签名发交易；合约用 `allowed` 地址白名单挡住外部钱包（`bet` 显式校验，不依赖 `msg.sender` 的身份含义），`settle` 仅 operator。所有写操作必经后端，所以一定有 txHash，DB 与链不会漂。
- **数据准确**：每笔写操作 `pending` 落库 → 查 receipt → `confirmed`；`tx_hash` 唯一键保证幂等；重启时补查超时的 pending，不需要链上索引器。
- **轮次**：合约按区块高度派生 roundId（每 300 块起一轮、每轮 600 块：前 300 下注、后 300 封盘等结算），任意时刻同时有一轮在下注、一轮在封盘，两者重叠 300 块；前端与后端共用 `packages/shared/src/rounds.ts` 的常量。`markets` 表（`symbol + bet_token → market_id`）是「前端 symbol ↔ 链上 marketId」的唯一映射。
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

见 `.env.example`。必须自己生成 `WALLET_ENC_KEY`（`openssl rand -hex 32`），它用于 AES-256-GCM 加密用户私钥。

链上写操作还需要：`POOL_MARKET_ADDRESS` 与三个代币地址（`TEST_TOKEN_ADDRESS` / `OKB_TOKEN_ADDRESS` / `BEM_TOKEN_ADDRESS`，`pnpm contracts:deploy` 会打印）、`OPERATOR_PKEY`（只用于 `setAllowed` / `setMarket` / `settle`，不碰用户的钱）。本地演示可设 `GAS_TOPUP_WEI` 给新地址打 gas，主网应留空。自动结算默认开启，设 `AUTO_SETTLE=0` 关闭（本地用 `anvil_mine` 快进时建议关掉，改用 `/api/settle/round` 显式指定结果）。

## 说明

演示项目，与 FOMO Labs 无关联，不提供真实交易服务。界面中的名称、数值和头像均为模拟数据。
