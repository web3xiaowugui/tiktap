// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * 二元彩池：一轮里所有人押「涨」或「跌」，赢的一边按份额分掉整个池子。
 *
 * 关键取舍：
 * - 轮次不落状态，直接由区块号派生（`roundIndex = (block - anchor) / 600`），
 *   所以一轮一轮跑下去不会累积 storage 写入。
 * - 只有白名单地址能下注。用户私钥由后端托管、交易由后端代发，
 *   白名单就是「只能从我们入口进来」的那道门；operator 只管结算。
 * - 单边池（只有一边有人押）结算时全额退款，不产生输家。
 * - 派奖向下取整，余下的零头留在合约里（数额极小，不做二次分配）。
 */
contract PoolMarket {
    uint256 public constant ROUND_BLOCKS = 600;
    uint256 public constant BETTING_BLOCKS = 300;

    uint8 public constant SIDE_UP = 0;
    uint8 public constant SIDE_DOWN = 1;
    /// 结算时传这个值表示本轮作废（全额退款）。
    uint8 public constant SIDE_VOID = 2;

    uint256 public immutable anchorBlock;
    IERC20 public immutable token;
    address public operator;

    struct RoundPool {
        uint256 upAmount;
        uint256 downAmount;
        uint8 winner;
        bool settled;
    }

    mapping(address => bool) public allowed;
    mapping(uint256 => RoundPool) public pools;
    /// roundIndex => user => [押涨金额, 押跌金额]
    mapping(uint256 => mapping(address => uint256[2])) private stakes;
    mapping(uint256 => mapping(address => bool)) public claimed;

    event Bet(address indexed user, uint256 indexed roundIndex, uint8 side, uint256 amount);
    event Settled(uint256 indexed roundIndex, uint8 winner, uint256 upAmount, uint256 downAmount);
    event Claimed(address indexed user, uint256 indexed roundIndex, uint256 amount);
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

    constructor(address token_, address operator_, uint256 anchorBlock_) {
        if (token_ == address(0) || operator_ == address(0)) revert ZeroAddress();
        token = IERC20(token_);
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

    // -------------------------------------------------------------- 下注

    /// 下注只能落在「当前轮」，避免前端传来一个已经结束的轮次。
    function bet(uint8 side, uint256 amount) external onlyAllowed {
        if (side != SIDE_UP && side != SIDE_DOWN) revert BadSide();
        if (amount == 0) revert ZeroAmount();

        uint256 roundIndex = currentRound();
        if (block.number - roundStart(roundIndex) >= BETTING_BLOCKS) revert BettingClosed();

        stakes[roundIndex][msg.sender][side] += amount;

        RoundPool storage pool = pools[roundIndex];
        if (side == SIDE_UP) {
            pool.upAmount += amount;
        } else {
            pool.downAmount += amount;
        }

        if (!token.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        emit Bet(msg.sender, roundIndex, side, amount);
    }

    // -------------------------------------------------------------- 结算

    function settle(uint256 roundIndex, uint8 winner) external onlyOperator {
        if (winner != SIDE_UP && winner != SIDE_DOWN && winner != SIDE_VOID) revert BadSide();
        if (block.number < roundEnd(roundIndex)) revert RoundNotFinished();

        RoundPool storage pool = pools[roundIndex];
        if (pool.settled) revert AlreadySettled();

        pool.settled = true;
        pool.winner = winner;
        emit Settled(roundIndex, winner, pool.upAmount, pool.downAmount);
    }

    // -------------------------------------------------------------- 领取

    /// 该轮是否走退款（作废 / 只有一边有人押）。
    function isVoidRound(uint256 roundIndex) public view returns (bool) {
        RoundPool memory pool = pools[roundIndex];
        return pool.winner == SIDE_VOID || pool.upAmount == 0 || pool.downAmount == 0;
    }

    function claim(uint256 roundIndex) external {
        RoundPool memory pool = pools[roundIndex];
        if (!pool.settled) revert NotSettled();
        if (claimed[roundIndex][msg.sender]) revert AlreadyClaimed();

        uint256[2] memory userStake = stakes[roundIndex][msg.sender];
        uint256 payout;

        if (isVoidRound(roundIndex)) {
            payout = userStake[SIDE_UP] + userStake[SIDE_DOWN];
        } else {
            uint256 winPool = pool.winner == SIDE_UP ? pool.upAmount : pool.downAmount;
            uint256 total = pool.upAmount + pool.downAmount;
            payout = userStake[pool.winner] * total / winPool;
        }

        if (payout == 0) revert NothingToClaim();

        // 先记账再转账，避免重入。
        claimed[roundIndex][msg.sender] = true;
        if (!token.transfer(msg.sender, payout)) revert TransferFailed();
        emit Claimed(msg.sender, roundIndex, payout);
    }

    // -------------------------------------------------------------- 查询

    function stakeOf(uint256 roundIndex, address user) external view returns (uint256 up, uint256 down) {
        uint256[2] memory userStake = stakes[roundIndex][user];
        return (userStake[SIDE_UP], userStake[SIDE_DOWN]);
    }

    /// 前端显示「预计可领」用的纯计算，不受是否已领影响。
    function previewClaim(uint256 roundIndex, address user) external view returns (uint256) {
        RoundPool memory pool = pools[roundIndex];
        if (!pool.settled) return 0;

        uint256[2] memory userStake = stakes[roundIndex][user];
        if (isVoidRound(roundIndex)) return userStake[SIDE_UP] + userStake[SIDE_DOWN];

        uint256 winPool = pool.winner == SIDE_UP ? pool.upAmount : pool.downAmount;
        return userStake[pool.winner] * (pool.upAmount + pool.downAmount) / winPool;
    }
}
