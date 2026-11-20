// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TikTapTestToken} from "../src/TikTapTestToken.sol";

contract TikTapTestTokenTest is Test {
    TikTapTestToken internal token;
    address internal minter = address(0xA11CE);

    string internal constant NAME = "TikTap";
    string internal constant SYMBOL = "TEST";

    function setUp() public {
        token = new TikTapTestToken(NAME, SYMBOL, minter);
    }

    function testMetadata() public view {
        assertEq(token.name(), NAME);
        assertEq(token.symbol(), SYMBOL);
        assertEq(token.decimals(), 18);
        assertEq(token.minter(), minter);
        assertEq(token.totalSupply(), 0);
    }

    function testOnlyMinterCanMint() public {
        vm.prank(address(0xB0B));
        vm.expectRevert(TikTapTestToken.OnlyMinter.selector);
        token.mint(address(0xB0B), 1 ether);
    }

    function testMintHasNoSupplyOrPerAddressCap() public {
        vm.startPrank(minter);
        token.mint(minter, 1_000 ether);
        token.mint(minter, 90_000 ether);
        token.mint(minter, 1_000_000 ether);
        vm.stopPrank();

        assertEq(token.balanceOf(minter), 1_091_000 ether);
        assertEq(token.totalSupply(), 1_091_000 ether);
    }

    function testTransferAndApprove() public {
        vm.prank(minter);
        token.mint(minter, 500 ether);
        vm.prank(minter);
        token.transfer(address(0xB0B), 100 ether);

        assertEq(token.balanceOf(minter), 400 ether);
        assertEq(token.balanceOf(address(0xB0B)), 100 ether);

        vm.prank(minter);
        token.approve(address(0xB0B), type(uint256).max);
        vm.prank(address(0xB0B));
        token.transferFrom(minter, address(0xB0B), 50 ether);

        assertEq(token.balanceOf(minter), 350 ether);
        // 无限授权不递减
        assertEq(token.allowance(minter, address(0xB0B)), type(uint256).max);
    }

    function testTransferRevertsOnInsufficientBalance() public {
        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(TikTapTestToken.InsufficientBalance.selector, 0, 1 ether));
        token.transfer(address(0xB0B), 1 ether);
    }

    function testMintToZeroAddressReverts() public {
        vm.prank(minter);
        vm.expectRevert(TikTapTestToken.ZeroAddress.selector);
        token.mint(address(0), 1 ether);
    }

    function testTransferMinter() public {
        vm.prank(minter);
        token.transferMinter(address(0xB0B));
        assertEq(token.minter(), address(0xB0B));

        vm.prank(minter);
        vm.expectRevert(TikTapTestToken.OnlyMinter.selector);
        token.mint(minter, 1 ether);
    }
}
