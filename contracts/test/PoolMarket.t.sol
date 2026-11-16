// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PoolMarket} from "../src/PoolMarket.sol";
import {TikTapToken} from "../src/TikTapToken.sol";

contract PoolMarketTest is Test {
    PoolMarket internal market;
    TikTapToken internal token;

    address internal operatorAddr = address(0xBEEF);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal carol = address(0xCA401);

    uint256 internal constant ANCHOR = 1_000_000;
    uint256 internal constant CAP = 1000 ether;

    uint8 internal constant UP = 0;
    uint8 internal constant DOWN = 1;
    uint8 internal constant VOID = 2;

    function setUp() public {
        vm.roll(ANCHOR);

        token = new TikTapToken("TikTap", "TIK", CAP);
        market = new PoolMarket(address(token), operatorAddr, ANCHOR);

        _fund(alice, 1000 ether);
        _fund(bob, 1000 ether);
        _fund(carol, 1000 ether);

        vm.startPrank(operatorAddr);
        market.setAllowed(alice, true);
        market.setAllowed(bob, true);
        vm.stopPrank();
    }

    // ------------------------------------------------------------- helpers

    function _fund(address who, uint256 amount) internal {
        vm.startPrank(who);
        token.mint(amount);
        token.approve(address(market), type(uint256).max);
        vm.stopPrank();
    }

    function _bet(address who, uint8 side, uint256 amount) internal {
        vm.prank(who);
        market.bet(side, amount);
    }

    function _endRound(uint256 roundIndex) internal {
        vm.roll(market.roundEnd(roundIndex));
    }

    // ----------------------------------------------------------- 轮次派生

    function testRoundDerivedFromBlockNumber() public view {
        assertEq(market.currentRound(), 0);
        assertEq(market.roundStart(0), ANCHOR);
        assertEq(market.roundEnd(0), ANCHOR + 600);
        assertTrue(market.isBettingOpen());
    }

    function testBettingWindowClosesAtBlock300() public {
        vm.roll(ANCHOR + 299);
        assertTrue(market.isBettingOpen());

        vm.roll(ANCHOR + 300);
        assertFalse(market.isBettingOpen());

        vm.roll(ANCHOR + 600);
        assertEq(market.currentRound(), 1);
        assertTrue(market.isBettingOpen());
    }

    function testBetAfterWindowReverts() public {
        vm.roll(ANCHOR + 300);
        vm.prank(alice);
        vm.expectRevert(PoolMarket.BettingClosed.selector);
        market.bet(UP, 1 ether);
    }

    // -------------------------------------------------------------- 下注

    function testBetMovesTokensAndUpdatesPool() public {
        _bet(alice, UP, 100 ether);

        assertEq(token.balanceOf(alice), 900 ether);
        assertEq(token.balanceOf(address(market)), 100 ether);

        (uint256 upAmount, uint256 downAmount, uint8 winner, bool settled) = market.pools(0);
        assertEq(upAmount, 100 ether);
        assertEq(downAmount, 0);
        assertEq(winner, 0);
        assertFalse(settled);

        (uint256 up, uint256 down) = market.stakeOf(0, alice);
        assertEq(up, 100 ether);
        assertEq(down, 0);
    }

    function testBetAccumulatesWithinRound() public {
        _bet(alice, UP, 10 ether);
        _bet(alice, DOWN, 20 ether);
        _bet(bob, UP, 30 ether);

        (uint256 up, uint256 down) = market.stakeOf(0, alice);
        assertEq(up, 10 ether);
        assertEq(down, 20 ether);

        (uint256 upAmount, uint256 downAmount, , ) = market.pools(0);
        assertEq(upAmount, 40 ether);
        assertEq(downAmount, 20 ether);
    }

    function testBetByNonAllowedReverts() public {
        vm.prank(carol);
        vm.expectRevert(PoolMarket.NotAllowed.selector);
        market.bet(UP, 1 ether);
    }

    function testBetBadSideReverts() public {
        vm.prank(alice);
        vm.expectRevert(PoolMarket.BadSide.selector);
        market.bet(3, 1 ether);
    }

    function testBetZeroReverts() public {
        vm.prank(alice);
        vm.expectRevert(PoolMarket.ZeroAmount.selector);
        market.bet(UP, 0);
    }

    function testBetWithoutApprovalReverts() public {
        // 全新地址：已放行、有钱，但没有 approve，pull 走不通。
        address dave = makeAddr("dave");
        vm.prank(operatorAddr);
        market.setAllowed(dave, true);

        vm.prank(dave);
        token.mint(10 ether);

        vm.prank(dave);
        vm.expectRevert(
            abi.encodeWithSelector(TikTapToken.InsufficientAllowance.selector, 0, 1 ether)
        );
        market.bet(UP, 1 ether);
    }

    // -------------------------------------------------------------- 结算

    function testOnlyOperatorCanSettle() public {
        _endRound(0);
        vm.prank(alice);
        vm.expectRevert(PoolMarket.NotOperator.selector);
        market.settle(0, UP);
    }

    function testSettleBeforeRoundEndReverts() public {
        vm.roll(ANCHOR + 599);
        vm.prank(operatorAddr);
        vm.expectRevert(PoolMarket.RoundNotFinished.selector);
        market.settle(0, UP);
    }

    function testDoubleSettleReverts() public {
        _endRound(0);
        vm.startPrank(operatorAddr);
        market.settle(0, UP);
        vm.expectRevert(PoolMarket.AlreadySettled.selector);
        market.settle(0, UP);
        vm.stopPrank();
    }

    function testSettleBadWinnerReverts() public {
        _endRound(0);
        vm.prank(operatorAddr);
        vm.expectRevert(PoolMarket.BadSide.selector);
        market.settle(0, 3);
    }

    // -------------------------------------------------------------- 派奖

    function testWinnerTakesWholePot() public {
        _bet(alice, UP, 400 ether);
        _bet(bob, DOWN, 600 ether);

        _endRound(0);
        vm.prank(operatorAddr);
        market.settle(0, UP);

        uint256 before = token.balanceOf(alice);
        vm.prank(alice);
        market.claim(0);

        // 池子总共 1000，赢家只有 alice 押了 400，所以拿到全部 1000。
        assertEq(token.balanceOf(alice) - before, 1000 ether);
        assertEq(token.balanceOf(address(market)), 0);
    }

    function testWinnersSplitByShare() public {
        _bet(alice, UP, 300 ether);
        _bet(bob, DOWN, 700 ether);
        // carol 也押涨，需要先放行。
        vm.prank(operatorAddr);
        market.setAllowed(carol, true);
        _bet(carol, UP, 200 ether);

        _endRound(0);
        vm.prank(operatorAddr);
        market.settle(0, DOWN);

        uint256 pot = 1200 ether;
        uint256 downPool = 700 ether;

        uint256 bobBefore = token.balanceOf(bob);
        vm.prank(bob);
        market.claim(0);
        assertEq(token.balanceOf(bob) - bobBefore, pot * 700 ether / downPool);

        // 押涨的人没份。
        vm.prank(alice);
        vm.expectRevert(PoolMarket.NothingToClaim.selector);
        market.claim(0);
    }

    function testDoubleClaimReverts() public {
        _bet(alice, UP, 100 ether);
        _bet(bob, DOWN, 100 ether);

        _endRound(0);
        vm.prank(operatorAddr);
        market.settle(0, UP);

        vm.prank(alice);
        market.claim(0);

        vm.prank(alice);
        vm.expectRevert(PoolMarket.AlreadyClaimed.selector);
        market.claim(0);
    }

    function testClaimBeforeSettleReverts() public {
        _bet(alice, UP, 100 ether);
        vm.prank(alice);
        vm.expectRevert(PoolMarket.NotSettled.selector);
        market.claim(0);
    }

    // -------------------------------------------------------------- 退款

    function testOneSidedRoundRefunds() public {
        _bet(alice, UP, 100 ether);
        assertTrue(market.isVoidRound(0));

        _endRound(0);
        // operator 报了 DOWN，但跌池是空的，仍然按退款处理。
        vm.prank(operatorAddr);
        market.settle(0, DOWN);

        uint256 before = token.balanceOf(alice);
        vm.prank(alice);
        market.claim(0);
        assertEq(token.balanceOf(alice) - before, 100 ether);
        assertEq(token.balanceOf(address(market)), 0);
    }

    function testVoidRoundRefundsBothSides() public {
        _bet(alice, UP, 120 ether);
        _bet(bob, DOWN, 80 ether);

        _endRound(0);
        vm.prank(operatorAddr);
        market.settle(0, VOID);

        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        market.claim(0);
        assertEq(token.balanceOf(alice) - aliceBefore, 120 ether);

        uint256 bobBefore = token.balanceOf(bob);
        vm.prank(bob);
        market.claim(0);
        assertEq(token.balanceOf(bob) - bobBefore, 80 ether);

        assertEq(token.balanceOf(address(market)), 0);
    }

    /// 派奖向下取整：除不尽的那点零头留在合约里，不做二次分配。
    function testRoundingDustStaysInContract() public {
        _bet(alice, UP, 100);
        _bet(bob, UP, 200);
        vm.prank(operatorAddr);
        market.setAllowed(carol, true);
        _bet(carol, DOWN, 400);

        _endRound(0);
        vm.prank(operatorAddr);
        market.settle(0, UP);

        // pot = 700, 涨池 = 300：alice 100*700/300 = 233，bob 200*700/300 = 466。
        assertEq(market.previewClaim(0, alice), 233);
        assertEq(market.previewClaim(0, bob), 466);

        vm.prank(alice);
        market.claim(0);
        vm.prank(bob);
        market.claim(0);

        // 700 入池，699 派出去，1 wei 零头留下。
        assertEq(token.balanceOf(address(market)), 1);
    }
    // -------------------------------------------------------------- 预览

    function testPreviewClaimMatchesActual() public {
        _bet(alice, UP, 400 ether);
        _bet(bob, DOWN, 600 ether);

        _endRound(0);
        vm.prank(operatorAddr);
        market.settle(0, UP);

        assertEq(market.previewClaim(0, alice), 1000 ether);
        assertEq(market.previewClaim(0, bob), 0);
    }

    function testPreviewClaimBeforeSettleIsZero() public {
        _bet(alice, UP, 10 ether);
        assertEq(market.previewClaim(0, alice), 0);
    }

    // -------------------------------------------------------------- 跨轮

    function testNextRoundHasFreshState() public {
        _bet(alice, UP, 50 ether);

        vm.roll(ANCHOR + 600);
        _bet(bob, DOWN, 70 ether);

        (uint256 upAmount, uint256 downAmount, , ) = market.pools(0);
        assertEq(upAmount, 50 ether);
        assertEq(downAmount, 0);

        (uint256 up1, uint256 down1, , ) = market.pools(1);
        assertEq(up1, 0);
        assertEq(down1, 70 ether);

        _endRound(0);
        vm.prank(operatorAddr);
        market.settle(0, UP);

        uint256 before = token.balanceOf(alice);
        vm.prank(alice);
        market.claim(0);
        assertEq(token.balanceOf(alice) - before, 50 ether);
    }

    // -------------------------------------------------------------- 权限

    function testOwnerCanRotateOperator() public {
        vm.prank(operatorAddr);
        market.setOperator(bob);
        assertEq(market.operator(), bob);

        vm.prank(operatorAddr);
        vm.expectRevert(PoolMarket.NotOperator.selector);
        market.setAllowed(carol, true);
    }

    function testBatchAllowlist() public {
        address[] memory users = new address[](2);
        users[0] = carol;
        users[1] = address(0xDAD);

        vm.prank(operatorAddr);
        market.setAllowedBatch(users, true);

        assertTrue(market.allowed(carol));
        assertTrue(market.allowed(address(0xDAD)));
    }

    function testRemovingAllowanceBlocksBetting() public {
        vm.prank(operatorAddr);
        market.setAllowed(alice, false);

        vm.prank(alice);
        vm.expectRevert(PoolMarket.NotAllowed.selector);
        market.bet(UP, 1 ether);
    }
}
