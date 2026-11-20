# 使用文档 · 截图素材

这个目录放「使用文档」页面要用的截图，文件会通过 `apps/web/public/docs/` 直接对外提供，
前端引用路径形如 `/docs/01-login.png`。

## 命名约定（建议）

按文档章节顺序编号，一眼能看出对应哪一节：

```
01-login.png            登录 / X 授权
02-faucet.png           领取测试币（含 5 分钟冷却倒计时）
03-discover.png         发现页整体
04-pick-market.png      选标的物与轮次
05-place-bet.png        买涨 / 买跌、填金额
06-my-bet.png           我的下注 / 开奖结果 / 领取
07-activity.png         活动流
08-holders.png          参与者面板
09-opinions.png         发观点
10-profile.png          个人主页
11-leaderboard.png      排行榜
12-follow.png           粉丝 / 关注列表
```

- 格式用 `png`（或 `jpg`），宽度 1200px 左右足够，单张建议 < 500KB
- 截图里的敏感信息（真实地址、余额）不用特意打码，演示环境即可
- 如果一张图对应多个要点，直接按 `05a`、`05b` 这样加后缀也行

## 注意

当前模型**不能直接读图**，所以我没法“看”截图内容。放进来之后，
请把对应的要点文字也发给我（例如「05-place-bet.png：选金额 → 点 Tap涨 → 按钮出现提交中」），
我再把图 + 文案接进 `apps/web/src/components/UsageDocs.tsx` 的文档正文里。
