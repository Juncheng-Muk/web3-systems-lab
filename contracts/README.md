# Protocol lab

```sh
npm run contracts:compile
npm run test:contracts
npm run contracts:demo
```

| Contract | Invariant / boundary | Executable evidence |
| --- | --- | --- |
| `LabToken` | Fixed supply; allowance required | Conservation + delegated transfer |
| `TrainingBadge` | Fixed issuer; unique ERC-721 ID; evidence hash | Unauthorized / duplicate mint + receiver rollback |
| `SafeVault` | Liabilities ≤ ETH balance; withdrawals survive deposit pause | Adversarial callback + generated action traces |
| `MerkleDistributor` | Allocation bound to index/account/amount; at most once | Forged proof + bitmap boundary + failed-transfer rollback |
| `TimelockTreasury` | Owner schedules; delay enforced; execution at most once | Unauthorized / early / cancelled / repeated execution |

`npm run contracts:demo` produces actual transaction receipts and gas usage in `artifacts/evm-report.json`. All accounts, ETH and deployments are local and ephemeral. Gas results depend on the pinned compiler, optimizer and EVM target.

Scope: educational contracts, no audit. Treasury uses one proposer and does not implement voting. Distributor assumes a standard ERC-20 such as `LabToken`; rebasing and fee-on-transfer tokens are outside the model. A direct forced ETH transfer can create vault surplus, so solvency uses `≤`, not equality.

`TrainingBadge` records an issuer's attestation. It does not grade submissions or verify test results, and token transfers do not transfer the original learner's achievement. Its evidence hash is an application commitment, not an IPFS CID.

References: [OpenZeppelin access control](https://docs.openzeppelin.com/contracts/5.x/access-control), [Merkle tree format](https://github.com/OpenZeppelin/merkle-tree), [Hardhat network manager](https://hardhat.org/docs/reference/network-manager).
