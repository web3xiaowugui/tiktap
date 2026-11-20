# contracts

Foundry 工程。合约本身**不引入任何 Solidity 依赖**（ERC20 与权限都自己写），只有测试用 `forge-std`。

## 前提

Foundry v1.9.0 已装（`forge` / `cast` / `anvil` / `chisel` 在 `%USERPROFILE%\.foundry\bin`，已加入用户 PATH）。
`forge-std` 是 vendored 依赖（`contracts/lib/forge-std`，不进版本库），第一次拉代码后跑一次：

```bash
pnpm contracts:setup
```

## 两种测试方式

**1. 逻辑测试（不需要节点）** —— `forge test` 跑在内存 EVM 里，全套 41 个用例约 12ms：

```bash
pnpm contracts:test              # 全部
forge test --root contracts -vvv # 看 trace
forge test --root contracts --match-test testSettle -vv
```

**2. 本地节点（集成测试）** —— 真实 JSON-RPC，用来部署 + 模拟后端发交易：

```bash
pnpm contracts:node    # anvil --block-time 1 --chain-id 195
```

| 项 | 值 |
| --- | --- |
| RPC | `http://127.0.0.1:8545` |
| chain id | `195`（与后端 `.env` 的 `CHAIN_ID` 默认值一致） |
| 出块 | 1 秒一块（与前端 `XLAYER_BLOCK_TIME_MS` / 600 块一轮的假设一致） |
| 预置账户 | 10 个，各 10000 ETH（anvil 默认助记词） |

## 两个合约

### `src/TikTapTestToken.sol`（新版 TEST，线上在用）

下注代币，ERC20 子集（`transfer` / `approve` / `transferFrom`，无 `permit`、无回调）。

- **总量无上限**：`mint` 只受 minter 权限约束
- **只有 minter（后端 operator）能铸**，`mint(address to, uint256 amount)` 可铸给任意地址
- **单地址不限量**：没有 per-address 上限，领多少都行
- minter 可用 `transferMinter` 轮换（换 operator 私钥时用）
- 无限授权（`type(uint256).max`）不递减

### `src/TikTapToken.sol`（V1，已废弃）

第一版体验币：公开 `mint(amount)`，单地址累计上限 `mintCap`（默认 1000e18）。
只能单地址限铸，不能改造，所以被上面的 V2 替换；BEM 仍在用它做演示币。

### `src/PoolMarket.sol`

二元彩池。**市场 = 标的 × 下注代币**（类似交易对：BTC/OKB、BTC/BEM、BTC/TEST），
**池子的最小单位 = 某市场的某一轮**，彼此完全独立（各自算金额、各自结算、各自派奖，各付各的代币）。

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `ROUND_BLOCKS` | 600 | 一轮 600 个区块（约 10 分钟） |
| `BETTING_BLOCKS` | 300 | 每轮前 300 块可下注，后 300 块封盘 |
| `SIDE_UP` / `SIDE_DOWN` / `SIDE_VOID` | 0 / 1 / 2 | 涨 / 跌 / 本轮作废退款 |

接口：

```solidity
bet(uint8 marketId, uint8 side, uint256 amount)            // 白名单 + 当前轮 + 该市场已启用
settle(uint8 marketId, uint256 roundIndex, uint8 winner)   // 仅 operator
claim(uint8 marketId, uint256 roundIndex)                  // 付该市场的代币
previewClaim(uint8 marketId, uint256 roundIndex, address user) view  // 到手数量（已扣领奖费）
previewClaimGross(uint8 marketId, uint256 roundIndex, address user) view // 扣费前的派奖
setMarket(uint8 marketId, address token, bool enabled)     // 仅 operator
setAllowed / setAllowedBatch / setOperator                 // 仅 operator

// 手续费（仅 operator）
setDefaultFees(uint16 betBps, uint16 claimBps)
setMarketFees(uint8 marketId, uint16 betBps, uint16 claimBps)
clearMarketFees(uint8 marketId)
setFeeRecipient(address)
betFeeBps(uint8 marketId) / claimFeeBps(uint8 marketId) view
roundClaimFeeBps(uint256 roundIndex, uint8 marketId) view  // 结算时的领奖费快照
```

- **市场各自绑定一个 ERC20**：`markets[marketId].token`。下注按该代币 pull，派奖也按该代币付。
  同一个合约地址管理所有市场，所以用户对每种代币各 `approve` 一次就够，不随市场数增长。
- **marketId 由后端分配**：`markets` 表里 `symbol + bet_token → market_id`，一旦分配不再改；
  后端启动时按表调用 `setMarket`，所以脚本和数据库不会各写一份。
- **轮次不落状态**：`roundIndex = (block.number - anchorBlock) / 600`。
- **白名单**：`allowed[msg.sender]` 显式校验（不是靠 `msg.sender` 的身份含义）。
  用户私钥由后端托管、交易由后端代发，白名单就是「只能从我们入口进来」的那道门。
- **下注只在当前轮**：`bet` 不接受轮次参数，合约自己取 `currentRound()`，封盘后 revert `BettingClosed`。
- **派奖**：`payout = 自己押注 × 池子总额 / 赢家池`，向下取整，零头留合约（不做二次分配）。
- **退款**：`winner == SIDE_VOID`，或某一边金额为 0（单边池）→ 两边都原额退回。
- **重入**：先置 `claimed` 再转账。

### 手续费

