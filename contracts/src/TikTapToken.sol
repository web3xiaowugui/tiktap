// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// 下注代币。刻意不依赖 OpenZeppelin：只实现我们真正用到的 ERC20 子集。
contract TikTapToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    /// 每个地址的累计 mint 上限（免费领取，保证不会无限增发）。
    uint256 public immutable mintCap;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    error ZeroAmount();
    error MintCapExceeded(uint256 requested, uint256 remaining);
    error InsufficientBalance(uint256 available, uint256 requested);
    error InsufficientAllowance(uint256 available, uint256 requested);
    error TransferFailed();

    constructor(string memory name_, string memory symbol_, uint256 mintCap_) {
        name = name_;
        symbol = symbol_;
        mintCap = mintCap_;
    }

    /// 公开领取：任何人都能拿，单地址累计不超过 mintCap。
    function mint(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        uint256 already = balanceOf[msg.sender];
        if (already + amount > mintCap) revert MintCapExceeded(amount, mintCap - already);

        balanceOf[msg.sender] = already + amount;
        totalSupply += amount;
        emit Transfer(address(0), msg.sender, amount);
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
