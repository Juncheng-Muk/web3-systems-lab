// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @notice Transferable, issuer-attested NFT. Does not verify learner work.
contract TrainingBadge is ERC721 {
    address public immutable issuer;
    mapping(uint256 => bytes32) public evidenceHash;

    error InvalidIssuer();
    error UnauthorizedIssuer();
    error EmptyEvidence();

    event Issued(uint256 indexed tokenId, address indexed learner, bytes32 evidenceHash);

    constructor(address issuer_) ERC721("Systems Lab Badge", "LAB-BADGE") {
        if (issuer_ == address(0)) revert InvalidIssuer();
        issuer = issuer_;
    }

    function mint(address learner, uint256 tokenId, bytes32 evidence) external {
        if (msg.sender != issuer) revert UnauthorizedIssuer();
        if (evidence == bytes32(0)) revert EmptyEvidence();
        evidenceHash[tokenId] = evidence;
        _safeMint(learner, tokenId);
        emit Issued(tokenId, learner, evidence);
    }
}
