// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TikTapToken} from "../src/TikTapToken.sol";

contract TikTapTokenTest is Test {
    TikTapToken internal token;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    uint256 internal constant CAP = 1000 ether;

    function setUp() public {
        token = new TikTapToken("TikTap", "TIK", CAP);
    }

    function testMetadata() public view {
        assertEq(token.name(), "TikTap");
        assertEq(token.symbol(), "TIK");
        assertEq(token.decimals(), 18);
        assertEq(token.mintCap(), CAP);
    }

    function testMintUpToCap() public {
        vm.prank(alice);
        token.mint(CAP);

        assertEq(token.balanceOf(alice), CAP);
        assertEq(token.totalSupply(), CAP);
    }

    function testMintBeyondCapReverts() public {
        vm.startPrank(alice);
        token.mint(CAP - 1 ether);
        vm.expectRevert(
            abi.encodeWithSelector(TikTapToken.MintCapExceeded.selector, 2 ether, 1 ether)
        );
        token.mint(2 ether);
        vm.stopPrank();
    }

    function testMintZeroReverts() public {
        vm.prank(alice);
        vm.expectRevert(TikTapToken.ZeroAmount.selector);
        token.mint(0);
    }

    function testTransfer() public {
        vm.startPrank(alice);
        token.mint(10 ether);
        token.transfer(bob, 4 ether);
        vm.stopPrank();

        assertEq(token.balanceOf(alice), 6 ether);
        assertEq(token.balanceOf(bob), 4 ether);
    }

    function testTransferInsufficientBalanceReverts() public {
        vm.startPrank(alice);
        token.mint(1 ether);
        vm.expectRevert(
            abi.encodeWithSelector(TikTapToken.InsufficientBalance.selector, 1 ether, 2 ether)
        );
        token.transfer(bob, 2 ether);
        vm.stopPrank();
    }

    function testTransferFromConsumesAllowance() public {
        vm.startPrank(alice);
        token.mint(10 ether);
        token.approve(bob, 7 ether);
        vm.stopPrank();

        vm.prank(bob);
        token.transferFrom(alice, bob, 5 ether);

        assertEq(token.allowance(alice, bob), 2 ether);
        assertEq(token.balanceOf(bob), 5 ether);
    }

    function testTransferFromWithoutAllowanceReverts() public {
        vm.startPrank(alice);
        token.mint(10 ether);
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(TikTapToken.InsufficientAllowance.selector, 0, 5 ether)
        );
        token.transferFrom(alice, bob, 5 ether);
    }

    function testInfiniteAllowanceIsNotDecremented() public {
        vm.startPrank(alice);
        token.mint(10 ether);
        token.approve(bob, type(uint256).max);
        vm.stopPrank();

        vm.prank(bob);
        token.transferFrom(alice, bob, 5 ether);

        assertEq(token.allowance(alice, bob), type(uint256).max);
    }
}
