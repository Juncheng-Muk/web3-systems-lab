import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  encodeAbiParameters,
  keccak256,
  parseEther,
  toHex,
  type Address,
  type TransactionReceipt,
} from 'viem';
import { createLabChain } from './contract-demo-runtime.js';
import { projectRoot } from './compile-contracts.js';

const chain = await createLabChain();
const transactions: { action: string; hash: string; gasUsed: string; block: string }[] = [];
const record = (action: string, receipt: TransactionReceipt) => {
  transactions.push({
    action,
    hash: receipt.transactionHash,
    gasUsed: receipt.gasUsed.toString(),
    block: receipt.blockNumber.toString(),
  });
};

try {
  const [owner, learner, executor] = chain.accounts as [Address, Address, Address];
  const token = await chain.deploy('LabToken', [owner]);
  record('deploy:LabToken', token.transaction);
  const vault = await chain.deploy('SafeVault', [owner]);
  record('deploy:SafeVault', vault.transaction);
  const badge = await chain.deploy('TrainingBadge', [owner]);
  record('deploy:TrainingBadge', badge.transaction);
  const evidence = keccak256(toHex('local-demo-submission-v1'));
  record('badge:issuer-attestation', await chain.write(badge, 'mint', [learner, 1n, evidence]));
  assert.equal(await chain.read(badge, 'evidenceHash', [1n]), evidence);
  const allocation = parseEther('100');
  const root = keccak256(
    keccak256(
      encodeAbiParameters(
        [{ type: 'uint256' }, { type: 'address' }, { type: 'uint256' }],
        [0n, learner, allocation],
      ),
    ),
  );
  const distributor = await chain.deploy('MerkleDistributor', [token.address, root]);
  record('deploy:MerkleDistributor', distributor.transaction);
  const treasury = await chain.deploy('TimelockTreasury', [owner, 3600n]);
  record('deploy:TimelockTreasury', treasury.transaction);

  record(
    'fund:distribution',
    await chain.write(token, 'transfer', [distributor.address, allocation]),
  );
  record(
    'claim:valid-proof',
    await chain.write(distributor, 'claim', [0n, learner, allocation, []]),
  );
  assert.equal(await chain.read(token, 'balanceOf', [learner]), allocation);
  await assert.rejects(
    chain.write(distributor, 'claim', [0n, learner, allocation, []]),
    /AlreadyClaimed/,
  );

  record(
    'vault:deposit',
    await chain.write(vault, 'deposit', [], { account: learner, value: parseEther('2') }),
  );
  record(
    'vault:withdraw',
    await chain.write(vault, 'withdraw', [parseEther('0.5'), learner], { account: learner }),
  );
  const adversary = await chain.deploy('VaultAdversary', [vault.address]);
  record('deploy:VaultAdversary', adversary.transaction);
  record(
    'vault:reentrancy-attempt',
    await chain.write(adversary, 'attack', [], { value: parseEther('1') }),
  );
  assert.equal(await chain.read(adversary, 'blocked'), true);
  assert.equal(await chain.read(vault, 'totalLiabilities'), parseEther('1.5'));
  assert.equal(await chain.publicClient.getBalance({ address: vault.address }), parseEther('1.5'));

  record(
    'fund:treasury',
    await chain.receipt(
      await chain.wallet.sendTransaction({
        account: owner,
        to: treasury.address,
        value: parseEther('1'),
      }),
    ),
  );
  const operation = [learner, parseEther('1'), '0x', toHex(1n, { size: 32 })] as const;
  record('treasury:schedule', await chain.write(treasury, 'schedule', operation));
  await assert.rejects(chain.write(treasury, 'execute', operation), /NotReady/);
  await chain.advance(3600);
  record(
    'treasury:execute',
    await chain.write(treasury, 'execute', operation, { account: executor }),
  );
  await assert.rejects(chain.write(treasury, 'execute', operation), /NotPending/);

  const report = {
    environment: 'In-process Hardhat EDR; ephemeral local chain; no public network',
    chainId: await chain.publicClient.getChainId(),
    compiler: token.artifact.compiler,
    evmVersion: 'cancun',
    optimizerRuns: 200,
    contracts: {
      token: token.address,
      vault: vault.address,
      badge: badge.address,
      distributor: distributor.address,
      treasury: treasury.address,
    },
    assertions: [
      'issuer-attestation-recorded',
      'claim-paid',
      'claim-replay-rejected',
      'reentrancy-blocked',
      'vault-solvent',
      'timelock-delay-enforced',
      'timelock-replay-rejected',
    ],
    transactions,
  };
  const directory = resolve(projectRoot, 'artifacts');
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, 'evm-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.table(transactions.map(({ action, gasUsed, block }) => ({ action, gasUsed, block })));
  console.log(`Verified ${report.assertions.length} assertions; artifacts/evm-report.json`);
} finally {
  await chain.close();
}
