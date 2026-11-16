# fomo web · 剪裁版

一个只做前端的 fomo 网页版复刻：营销首页 + 钱包登录弹窗 + 交易终端（发现 / 个人主页）。
账户、持仓和下单数据来自本地 mock API；K 线使用 TradingView Lightweight Charts，1 分钟数据来自 OKX 公共行情接口。不会发起真实交易或动用资金；钱包连接只读取公开地址。

## 快速开始

```bash
pnpm install
pnpm dev
```

打开 http://127.0.0.1:5173 。

也可以直接进入已登录状态：

- http://127.0.0.1:5173/discover?demo=1
- http://127.0.0.1:5173/u/end837?demo=1

正常流程是在首页点「登录」或「开始交易」，在弹窗里连接 OKX Wallet。
登录成功后进入内置演示账户，连接的地址会显示在右上角账户菜单里。
没有安装插件时，可以点「进入演示模式」，或直接访问上面的 `?demo=1` 链接。
登录状态保存在 localStorage。

## 钱包登录

目前只接入 OKX Wallet 浏览器插件：

- 通过 `window.okxwallet` / `window.ethereum.isOkxWallet` 检测插件，并兼容 EIP-6963 的延迟注入
- 调用 EIP-1193 的 `eth_requestAccounts` 获取公开地址，再读取 `eth_chainId`
- 地址、chainId 和会话写入 localStorage（key 为 `fomo.demo.auth.v2`）
- 连接后进入内置的 `end837` 演示账户，钱包地址只用于展示
- 没有做签名校验和 SIWE 后端验证，刷新页面后会直接恢复本地会话

相关代码在 `src/lib/okxWallet.ts`、`src/context/AuthContext.tsx` 和
`src/components/AuthModal.tsx`。

## 技术栈

- React 19 + TypeScript
- Vite 7
- Tailwind CSS 4
- React Router 7
- lucide-react 图标
- K 线使用 TradingView Lightweight Charts（`lightweight-charts`）；个人主页面积图仍为手写 SVG

## 页面

| 路由 | 内容 |
| --- | --- |
| `/` | 营销首页、太空场景、App 预览、社交证明、页脚 |
| `/discover?symbol=BTC` | 交易终端：币种侧栏、K 线、持有者、实时动态、下单面板 |
| `/u/end837` | 个人主页：资料、排名卡、组合曲线、持仓、最近动态、转账面板 |

## 数据层

所有页面只通过 `src/api` 取数，不直接 import 模拟数据：

- `src/api/types.ts` — Token / BetToken / Candle / Position / Profile / SidebarMenu 等类型
- `src/api/mockData.ts` — 固定数据、侧栏菜单、XLayer 下注代币、确定性的组合曲线生成器
- `src/api/liveMarket.ts` — OKX 公共 1m K 线接口（无需 API Key），当前最多取 300 根
- `src/api/index.ts` — 以 Promise 形式暴露的接口，带 160–760ms 模拟延迟；K 线走 `getLiveCandles()`
- `src/lib/useLiveCandles.ts` — 每 15 秒刷新一次 1m K 线，刷新失败时保留上一份数据

侧栏的一级 Tab、二级分类和右侧面板的 XLayer 下注代币都由接口返回，不在组件里写死。
账户数据可以继续替换成真实的 `fetch()`；K 线已经通过 `getLiveCandles()` 接入 OKX 公共行情。
`useApi`（`src/lib/useApi.ts`）负责 loading / error / 切换请求时的状态保持。

## 已实现

- OKX Wallet 浏览器插件连接、退出、路由守卫、localStorage 会话
- 钱包未安装提示、安装链接、重新检测、连接取消 / 待处理错误提示
- 交易对切换、K 线（TradingView Lightweight Charts，仅 1m，OKX 公共行情，15 秒刷新）、自选、搜索（⌘/Ctrl + K）
- 侧栏一级 Tab / 二级分类通过 `getSidebarMenu()` 接口下发
- 下单面板的方向 / 金额 / 仓位比例交互（仅 toast，不提交）
- 右侧面板 XLayer 下注代币选择（OKB / BEM，通过 `getBetTokens()` 接口加载，可用余额随选中代币联动）
- 5 个可编辑快捷金额（按代币分别读写 `getBetQuickAmounts()` / `saveBetQuickAmounts()`）
- 个人主页图表区间切换、持仓筛选、关注按钮、转账表单
- 桌面端与移动端的基础响应式布局

## 未实现（有意裁剪）

- 真实签名校验、SIWE、后端会话、KYC、私钥管理、充值提现
- 真实交易撮合、WebSocket 行情、后端与数据库
- 排行榜完整页、设置页、帮助中心、移动端原生 App

## 说明

本项目是前端学习 / 演示项目，与 FOMO Labs 无关联，不提供任何真实交易服务。
界面中出现的名称、数值和头像均为模拟数据。
