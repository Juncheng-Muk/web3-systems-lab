// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Immutable allocation commitment; one bit per index prevents replay.
contract MerkleDistributor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    bytes32 public immutable merkleRoot;
    mapping(uint256 => uint256) private claimedWords;

    error InvalidConfiguration();
    error AlreadyClaimed(uint256 index);
    error InvalidProof();
    event Claimed(uint256 indexed index, address indexed account, uint256 amount);

    constructor(IERC20 token_, bytes32 root_) {
        if (address(token_) == address(0) || root_ == bytes32(0)) revert InvalidConfiguration();
        token = token_;
        merkleRoot = root_;
    }

    function isClaimed(uint256 index) public view returns (bool) {
        return (claimedWords[index >> 8] & (uint256(1) << (index & 255))) != 0;
    }

    function claim(uint256 index, address account, uint256 amount, bytes32[] calldata proof)
        external nonReentrant
    {
        if (isClaimed(index)) revert AlreadyClaimed(index);
        // Double hashing matches OpenZeppelin StandardMerkleTree leaf encoding.
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(index, account, amount))));
        if (!MerkleProof.verifyCalldata(proof, merkleRoot, leaf)) revert InvalidProof();
        claimedWords[index >> 8] |= uint256(1) << (index & 255);
        token.safeTransfer(account, amount);
        emit Claimed(index, account, amount);
    }
}
