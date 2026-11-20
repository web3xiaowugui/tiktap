import { parseAbi } from "viem";

/** PoolMarket 只暴露我们用到的方法，所以手写 ABI，不依赖 forge 产物。 */
export const POOL_MARKET_ABI = parseAbi([
  "function bet(uint8 marketId, uint8 side, uint256 amount)",
  "function claim(uint8 marketId, uint256 roundIndex)",
  "function settle(uint8 marketId, uint256 roundIndex, uint8 winner)",
  "function setMarket(uint8 marketId, address token, bool enabled)",
  "function setAllowed(address user, bool isAllowed)",
  "function setAllowedBatch(address[] users, bool isAllowed)",
  "function markets(uint8 marketId) view returns (address token, bool enabled)",
  "function allowed(address user) view returns (bool)",
  "function currentRound() view returns (uint256)",
  "function isBettingOpen() view returns (bool)",
  "function roundStart(uint256 roundIndex) view returns (uint256)",
  "function roundEnd(uint256 roundIndex) view returns (uint256)",
  "function pools(uint256 roundIndex, uint8 marketId) view returns (uint256 upAmount, uint256 downAmount, uint8 winner, bool settled)",
  "function stakeOf(uint8 marketId, uint256 roundIndex, address user) view returns (uint256 up, uint256 down)",
  "function previewClaim(uint8 marketId, uint256 roundIndex, address user) view returns (uint256)",
  "function isVoidRound(uint8 marketId, uint256 roundIndex) view returns (bool)",
  "function claimed(uint256 roundIndex, uint8 marketId, address user) view returns (bool)",
  "function betFeeBps(uint8 marketId) view returns (uint16)",
  "function claimFeeBps(uint8 marketId) view returns (uint16)",
  "function roundClaimFeeBps(uint256 roundIndex, uint8 marketId) view returns (uint16)",
  "function feeRecipient() view returns (address)",
]);

export const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(uint256 amount)",
]);

/** 新版 TEST：只有 minter（operator）能铸，且可以铸给任意地址。 */
export const TEST_TOKEN_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount)",
]);

export const WOKB_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function deposit() payable",
  "function withdraw(uint256 amount)",
]);

export const SIDE_UP = 0;
export const SIDE_DOWN = 1;
export const SIDE_VOID = 2;

export function sideFromLabel(label: string): number {
  const normalized = label.toLowerCase();
  if (normalized === "long" || normalized === "up" || normalized === "0") return SIDE_UP;
  if (normalized === "short" || normalized === "down" || normalized === "1") return SIDE_DOWN;
  throw new Error(`未知方向：${label}`);
}
