# contracts

Foundry 工程。**不依赖任何 Solidity 库**（ERC20 与权限都自己写），所以不需要 `forge install` / git submodule。

## 前提

本机还没装 Foundry。安装后以下命令可用：

```bash
# 本地链（1 秒一个块，和前端假设一致）
anvil --block-time 1

# 编译 / 测试（在仓库根执行）
pnpm contracts:build
pnpm contracts:test
```

## 计划中的合约

| 文件 | 职责 |
|---|---|
| `src/TikTapToken.sol` | 下注代币，公开 `mint`（有每地址上限） |
| `src/PoolMarket.sol` | 彩池：`bet` / `settle`(operator only) / `claim`，地址白名单 |

接口约定见仓库根 `README.md` 的「后端与合约」一节。
