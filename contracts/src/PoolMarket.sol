// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * 二元彩池。市场 = 标的 × 下注代币（类似交易对，如 BTC/OKB、BTC/BEM、BTC/TEST），
 * 池子的最小单位是「某个市场的某一轮」。
 *
 * 关键取舍：
 * - 轮次不落状态，直接由区块号派生（`roundIndex = (block - anchor) / 600`）。
 * - 每个市场各自绑定一个 ERC20（`markets[marketId].token`），下注按该代币 pull，
 *   派奖也按该代币付。同一个合约地址管理所有市场，用户对每种代币各 approve 一次即可。
 * - 只有白名单地址能下注。用户私钥由后端托管、交易由后端代发，
 *   白名单就是「只能从我们入口进来」的那道门；operator 只管结算、市场和白名单维护。
 * - 单边池（只有一边有人押）结算时全额退款。派奖向下取整，零头留在合约。
 */
contract PoolMarket {
    uint256 public constant ROUND_BLOCKS = 600;
    uint256 public constant BETTING_BLOCKS = 300;

    uint8 public constant SIDE_UP = 0;
    uint8 public constant SIDE_DOWN = 1;
    /// 结算时传这个值表示本轮作废（全额退款）。
    uint8 public constant SIDE_VOID = 2;

    uint256 public immutable anchorBlock;
    address public operator;

    struct Market {
        address token;
        bool enabled;
    }

    struct RoundPool {
        uint256 upAmount;
        uint256 downAmount;
        uint8 winner;
        bool settled;
    }

    mapping(address => bool) public allowed;
    mapping(uint8 => Market) public markets;
    /// roundIndex => marketId => 该市场该轮的池子
    mapping(uint256 => mapping(uint8 => RoundPool)) public pools;
    /// roundIndex => marketId => user => [押涨金额, 押跌金额]
    mapping(uint256 => mapping(uint8 => mapping(address => uint256[2]))) private stakes;
    mapping(uint256 => mapping(uint8 => mapping(address => bool))) public claimed;

    event Bet(
        address indexed user,
        uint8 indexed marketId,
        uint256 indexed roundIndex,
        uint8 side,
        uint256 amount
    );
    event Settled(
        uint8 indexed marketId,
        uint256 indexed roundIndex,
        uint8 winner,
        uint256 upAmount,
        uint256 downAmount
    );
    event Claimed(
        address indexed user,
        uint8 indexed marketId,
        uint256 indexed roundIndex,
        uint256 amount
    );
    event MarketConfigured(uint8 indexed marketId, address token, bool enabled);
    event OperatorChanged(address indexed operator);
    event UserAllowed(address indexed user, bool isAllowed);

    error NotOperator();
    error NotAllowed();
    error BadSide();
    error ZeroAmount();
    error BettingClosed();
    error RoundNotFinished();
    error AlreadySettled();
    error NotSettled();
    error AlreadyClaimed();
    error NothingToClaim();
    error UnknownMarket();
    error MarketDisabled();
    error TransferFailed();
    error ZeroAddress();

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    modifier onlyAllowed() {
        if (!allowed[msg.sender]) revert NotAllowed();
        _;
    }

    constructor(address operator_, uint256 anchorBlock_) {
        if (operator_ == address(0)) revert ZeroAddress();
        operator = operator_;
        anchorBlock = anchorBlock_;
    }

    // ---------------------------------------------------------------- 轮次

    function currentRound() public view returns (uint256) {
        return (block.number - anchorBlock) / ROUND_BLOCKS;
    }

    function roundStart(uint256 roundIndex) public view returns (uint256) {
        return anchorBlock + roundIndex * ROUND_BLOCKS;
    }

    function roundEnd(uint256 roundIndex) public view returns (uint256) {
        return roundStart(roundIndex) + ROUND_BLOCKS;
    }

    function isBettingOpen() public view returns (bool) {
        return block.number - roundStart(currentRound()) < BETTING_BLOCKS;
    }

    // ------------------------------------------------------------ 管理动作

    function setOperator(address next) external onlyOperator {
        if (next == address(0)) revert ZeroAddress();
        operator = next;
        emit OperatorChanged(next);
    }

    function setAllowed(address user, bool isAllowed) external onlyOperator {
        allowed[user] = isAllowed;
        emit UserAllowed(user, isAllowed);
    }

    function setAllowedBatch(address[] calldata users, bool isAllowed) external onlyOperator {
        for (uint256 i = 0; i < users.length; i += 1) {
            allowed[users[i]] = isAllowed;
            emit UserAllowed(users[i], isAllowed);
        }
    }

    /// 配置市场：marketId 由后端 markets 表分配（1 = BTC/OKB 之类）。
    function setMarket(uint8 marketId, address token, bool enabled) external onlyOperator {
        if (marketId == 0) revert UnknownMarket();
        markets[marketId] = Market({token: token, enabled: enabled});
        emit MarketConfigured(marketId, token, enabled);
    }

    // -------------------------------------------------------------- 下注

    /// 下注只能落在「当前轮」，避免前端传来一个已经结束的轮次。
    function bet(uint8 marketId, uint8 side, uint256 amount) external onlyAllowed {
        Market memory market = markets[marketId];
        if (market.token == address(0)) revert UnknownMarket();
        if (!market.enabled) revert MarketDisabled();
        if (side != SIDE_UP && side != SIDE_DOWN) revert BadSide();
        if (amount == 0) revert ZeroAmount();

        uint256 roundIndex = currentRound();
        if (block.number - roundStart(roundIndex) >= BETTING_BLOCKS) revert BettingClosed();

        stakes[roundIndex][marketId][msg.sender][side] += amount;

        RoundPool storage pool = pools[roundIndex][marketId];
        if (side == SIDE_UP) {
            pool.upAmount += amount;
        } else {
            pool.downAmount += amount;
        }

        if (!IERC20(market.token).transferFrom(msg.sender, address(this), amount)) {
            revert TransferFailed();
        }
        emit Bet(msg.sender, marketId, roundIndex, side, amount);
    }

    // -------------------------------------------------------------- 结算

    function settle(uint8 marketId, uint256 roundIndex, uint8 winner) external onlyOperator {
        if (winner != SIDE_UP && winner != SIDE_DOWN && winner != SIDE_VOID) revert BadSide();
        if (block.number < roundEnd(roundIndex)) revert RoundNotFinished();

        RoundPool storage pool = pools[roundIndex][marketId];
        if (pool.settled) revert AlreadySettled();

        pool.settled = true;
        pool.winner = winner;
        emit Settled(marketId, roundIndex, winner, pool.upAmount, pool.downAmount);
    }

    // -------------------------------------------------------------- 领取

    /// 该市场该轮是否走退款（作废 / 只有一边有人押）。
    function isVoidRound(uint8 marketId, uint256 roundIndex) public view returns (bool) {
        RoundPool memory pool = pools[roundIndex][marketId];
        return pool.winner == SIDE_VOID || pool.upAmount == 0 || pool.downAmount == 0;
    }

    function claim(uint8 marketId, uint256 roundIndex) external {
        Market memory market = markets[marketId];
        if (market.token == address(0)) revert UnknownMarket();

        RoundPool memory pool = pools[roundIndex][marketId];
        if (!pool.settled) revert NotSettled();
        if (claimed[roundIndex][marketId][msg.sender]) revert AlreadyClaimed();

        uint256[2] memory userStake = stakes[roundIndex][marketId][msg.sender];
        uint256 payout;

        if (isVoidRound(marketId, roundIndex)) {
            payout = userStake[SIDE_UP] + userStake[SIDE_DOWN];
        } else {
            uint256 winPool = pool.winner == SIDE_UP ? pool.upAmount : pool.downAmount;
            uint256 total = pool.upAmount + pool.downAmount;
            payout = userStake[pool.winner] * total / winPool;
        }

        if (payout == 0) revert NothingToClaim();

        // 先记账再转账，避免重入。
        claimed[roundIndex][marketId][msg.sender] = true;
        if (!IERC20(market.token).transfer(msg.sender, payout)) revert TransferFailed();
        emit Claimed(msg.sender, marketId, roundIndex, payout);
    }

    // -------------------------------------------------------------- 查询

    function stakeOf(
        uint8 marketId,
        uint256 roundIndex,
        address user
    ) external view returns (uint256 up, uint256 down) {
        uint256[2] memory userStake = stakes[roundIndex][marketId][user];
        return (userStake[SIDE_UP], userStake[SIDE_DOWN]);
    }

    /// 前端显示「预计可领」用的纯计算，不受是否已领影响。
    function previewClaim(
        uint8 marketId,
        uint256 roundIndex,
        address user
    ) external view returns (uint256) {
        RoundPool memory pool = pools[roundIndex][marketId];
        if (!pool.settled) return 0;

        uint256[2] memory userStake = stakes[roundIndex][marketId][user];
        if (isVoidRound(marketId, roundIndex)) {
            return userStake[SIDE_UP] + userStake[SIDE_DOWN];
        }

        uint256 winPool = pool.winner == SIDE_UP ? pool.upAmount : pool.downAmount;
        return userStake[pool.winner] * (pool.upAmount + pool.downAmount) / winPool;
    }
}
