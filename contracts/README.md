# contracts

Foundry 工程。合约本身**不引入任何 Solidity 依赖**（ERC20 与权限都自己写），只有测试用 `forge-std`。

## 前提

Foundry v1.9.0 已装（`forge` / `cast` / `anvil` / `chisel` 在 `%USERPROFILE%\.foundry\bin`，已加入用户 PATH）。
`forge-std` 是 vendored 依赖（`contracts/lib/forge-std`，不进版本库），第一次拉代码后跑一次：

```bash
pnpm contracts:setup
```

## 两种测试方式

**1. 逻辑测试（不需要节点）** —— `forge test` 跑在内存 EVM 里，全套 35 个用例约 10ms：

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

后端把 `RPC_URL` 指向它就能读到真实块高（`GET /api/health` 会显示 `blockNumber` / `chainTime`）。

## 合约

### `src/TikTapToken.sol`

下注代币，ERC20 子集（`transfer` / `approve` / `transferFrom`，无 `permit`、无回调）。

- 公开 `mint(amount)`：任何人可领，**单地址累计上限 `mintCap`**（部署时传入，默认 1000e18）
- 无限授权（`type(uint256).max`）不递减，省掉一次 approve 的 gas

### `src/PoolMarket.sol`

二元彩池：一轮里押「涨」或「跌」，赢的一边按份额分掉整个池子。

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `ROUND_BLOCKS` | 600 | 一轮 600 个区块（约 10 分钟） |
| `BETTING_BLOCKS` | 300 | 每轮前 300 块可下注，后 300 块封盘 |
| `SIDE_UP` / `SIDE_DOWN` / `SIDE_VOID` | 0 / 1 / 2 | 涨 / 跌 / 本轮作废退款 |

- **轮次不落状态**：`roundIndex = (block.number - anchorBlock) / 600`，只有「本轮池子金额」和「每人押注」上链，
  一轮接一轮跑不会累积额外写入。
- **白名单**：只有 `allowed[msg.sender]` 能 `bet`。用户私钥由后端托管、交易由后端代发，
  白名单就是「只能从我们入口进来」的那道门；`operator` 只管 `settle` 和白名单维护。
  注意：白名单**不是**靠 `msg.sender` 自动实现的权限——合约里显式校验 `allowed`。
- **下注只在当前轮**：`bet(side, amount)` 不接受轮次参数，合约自己取 `currentRound()`，
  封盘后 revert `BettingClosed`，避免前端传入已结束的轮次。
- **结算**：`settle(roundIndex, winner)` 仅 operator，必须 `block.number >= roundEnd(roundIndex)`，不可重复。
- **派奖**：`claim(roundIndex)`，`payout = 自己押注 × 池子总额 / 赢家池`，向下取整，余下零头留在合约
  （不做二次分配，量级是 wei）。
- **退款**：`winner == SIDE_VOID`，或某一边金额为 0（单边池）时，两边都按原额退回。
- **重入**：先置 `claimed` 再转账。
- `previewClaim` 是给前端显示「预计可领」的只读计算。

### 部署

```bash
# 默认打到本地 anvil（需要先 PRIVATE_KEY 环境变量，forge 读它）
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 pnpm contracts:deploy

# 其它网络：用原始命令，把 --rpc-url 换掉
forge script script/Deploy.s.sol:Deploy --root contracts \
  --rpc-url https://rpc.xlayer.tech --broadcast --private-key $PRIVATE_KEY
```

`anchorBlock` 取部署时的块高，所以在本地链上部署完立刻从第 0 轮开始下注。可选环境变量：
`OPERATOR_ADDRESS`（默认 = 部署者）、`MINT_CAP`（默认 `1000e18`）。

## 本地跑一遍完整流程

```bash
pnpm contracts:node                      # 终端 A
PRIVATE_KEY=0xac09... pnpm contracts:deploy   # anvil 默认账户 0

# 从 anvil 账户 1 下注（先放行 + 领币 + 授权）
cast send $MARKET "setAllowed(address,bool)" $USER1 true --private-key $OP_KEY ...
cast send $TOKEN  "mint(uint256)" 3000000000000000000   --private-key $USER1_KEY ...
cast send $TOKEN  "approve(address,uint256)" $MARKET $MAX --private-key $USER1_KEY ...
cast send $MARKET "bet(uint8,uint256)" 0 3000000000000000000 --private-key $USER1_KEY ...

cast rpc anvil_mine 0x258                # 快进 600 块，结束本轮
cast send $MARKET "settle(uint256,uint8)" 0 0 --private-key $OP_KEY ...
cast send $MARKET "claim(uint256)" 0 --private-key $USER1_KEY ...
```

实测结果（涨 3 + 跌 1）：赢家 `claim` 后余额 4e18，合约余额归零，输家 `claim` revert `NothingToClaim`。
