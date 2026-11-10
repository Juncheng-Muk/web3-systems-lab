// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed supply: no administrator, mint function, tax or upgrade path.
contract LabToken is ERC20 {
    uint256 public constant INITIAL_SUPPLY = 1_000_000 ether;

    constructor(address initialHolder) ERC20("Systems Lab", "LAB") {
        _mint(initialHolder, INITIAL_SUPPLY);
    }
}
