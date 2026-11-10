// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Single-proposer timelock, not a voting DAO. Execution is permissionless.
contract TimelockTreasury is Ownable2Step, ReentrancyGuard {
    uint256 public immutable minimumDelay;
    mapping(bytes32 => uint256) public readyAt;
    mapping(bytes32 => bool) public executed;

    error InvalidConfiguration();
    error AlreadyScheduled();
    error NotPending();
    error NotReady();
    error ExecutionFailed(bytes reason);

    event Scheduled(bytes32 indexed id, address indexed target, uint256 value, bytes data, uint256 readyAt);
    event Cancelled(bytes32 indexed id);
    event Executed(bytes32 indexed id);

    constructor(address proposer, uint256 delay) Ownable(proposer) {
        if (delay == 0) revert InvalidConfiguration();
        minimumDelay = delay;
    }

    receive() external payable {}

    function operationId(address target, uint256 value, bytes calldata data, bytes32 salt)
        public view returns (bytes32)
    {
        return keccak256(abi.encode(block.chainid, address(this), target, value, data, salt));
    }

    function schedule(address target, uint256 value, bytes calldata data, bytes32 salt)
        external onlyOwner returns (bytes32 id)
    {
        if (target == address(0)) revert InvalidConfiguration();
        id = operationId(target, value, data, salt);
        if (readyAt[id] != 0 || executed[id]) revert AlreadyScheduled();
        readyAt[id] = block.timestamp + minimumDelay;
        emit Scheduled(id, target, value, data, readyAt[id]);
    }

    function cancel(bytes32 id) external onlyOwner {
        if (readyAt[id] == 0 || executed[id]) revert NotPending();
        delete readyAt[id];
        emit Cancelled(id);
    }

    function execute(address target, uint256 value, bytes calldata data, bytes32 salt)
        external nonReentrant returns (bytes memory result)
    {
        bytes32 id = operationId(target, value, data, salt);
        if (readyAt[id] == 0 || executed[id]) revert NotPending();
        if (block.timestamp < readyAt[id]) revert NotReady();
        executed[id] = true;
        (bool success, bytes memory returned) = target.call{value: value}(data);
        if (!success) revert ExecutionFailed(returned);
        emit Executed(id);
        return returned;
    }
}
