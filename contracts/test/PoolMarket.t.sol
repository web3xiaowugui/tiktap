// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PoolMarket} from "../src/PoolMarket.sol";
import {TikTapToken} from "../src/TikTapToken.sol";

contract PoolMarketTest is Test {
    PoolMarket internal market;

    /// 三个下注代币：TEST（我们的体验币）/ OKB / BEM。
    TikTapToken internal testToken;
    TikTapToken internal okbToken;
    TikTapToken internal bemToken;

    uint8 internal constant MARKET_TEST = 1; // BTC/TEST
    uint8 internal constant MARKET_OKB = 2; // BTC/OKB
    uint8 internal constant MARKET_BEM = 3; // BTC/BEM

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

        testToken = new TikTapToken("TikTap Test", "TEST", CAP);
        okbToken = new TikTapToken("OKB (mock)", "OKB", CAP);
        bemToken = new TikTapToken("BEM (mock)", "BEM", CAP);

        market = new PoolMarket(operatorAddr, ANCHOR);

        vm.startPrank(operatorAddr);
        market.setMarket(MARKET_TEST, address(testToken), true);
        market.setMarket(MARKET_OKB, address(okbToken), true);
        market.setMarket(MARKET_BEM, address(bemToken), true);
        market.setAllowed(alice, true);
        market.setAllowed(bob, true);
        vm.stopPrank();

        _fund(alice);
        _fund(bob);
        _fund(carol);
    }

    // ------------------------------------------------------------- helpers

    function _fund(address who) internal {
        vm.startPrank(who);
        testToken.mint(CAP);
        testToken.approve(address(market), type(uint256).max);
        okbToken.mint(CAP);
        okbToken.approve(address(market), type(uint256).max);
        bemToken.mint(CAP);
        bemToken.approve(address(market), type(uint256).max);
        vm.stopPrank();
    }

    function _bet(address who, uint8 marketId, uint8 side, uint256 amount) internal {
        vm.prank(who);
        market.bet(marketId, side, amount);
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
        market.bet(MARKET_TEST, UP, 1 ether);
    }

    // -------------------------------------------------------------- 下注

    function testBetMovesTokensAndUpdatesPool() public {
        _bet(alice, MARKET_TEST, UP, 100 ether);

        assertEq(testToken.balanceOf(alice), 900 ether);
        assertEq(testToken.balanceOf(address(market)), 100 ether);

        (uint256 upAmount, uint256 downAmount, uint8 winner, bool settled) = market.pools(
            0,
            MARKET_TEST
        );
        assertEq(upAmount, 100 ether);
        assertEq(downAmount, 0);
        assertEq(winner, 0);
        assertFalse(settled);

        (uint256 up, uint256 down) = market.stakeOf(MARKET_TEST, 0, alice);
        assertEq(up, 100 ether);
        assertEq(down, 0);
    }

    function testBetAccumulatesWithinRound() public {
        _bet(alice, MARKET_TEST, UP, 10 ether);
        _bet(alice, MARKET_TEST, DOWN, 20 ether);
        _bet(bob, MARKET_TEST, UP, 30 ether);

        (uint256 up, uint256 down) = market.stakeOf(MARKET_TEST, 0, alice);
        assertEq(up, 10 ether);
        assertEq(down, 20 ether);

        (uint256 upAmount, uint256 downAmount, , ) = market.pools(0, MARKET_TEST);
        assertEq(upAmount, 40 ether);
        assertEq(downAmount, 20 ether);
    }

    function testBetByNonAllowedReverts() public {
        vm.prank(carol);
        vm.expectRevert(PoolMarket.NotAllowed.selector);
        market.bet(MARKET_TEST, UP, 1 ether);
    }

    function testBetBadSideReverts() public {
        vm.prank(alice);
        vm.expectRevert(PoolMarket.BadSide.selector);
        market.bet(MARKET_TEST, 3, 1 ether);
    }

    function testBetZeroReverts() public {
        vm.prank(alice);
        vm.expectRevert(PoolMarket.ZeroAmount.selector);
        market.bet(MARKET_TEST, UP, 0);
    }

    function testBetOnUnknownMarketReverts() public {
        vm.prank(alice);
        vm.expectRevert(PoolMarket.UnknownMarket.selector);
        market.bet(9, UP, 1 ether);
    }

    function testBetOnDisabledMarketReverts() public {
        vm.prank(operatorAddr);
        market.setMarket(MARKET_BEM, address(bemToken), false);

        vm.prank(alice);
        vm.expectRevert(PoolMarket.MarketDisabled.selector);
        market.bet(MARKET_BEM, UP, 1 ether);
    }

    function testBetWithoutApprovalReverts() public {
        address dave = makeAddr("dave");
        vm.prank(operatorAddr);
        market.setAllowed(dave, true);

        vm.prank(dave);
        testToken.mint(10 ether);

        vm.prank(dave);
        vm.expectRevert(
            abi.encodeWithSelector(TikTapToken.InsufficientAllowance.selector, 0, 1 ether)
        );
        market.bet(MARKET_TEST, UP, 1 ether);
    }

    // -------------------------------------------------- 市场之间互不干扰

    /// 同一轮里，BTC/OKB 和 BTC/BEM 是两个独立池子，各自用自己的代币。
    function testMarketsInSameRoundAreIsolated() public {
        _bet(alice, MARKET_OKB, UP, 100 ether);
        _bet(bob, MARKET_OKB, DOWN, 50 ether);
        _bet(alice, MARKET_BEM, UP, 70 ether);

        (uint256 upOkb, uint256 downOkb, , ) = market.pools(0, MARKET_OKB);
        assertEq(upOkb, 100 ether);
        assertEq(downOkb, 50 ether);

        (uint256 upBem, uint256 downBem, , ) = market.pools(0, MARKET_BEM);
        assertEq(upBem, 70 ether);
        assertEq(downBem, 0);

        // 两个池子的钱分别躺在各自代币的余额里。
        assertEq(okbToken.balanceOf(address(market)), 150 ether);
        assertEq(bemToken.balanceOf(address(market)), 70 ether);
        assertEq(testToken.balanceOf(address(market)), 0);
    }

    function testSettleOneMarketLeavesOtherUntouched() public {
        _bet(alice, MARKET_OKB, UP, 100 ether);
        _bet(bob, MARKET_OKB, DOWN, 50 ether);
        _bet(alice, MARKET_BEM, UP, 70 ether);

        _endRound(0);
        vm.prank(operatorAddr);
        market.settle(MARKET_OKB, 0, UP);

        (, , , bool okbSettled) = market.pools(0, MARKET_OKB);
        (, , , bool bemSettled) = market.pools(0, MARKET_BEM);
        assertTrue(okbSettled);
        assertFalse(bemSettled);

        // OKB 市场派奖，付的是 OKB 代币。
        uint256 before = okbToken.balanceOf(alice);
        vm.prank(alice);
        market.claim(MARKET_OKB, 0);
        assertEq(okbToken.balanceOf(alice) - before, 150 ether);
        assertEq(okbToken.balanceOf(address(market)), 0);

        // BEM 市场的钱没动。
        assertEq(bemToken.balanceOf(address(market)), 70 ether);
    }

    function testClaimOnWrongMarketReverts() public {
        _bet(alice, MARKET_OKB, UP, 100 ether);
        _bet(bob, MARKET_OKB, DOWN, 50 ether);

        _endRound(0);
        vm.prank(operatorAddr);
        market.settle(MARKET_OKB, 0, UP);

        // alice 在 BEM 市场没押过，也没结算。
        vm.prank(alice);
        vm.expectRevert(PoolMarket.NotSettled.selector);
        market.claim(MARKET_BEM, 0);
    }

    // -------------------------------------------------------------- 结算

    function testOnlyOperatorCanSettle() public {
        _endRound(0);
        vm.prank(alice);
        vm.expectRevert(PoolMarket.NotOperator.selector);
        market.settle(MARKET_TEST, 0, UP);
    }

    function testSettleBeforeRoundEndReverts() public {
        vm.roll(ANCHOR + 599);
        vm.prank(operatorAddr);
        vm.expectRevert(PoolMarket.RoundNotFinished.selector);
        market.settle(MARKET_TEST, 0, UP);
    }

    function testDoubleSettleReverts() public {
        _endRound(0);
        vm.startPrank(operatorAddr);
        market.settle(MARKET_TEST, 0, UP);
        vm.expectRevert(PoolMarket.AlreadySettled.selector);
        market.settle(MARKET_TEST, 0, UP);
        vm.stopPrank();
    }

    function testSettleBadWinnerReverts() public {
        _endRound(0);
        vm.prank(operatorAddr);
        vm.expectRevert(PoolMarket.BadSide.selector);
        market.settle(MARKET_TEST, 0, 3);
    }

    // -------------------------------------------------------------- 派奖

    function testWinnerTakesWholePot() public {
        _bet(alice, MARKET_OKB, UP, 400 ether);
        _bet(bob, MARKET_OKB, DOWN, 600 ether);

        _endRound(0);
        vm.prank(operatorAddr);
        market.settle(MARKET_OKB, 0, UP);

        uint256 before = okbToken.balanceOf(alice);
        vm.prank(alice);
        market.claim(MARKET_OKB, 0);

        assertEq(okbToken.balanceOf(alice) - before, 1000 ether);
        assertEq(okbToken.balanceOf(address(market)), 0);
    }

    function testWinnersSplitByShare() public {
        _bet(alice, MARKET_OKB, UP, 300 ether);
        _bet(bob, MARKET_OKB, DOWN, 700 ether);
        vm.prank(operatorAddr);
        market.setAllowed(carol, true);
        _bet(carol, MARKET_OKB, UP, 200 ether);

        _endRound(0);
        vm.prank(operatorAddr);
        market.settle(MARKET_OKB, 0, DOWN);

        uint256 pot = 1200 ether;
        uint256 downPool = 700 ether;

        uint256 bobBefore = okbToken.balanceOf(bob);
        vm.prank(bob);
        market.claim(MARKET_OKB, 0);
        assertEq(okbToken.balanceOf(bob) - bobBefore, pot * 700 ether / downPool);

        vm.prank(alice);
        vm.expectRevert(PoolMarket.NothingToClaim.selector);
        market.claim(MARKET_OKB, 0);
    }

    function testDoubleClaimReverts() public {
        _bet(alice, MARKET_TEST, UP, 100 ether);
        _bet(bob, MARKET_TEST, DOWN, 100 ether);

        _endRound(0);
        vm.prank(operatorAddr);
        market.settle(MARKET_TEST, 0, UP);

        vm.prank(alice);
        market.claim(MARKET_TEST, 0);

        vm.prank(alice);
        vm.expectRevert(PoolMarket.AlreadyClaimed.selector);
        market.claim(MARKET_TEST, 0);
    }

    function testClaimBeforeSettleReverts() public {
        _bet(alice, MARKET_TEST, UP, 100 ether);
        vm.prank(alice);
        vm.expectRevert(PoolMarket.NotSettled.selector);
        market.claim(MARKET_TEST, 0);
    }

    // -------------------------------------------------------------- 退款

    function testOneSidedRoundRefunds() public {
        _bet(alice, MARKET_TEST, UP, 100 ether);
        assertTrue(market.isVoidRound(MARKET_TEST, 0));

        _endRound(0);
        vm.prank(operatorAddr);
        market.settle(MARKET_TEST, 0, DOWN);

        uint256 before = testToken.balanceOf(alice);
        vm.prank(alice);
        market.claim(MARKET_TEST, 0);
        assertEq(testToken.balanceOf(alice) - before, 100 ether);
        assertEq(testToken.balanceOf(address(market)), 0);
    }

    function testVoidRoundRefundsBothSides() public {
        _bet(alice, MARKET_TEST, UP, 120 ether);
        _bet(bob, MARKET_TEST, DOWN, 80 ether);

        _endRound(0);
        vm.prank(operatorAddr);
        market.settle(MARKET_TEST, 0, VOID);

        uint256 aliceBefore = testToken.balanceOf(alice);
        vm.prank(alice);
        market.claim(MARKET_TEST, 0);
        assertEq(testToken.balanceOf(alice) - aliceBefore, 120 ether);

        uint256 bobBefore = testToken.balanceOf(bob);
        vm.prank(bob);
        market.claim(MARKET_TEST, 0);
        assertEq(testToken.balanceOf(bob) - bobBefore, 80 ether);

        assertEq(testToken.balanceOf(address(market)), 0);
    }

    // -------------------------------------------------------------- 预览

    function testPreviewClaimMatchesActual() public {
        _bet(alice, MARKET_OKB, UP, 400 ether);
        _bet(bob, MARKET_OKB, DOWN, 600 ether);

        _endRound(0);
        vm.prank(operatorAddr);
        market.settle(MARKET_OKB, 0, UP);

        assertEq(market.previewClaim(MARKET_OKB, 0, alice), 1000 ether);
        assertEq(market.previewClaim(MARKET_OKB, 0, bob), 0);
    }

    function testPreviewClaimBeforeSettleIsZero() public {
        _bet(alice, MARKET_TEST, UP, 10 ether);
        assertEq(market.previewClaim(MARKET_TEST, 0, alice), 0);
    }

    /// 派奖向下取整：除不尽的那点零头留在合约里，不做二次分配。
    function testRoundingDustStaysInContract() public {
        _bet(alice, MARKET_TEST, UP, 100);
        _bet(bob, MARKET_TEST, UP, 200);
        vm.prank(operatorAddr);
        market.setAllowed(carol, true);
        _bet(carol, MARKET_TEST, DOWN, 400);

        _endRound(0);
        vm.prank(operatorAddr);
        market.settle(MARKET_TEST, 0, UP);

        assertEq(market.previewClaim(MARKET_TEST, 0, alice), 233);
        assertEq(market.previewClaim(MARKET_TEST, 0, bob), 466);

        vm.prank(alice);
        market.claim(MARKET_TEST, 0);
        vm.prank(bob);
        market.claim(MARKET_TEST, 0);

        assertEq(testToken.balanceOf(address(market)), 1);
    }

    // -------------------------------------------------------------- 跨轮

    function testNextRoundHasFreshState() public {
        _bet(alice, MARKET_TEST, UP, 50 ether);

        vm.roll(ANCHOR + 600);
        _bet(bob, MARKET_TEST, DOWN, 70 ether);

        (uint256 upAmount, uint256 downAmount, , ) = market.pools(0, MARKET_TEST);
        assertEq(upAmount, 50 ether);
        assertEq(downAmount, 0);

        (uint256 up1, uint256 down1, , ) = market.pools(1, MARKET_TEST);
        assertEq(up1, 0);
        assertEq(down1, 70 ether);

        _endRound(0);
        vm.prank(operatorAddr);
        market.settle(MARKET_TEST, 0, UP);

        uint256 before = testToken.balanceOf(alice);
        vm.prank(alice);
        market.claim(MARKET_TEST, 0);
        assertEq(testToken.balanceOf(alice) - before, 50 ether);
    }

    // -------------------------------------------------------------- 权限

    function testOperatorCanRotate() public {
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
        market.bet(MARKET_TEST, UP, 1 ether);
    }

    function testReconfiguringMarketReplacesToken() public {
        vm.prank(operatorAddr);
        market.setMarket(MARKET_TEST, address(bemToken), true);

        (address token, bool enabled) = market.markets(MARKET_TEST);
        assertEq(token, address(bemToken));
        assertTrue(enabled);

        _bet(alice, MARKET_TEST, UP, 10 ether);
        assertEq(bemToken.balanceOf(address(market)), 10 ether);
    }
}
