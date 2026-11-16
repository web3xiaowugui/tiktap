import type { BetToken } from "@/api/types";

/** 余额和盈亏只展示这三个代币；顺序固定，避免各页面不一致。 */
const TOKEN_ORDER = ["OKB", "BEM", "TEST"];

export function orderBalanceTokens(tokens: BetToken[]): BetToken[] {
  return tokens
    .filter((token) => TOKEN_ORDER.includes(token.symbol))
    .sort(
      (a, b) => TOKEN_ORDER.indexOf(a.symbol) - TOKEN_ORDER.indexOf(b.symbol),
    );
}
