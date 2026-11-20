// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TikTapTestToken} from "../src/TikTapTestToken.sol";

/// 部署新版体验币 TEST（无总量上限、只有 minter 能铸）。
///
/// forge script contracts/script/DeployTestToken.s.sol:DeployTestToken --root contracts \
///   --rpc-url https://testrpc.xlayer.tech/terigon --broadcast --private-key $PRIVATE_KEY
contract DeployTestToken is Script {
    function run() external returns (TikTapTestToken token) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address minter = vm.envOr("MINTER_ADDRESS", vm.addr(deployerKey));

        vm.startBroadcast(deployerKey);
        token = new TikTapTestToken("TikTap Test", "TEST", minter);
        vm.stopBroadcast();

        console2.log("TEST V2", address(token));
        console2.log("minter", minter);
    }
}
