# contracts

Foundry 工程。合约本身**不引入任何 Solidity 依赖**（ERC20 与权限都自己写），只有测试用到 `forge-std`。

## 前提

Foundry v1.9.0 已装（`forge` / `cast` / `anvil` / `chisel` 在 `%USERPROFILE%\.foundry\bin`，已加入用户 PATH）。
`forge-std` 是 vendored 依赖（`contracts/lib/forge-std`，不进版本库），第一次拉代码后跑一次：

```bash
pnpm contracts:setup
```

## 两种测试方式

**1. 逻辑测试（不需要节点）** —— `forge test` 跑在内存 EVM 里，毫秒级：

```bash
pnpm contracts:test              # 全部
forge test --root contracts -vvv # 看 trace
forge test --root contracts --match-test testSettle -vv
```

这一层用来钉死合约逻辑：轮次派生、封盘窗口、结算、派奖、单边退款、重复领取、舍入。

**2. 本地节点（集成测试）** —— 真实的 JSON-RPC，用来部署 + 模拟后端发交易：

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
需要恢复干净状态时重启 anvil；想保留状态可以用 `anvil --dump-state state.json` / `--load-state state.json`。

## 计划中的合约

| 文件 | 职责 |
|---|---|
| `src/TikTapToken.sol` | 下注代币，公开 `mint`（每地址上限） |
| `src/PoolMarket.sol` | 彩池：`bet` / `settle`(operator only) / `claim`，地址白名单 |

轮次不由合约单独存状态，直接由区块号派生：`roundIndex = (block.number - ANCHOR_BLOCK) / 600`，一轮前 300 块可下注。