- 单位是 bps，`1% = 100`，上限 `10_000`（100%）；**默认 0，即不收费**。
- 全局默认 `defaultBetFeeBps` / `defaultClaimFeeBps` 分开配置，互不影响。
- 每个市场可以用 `marketFees[marketId]` 覆盖；`clearMarketFees` 删掉覆盖后回退到全局默认。
- **下注费**：从下注金额里先扣，`amount - fee` 才计入用户仓位和池子；手续费立刻打给 `feeRecipient`。
  `Bet` 事件里的 amount 是净仓位，`FeeCharged(kind = 0)` 记录毛额和实际手续费。
- **领奖费**：按**结算时快照**的费率收，结算后再改费率不影响已结算轮次；
  退款轮（VOID / 单边池）不收费，本金原样退回。`Claimed` 事件里的 amount 是到手的净额。
- `feeRecipient` 默认是部署时的 `operator`，可用 `setFeeRecipient` 换成金库 / 多签。
- 前端「预计可领」用 `previewClaim`（净额）；需要展示明细时用 `previewClaimGross` 和
  `roundClaimFeeBps` 算手续费。

## 部署

```bash
# 默认打到本地 anvil（PRIVATE_KEY 由 forge 读取）
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 pnpm contracts:deploy

# 其它网络：用原始命令，把 --rpc-url 换掉
forge script contracts/script/Deploy.s.sol:Deploy --root contracts \
  --rpc-url https://rpc.xlayer.tech --broadcast --private-key $PRIVATE_KEY
```

脚本只部署合约本体（`PoolMarket` + 体验币 `TEST` + 本地 mock 的 `OKB` / `BEM`），**不配置市场**：
`marketId ↔ 代币地址` 由后端的 `markets` 表负责，避免链上和数据库两套配置打架。

`anchorBlock` 取部署时的块高。可选环境变量：`OPERATOR_ADDRESS`（默认部署者）、`MINT_CAP`（BEM 用，默认 `1000e18`）。

### 只换 TEST（不用动池子）

```bash
PRIVATE_KEY=$TESTNET_OPERATOR_PKEY MINTER_ADDRESS=$OPERATOR_ADDRESS \
  forge script contracts/script/DeployTestToken.s.sol:DeployTestToken --root contracts \
  --rpc-url https://testrpc.xlayer.tech/terigon --broadcast
```

拿到新地址后：
1. operator 调 `setMarket(marketId, newToken, true)` 把每个 TEST 市场改绑到新币；
2. 更新 `.env` 的 `TESTNET_TEST_TOKEN_ADDRESS` 和 `markets` 表的 `token_address`；
3. 旧币余额要迁移的话，operator 用 `mint(to, amount)` 等量补铸给用户；
4. 重启后端。旧池子里还压着的旧币可以留着不管，也可以按旧币余额给 `PoolMarket` 补等量新币，让历史轮次的领奖还能兑付。

## 本地跑一遍完整流程

```bash
pnpm contracts:node                              # 终端 A
PRIVATE_KEY=0xac09... pnpm contracts:deploy      # 终端 B，记下 market / 代币地址

# operator 配置市场（marketId 1 = 某个「标的×代币」组合）
cast send $MARKET "setMarket(uint8,address,bool)" 1 $TOKEN true --private-key $OP_KEY ...

# 手续费：默认 0；1% = 100 bps。下注费 / 领奖费分开配
cast send $MARKET "setDefaultFees(uint16,uint16)" 100 0 --private-key $OP_KEY ...
# 单独给 marketId 1 覆盖：下注 0、领奖 1%
cast send $MARKET "setMarketFees(uint8,uint16,uint16)" 1 0 100 --private-key $OP_KEY ...

# 用户下注（先放行 + 领币 + 授权）
cast send $MARKET "setAllowed(address,bool)" $USER1 true --private-key $OP_KEY ...
cast send $TOKEN  "mint(uint256)" 3000000000000000000      --private-key $USER1_KEY ...
cast send $TOKEN  "approve(address,uint256)" $MARKET $MAX  --private-key $USER1_KEY ...
cast send $MARKET "bet(uint8,uint8,uint256)" 1 0 3000000000000000000 --private-key $USER1_KEY ...

cast rpc anvil_mine 0x258                        # 快进 600 块，结束本轮
cast send $MARKET "settle(uint8,uint256,uint8)" 1 0 0 --private-key $OP_KEY ...
cast send $MARKET "claim(uint8,uint256)" 1 0 --private-key $USER1_KEY ...
```

## 测试覆盖

56 个用例（`TikTapToken.t.sol` + `PoolMarket.t.sol`）：

- 代币：mint 上限 / 超额 revert / 转账 / 授权递减 / 无限授权 / 余额不足
- 轮次：`vm.roll` 验证 0/1 轮边界、299→300 块封盘、封盘后不能下注
- **市场隔离**：同一轮里 BTC/OKB 与 BTC/BEM 各自成池、只结算其中一个不影响另一个、派奖付对应代币
- 权限：非白名单 / 未启用市场 / 未授权 都不能下注；只有 operator 能结算与配置
- 派奖：赢家独吞、按份额分、输家 `NothingToClaim`、重复 claim revert
- 退款：单边池全额退、VOID 双边各退各的
- 跨轮：第 0 轮与第 1 轮互不污染
- 取整：`100*700/300=233`、`200*700/300=466`，700 进池 699 派出，1 wei 零头留合约
- 手续费：默认 0 / 全局与市场覆盖 / 清除回退 / 下注扣费进池 / 领奖快照 / 退款免收 / 权限与 100% 上限
