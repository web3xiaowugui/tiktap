// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {WOKB} from "../src/WOKB.sol";

/// 只部署测试网用的 WOKB wrapper；主网直接用官方 WOKB。
contract DeployWOKB is Script {
    function run() external returns (WOKB wokb) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        wokb = new WOKB();
        vm.stopBroadcast();
        console2.log("WOKB", address(wokb));
    }
}
