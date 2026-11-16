// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TikTapToken} from "../src/TikTapToken.sol";
import {PoolMarket} from "../src/PoolMarket.sol";

/// 部署脚本。anchor 取部署时的块高，所以本地链上部署完立刻就能从第 0 轮开始下注。
///
/// forge script script/Deploy.s.sol:Deploy \
///   --rpc-url http://127.0.0.1:8545 --broadcast --private-key $PRIVATE_KEY
contract Deploy is Script {
    function run() external returns (TikTapToken token, PoolMarket market) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address operator = vm.envOr("OPERATOR_ADDRESS", vm.addr(deployerKey));

        uint256 anchor = block.number;
        uint256 mintCap = vm.envOr("MINT_CAP", uint256(1000 ether));

        vm.startBroadcast(deployerKey);
        token = new TikTapToken("TikTap", "TIK", mintCap);
        market = new PoolMarket(address(token), operator, anchor);
        vm.stopBroadcast();

        console2.log("anchorBlock", anchor);
        console2.log("token", address(token));
        console2.log("market", address(market));
        console2.log("operator", operator);
    }
}
