// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Native-ETH custody exercise. Invariant: totalLiabilities <= balance.
contract SafeVault is Ownable2Step, ReentrancyGuard {
    mapping(address => uint256) public balanceOf;
    uint256 public totalLiabilities;
    bool public depositsPaused;

    error ZeroAmount();
    error DepositsPaused();
    error InsufficientBalance();
    error InvalidRecipient();
    error TransferFailed();

    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, address indexed recipient, uint256 amount);
    event DepositsPauseChanged(bool paused);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setDepositsPaused(bool paused) external onlyOwner {
        depositsPaused = paused;
        emit DepositsPauseChanged(paused);
    }

    function deposit() external payable nonReentrant {
        if (depositsPaused) revert DepositsPaused();
        if (msg.value == 0) revert ZeroAmount();
        balanceOf[msg.sender] += msg.value;
        totalLiabilities += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    // Pausing new exposure must never prevent existing users from exiting.
    function withdraw(uint256 amount, address payable recipient) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert InvalidRecipient();
        if (amount > balanceOf[msg.sender]) revert InsufficientBalance();

        balanceOf[msg.sender] -= amount;
        totalLiabilities -= amount;
        (bool sent,) = recipient.call{value: amount}("");
        if (!sent) revert TransferFailed();
        emit Withdrawn(msg.sender, recipient, amount);
    }
}
