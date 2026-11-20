// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * 体验币 TEST（V2）：用来替换第一版 TikTapToken。
 *
 * 和 V1 的差别：
 *   - 没有总量上限：`mint` 只受 minter 权限约束，想铸多少铸多少；
 *   - `mint` 只能由 minter（后端 operator）调用，而且可以铸给任意地址；
 *   - 不再有单地址 mint 上限，每个人领多少都不受合约限制。
 *
 * 仍然刻意不依赖 OpenZeppelin：只实现我们用到的 ERC20 子集。
 * minter 可以转移（换私钥时用），避免合约被一把钥匙永久锁死。
 */
contract TikTapTestToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    address public minter;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);
    event MinterChanged(address indexed previousMinter, address indexed nextMinter);

    error OnlyMinter();
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientBalance(uint256 available, uint256 requested);
    error InsufficientAllowance(uint256 available, uint256 requested);
    error TransferFailed();

    modifier onlyMinter() {
        if (msg.sender != minter) revert OnlyMinter();
        _;
    }

    constructor(string memory name_, string memory symbol_, address minter_) {
        if (minter_ == address(0)) revert ZeroAddress();
        name = name_;
        symbol = symbol_;
        minter = minter_;
    }

    /// 只有 minter 能铸币；可以铸给任意地址，单次/单地址都没有上限。
    function mint(address to, uint256 amount) external onlyMinter {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    /// 轮换 minter（比如换 operator 私钥）。只有当前 minter 能调。
    function transferMinter(address nextMinter) external onlyMinter {
        if (nextMinter == address(0)) revert ZeroAddress();
        address previous = minter;
        minter = nextMinter;
        emit MinterChanged(previous, nextMinter);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < amount) revert InsufficientAllowance(allowed, amount);
            allowance[from][msg.sender] = allowed - amount;
        }
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) private {
        if (to == address(0)) revert TransferFailed();
        uint256 balance = balanceOf[from];
        if (balance < amount) revert InsufficientBalance(balance, amount);

        balanceOf[from] = balance - amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
