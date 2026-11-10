// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IVault {
    function deposit() external payable;
    function withdraw(uint256 amount, address payable recipient) external;
}

/// @dev Local test harness; records whether the recursive withdrawal was blocked.
contract VaultAdversary {
    IVault public immutable vault;
    bool public attempted;
    bool public blocked;

    constructor(IVault vault_) { vault = vault_; }

    function attack() external payable {
        vault.deposit{value: msg.value}();
        vault.withdraw(msg.value, payable(address(this)));
    }

    receive() external payable {
        if (!attempted) {
            attempted = true;
            try vault.withdraw(msg.value, payable(address(this))) {
                blocked = false;
            } catch {
                blocked = true;
            }
        }
    }
}

contract RejectEther {
    receive() external payable { revert("ETH_REJECTED"); }
}

/// @dev EIP-6780 still transfers ETH; created and destroyed in the same tx.
contract ForceEther {
    constructor(address payable recipient) payable { selfdestruct(recipient); }
}
