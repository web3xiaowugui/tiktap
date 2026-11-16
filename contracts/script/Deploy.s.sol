// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TikTapToken} from "../src/TikTapToken.sol";
import {PoolMarket} from "../src/PoolMarket.sol";

/// 部署脚本：只部署合约本体，不配置市场。
///
/// 市场（标的 × 下注代币）的 marketId ↔ 代币地址映射由后端的 markets 表负责，
/// 后端启动时会按表里的行调用 `setMarket`，避免脚本和数据库各写一份。
///
/// forge script contracts/script/Deploy.s.sol:Deploy --root contracts \
///   --rpc-url http://127.0.0.1:8545 --broadcast --private-key $PRIVATE_KEY
contract Deploy is Script {
    function run() external returns (PoolMarket market, TikTapToken testToken) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address operator = vm.envOr("OPERATOR_ADDRESS", vm.addr(deployerKey));

        uint256 anchor = block.number;
        uint256 mintCap = vm.envOr("MINT_CAP", uint256(1000 ether));

        vm.startBroadcast(deployerKey);

        // 体验币 TEST + 两个本地 mock 的 OKB / BEM（真实网络换成真实代币地址）
        testToken = new TikTapToken("TikTap Test", "TEST", mintCap);
        TikTapToken okb = new TikTapToken("OKB (mock)", "OKB", mintCap);
        TikTapToken bem = new TikTapToken("BEM (mock)", "BEM", mintCap);

        market = new PoolMarket(operator, anchor);

        vm.stopBroadcast();

        console2.log("anchorBlock", anchor);
        console2.log("market", address(market));
        console2.log("operator", operator);
        console2.log("token TEST", address(testToken));
        console2.log("token OKB(mock)", address(okb));
        console2.log("token BEM(mock)", address(bem));
    }
}
