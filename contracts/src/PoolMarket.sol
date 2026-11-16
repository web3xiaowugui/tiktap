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
    /// 每轮总长：300 块下注 + 300 块封盘。
    uint256 public constant ROUND_BLOCKS = 600;
    uint256 public constant BETTING_BLOCKS = 300;
    /**
     * 每 300 块就起一轮新的：所以任意时刻都同时有两轮活着 ——
     * 较新的那轮在下注期，上一轮在封盘期（等结算），两者的窗口重叠一半。
     */
    uint256 public constant ROUND_INTERVAL_BLOCKS = 300;

    uint8 public constant SIDE_UP = 0;
    uint8 public constant SIDE_DOWN = 1;
    /// 结算时传这个值表示本轮作废（全额退款）。
    uint8 public constant SIDE_VOID = 2;

    /// 手续费的计价单位：1% = 100 bps。
    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint8 public constant FEE_KIND_BET = 0;
    uint8 public constant FEE_KIND_CLAIM = 1;

    address public operator;
    /// 手续费打到这里；默认是部署时指定的 operator。
    address public feeRecipient;

    /// 全局默认费率（bps）。默认 0，即不收费。
    uint16 public defaultBetFeeBps;
    uint16 public defaultClaimFeeBps;

    struct FeeOverride {
        uint16 betBps;
        uint16 claimBps;
        /// false 表示该市场没有单独配置，走全局默认。
        bool exists;
    }

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
    /// marketId => 该市场的手续费覆盖配置。
    mapping(uint8 => FeeOverride) public marketFees;
    /// 结算时把领奖费率快照下来：之后改费率不影响已结算的轮次。
    mapping(uint256 => mapping(uint8 => uint16)) public roundClaimFeeBps;

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
        address indexed user, uint8 indexed marketId, uint256 indexed roundIndex, uint256 amount
    );
    event MarketConfigured(uint8 indexed marketId, address token, bool enabled);
    event OperatorChanged(address indexed operator);
    event UserAllowed(address indexed user, bool isAllowed);
    event FeeRecipientChanged(address indexed recipient);
    event DefaultFeesChanged(uint16 betBps, uint16 claimBps);
    event MarketFeesChanged(uint8 indexed marketId, uint16 betBps, uint16 claimBps, bool exists);
    /// kind：0 = 下注费，1 = 领奖费。gross 是计费基数，fee 是实际抽走的数量。
    event FeeCharged(
        address indexed user,
        uint8 indexed marketId,
        uint256 indexed roundIndex,
        uint8 kind,
        uint256 gross,
        uint256 fee
    );

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
    error FeeTooHigh();

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    modifier onlyAllowed() {
        if (!allowed[msg.sender]) revert NotAllowed();
        _;
    }

    constructor(address operator_) {
        if (operator_ == address(0)) revert ZeroAddress();
        operator = operator_;
        feeRecipient = operator_;
    }

    // ---------------------------------------------------------------- 轮次

    /**
     * 当前「下注轮」的编号（最新的一轮；它的前一轮还在封盘期里）。
     */
    function currentRound() public view returns (uint256) {
        return block.number / ROUND_INTERVAL_BLOCKS;
    }

    function roundStart(uint256 roundIndex) public view returns (uint256) {
        return roundIndex * ROUND_INTERVAL_BLOCKS;
    }

    function roundEnd(uint256 roundIndex) public view returns (uint256) {
        return roundStart(roundIndex) + ROUND_BLOCKS;
    }

    /**
     * 正在下注期的那一轮：上一轮还在封盘期等结算，这两轮是重叠的。
     */
    function waitingRound() public view returns (uint256) {
        uint256 current = currentRound();
        return current == 0 ? 0 : current - 1;
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

    // -------------------------------------------------------------- 手续费

    /// 手续费收款地址。默认是 operator；改成金库 / 多签也走这里。
    function setFeeRecipient(address recipient) external onlyOperator {
        if (recipient == address(0)) revert ZeroAddress();
        feeRecipient = recipient;
        emit FeeRecipientChanged(recipient);
    }

    /// 全局默认费率：下注和领奖分开配，单位 bps（1% = 100）。默认 0。
    function setDefaultFees(uint16 betBps, uint16 claimBps) external onlyOperator {
        _checkFeeBps(betBps);
        _checkFeeBps(claimBps);
        defaultBetFeeBps = betBps;
        defaultClaimFeeBps = claimBps;
        emit DefaultFeesChanged(betBps, claimBps);
    }

    /// 给单个市场覆盖费率（下注和领奖一起设）；没设过的市场走全局默认。
    function setMarketFees(uint8 marketId, uint16 betBps, uint16 claimBps) external onlyOperator {
        if (marketId == 0) revert UnknownMarket();
        _checkFeeBps(betBps);
        _checkFeeBps(claimBps);
        marketFees[marketId] = FeeOverride({betBps: betBps, claimBps: claimBps, exists: true});
        emit MarketFeesChanged(marketId, betBps, claimBps, true);
    }

    /// 删掉市场覆盖，重新回退到全局默认。
    function clearMarketFees(uint8 marketId) external onlyOperator {
        delete marketFees[marketId];
        emit MarketFeesChanged(marketId, 0, 0, false);
    }

    /// 该市场实际生效的下注费率：有覆盖用覆盖，否则用全局默认。
    function betFeeBps(uint8 marketId) public view returns (uint16) {
        FeeOverride memory config = marketFees[marketId];
        return config.exists ? config.betBps : defaultBetFeeBps;
    }

    /// 该市场实际生效的领奖费率（按当前配置，结算时会被快照）。
    function claimFeeBps(uint8 marketId) public view returns (uint16) {
        FeeOverride memory config = marketFees[marketId];
        return config.exists ? config.claimBps : defaultClaimFeeBps;
    }

    function _checkFeeBps(uint16 bps) private pure {
        if (bps > BPS_DENOMINATOR) revert FeeTooHigh();
    }

    // -------------------------------------------------------------- 下注

    /// 下注只能落在「当前轮」，避免前端传来一个已经结束的轮次。
    /// 手续费从下注金额里先扣：池子和用户仓位记的是扣费后的净额。
    function bet(uint8 marketId, uint8 side, uint256 amount) external onlyAllowed {
        Market memory market = markets[marketId];
        if (market.token == address(0)) revert UnknownMarket();
        if (!market.enabled) revert MarketDisabled();
        if (side != SIDE_UP && side != SIDE_DOWN) revert BadSide();
        if (amount == 0) revert ZeroAmount();

        uint256 roundIndex = currentRound();
        if (block.number - roundStart(roundIndex) >= BETTING_BLOCKS) revert BettingClosed();

        uint256 fee = amount * betFeeBps(marketId) / BPS_DENOMINATOR;
        uint256 net = amount - fee;

        stakes[roundIndex][marketId][msg.sender][side] += net;

        RoundPool storage pool = pools[roundIndex][marketId];
        if (side == SIDE_UP) {
            pool.upAmount += net;
        } else {
            pool.downAmount += net;
        }

        if (!IERC20(market.token).transferFrom(msg.sender, address(this), amount)) {
            revert TransferFailed();
        }
        if (fee != 0) {
            if (!IERC20(market.token).transfer(feeRecipient, fee)) revert TransferFailed();
            emit FeeCharged(msg.sender, marketId, roundIndex, FEE_KIND_BET, amount, fee);
        }
        emit Bet(msg.sender, marketId, roundIndex, side, net);
    }

    // -------------------------------------------------------------- 结算

    function settle(uint8 marketId, uint256 roundIndex, uint8 winner) external onlyOperator {
        if (winner != SIDE_UP && winner != SIDE_DOWN && winner != SIDE_VOID) revert BadSide();
        if (block.number < roundEnd(roundIndex)) revert RoundNotFinished();

        RoundPool storage pool = pools[roundIndex][marketId];
        if (pool.settled) revert AlreadySettled();

        pool.settled = true;
        pool.winner = winner;
        // 领奖费率按结算这一刻的快照收，之后运营改费率不影响这一轮。
        roundClaimFeeBps[roundIndex][marketId] = claimFeeBps(marketId);
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

        // 退款轮（作废 / 单边）不收养奖费：本金原样退回。
        uint256 fee = isVoidRound(marketId, roundIndex)
            ? 0
            : payout * roundClaimFeeBps[roundIndex][marketId] / BPS_DENOMINATOR;
        uint256 net = payout - fee;

        // 先记账再转账，避免重入。
        claimed[roundIndex][marketId][msg.sender] = true;
        if (net != 0 && !IERC20(market.token).transfer(msg.sender, net)) revert TransferFailed();
        if (fee != 0) {
            if (!IERC20(market.token).transfer(feeRecipient, fee)) revert TransferFailed();
            emit FeeCharged(msg.sender, marketId, roundIndex, FEE_KIND_CLAIM, payout, fee);
        }
        emit Claimed(msg.sender, marketId, roundIndex, net);
    }

    // -------------------------------------------------------------- 查询

    function stakeOf(uint8 marketId, uint256 roundIndex, address user)
        external
        view
        returns (uint256 up, uint256 down)
    {
        uint256[2] memory userStake = stakes[roundIndex][marketId][user];
        return (userStake[SIDE_UP], userStake[SIDE_DOWN]);
    }

    /// 前端显示「预计可领」用的纯计算：已扣掉领奖费，等于用户实际到手的数量。
    function previewClaim(uint8 marketId, uint256 roundIndex, address user)
        external
        view
        returns (uint256)
    {
        uint256 gross = _grossPayout(marketId, roundIndex, user);
        if (gross == 0) return 0;
        uint256 fee = isVoidRound(marketId, roundIndex)
            ? 0
            : gross * roundClaimFeeBps[roundIndex][marketId] / BPS_DENOMINATOR;
        return gross - fee;
    }

    /// 扣领奖费之前的派奖总额，方便前端展示「派奖 / 手续费」明细。
    function previewClaimGross(uint8 marketId, uint256 roundIndex, address user)
        external
        view
        returns (uint256)
    {
        return _grossPayout(marketId, roundIndex, user);
    }

    function _grossPayout(uint8 marketId, uint256 roundIndex, address user)
        private
        view
        returns (uint256)
    {
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
