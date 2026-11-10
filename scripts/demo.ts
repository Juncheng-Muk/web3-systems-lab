import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { keccak256, toHex } from 'viem';
import {
  buildMerkleTree,
  getMerkleProof,
  verifyMerkleProof,
  executeSwap,
  SignedLedger,
  createTransferTypedData,
  ReorgIndexer,
  createRollupBatch,
  createTransitionWitness,
  verifyTransitionWitness,
  createRawCid,
  verifyRawCid,
  QuorumTracker,
} from '../src/core/index.js';

const checks: { system: string; assertion: string; result: 'PASS' }[] = [];
const passed = (system: string, assertion: string) =>
  checks.push({ system, assertion, result: 'PASS' });
const tree = buildMerkleTree(['alice:100', 'bob:50', 'carol:25']);
const proof = getMerkleProof(tree, 1);
assert(verifyMerkleProof('bob:50', proof, tree.root));
assert(!verifyMerkleProof('bob:500', proof, tree.root));
passed('Merkle', 'membership accepted; tampering rejected');

const cid = await createRawCid('web3-systems-lab');
assert(await verifyRawCid('web3-systems-lab', cid));
assert(!(await verifyRawCid('tampered', cid)));
passed('Content', 'CIDv1 authenticates bytes');

const sender = privateKeyToAccount(generatePrivateKey());
const receiver = privateKeyToAccount(generatePrivateKey());
const ledger = new SignedLedger({ [sender.address]: 1000n });
const transfer = {
  from: sender.address,
  to: receiver.address,
  amount: 125n,
  nonce: 0n,
  deadline: 2_000_000_000n,
};
const signature = await sender.signTypedData(createTransferTypedData(transfer));
await ledger.submit(transfer, signature, 1_000_000_000n);
await assert.rejects(ledger.submit(transfer, signature, 1_000_000_000n));
assert.equal(ledger.balanceOf(sender.address) + ledger.balanceOf(receiver.address), 1000n);
passed('EIP-712', 'signed transfer conserves supply; replay rejected');

const swap = executeSwap(100n, 10_000n, 20_000n);
assert(swap.kAfter >= swap.kBefore);
passed('AMM', 'integer quote preserves constant-product inequality');

const indexer = new ReorgIndexer({ alice: 100n });
indexer.applyBlock({ hash: 'genesis', parentHash: null, number: 0, logs: [] });
const block = (hash: string, amount: bigint) => ({
  hash,
  parentHash: 'genesis',
  number: 1,
  logs: [{ transactionHash: hash, logIndex: 0, from: 'alice', to: 'bob', amount }],
});
indexer.applyBlock(block('branch-a', 20n));
const reorg = indexer.applyBlock(block('branch-b', 7n));
assert.deepEqual(reorg.reverted, ['branch-a']);
assert.equal(indexer.balanceOf('bob'), 7n);
assert.equal(indexer.applyBlock(block('branch-b', 7n)).applied, false);
passed('Indexer', 'branch rollback and duplicate delivery are atomic');

const quorum = new QuorumTracker(['alice', 'bob', 'carol', 'dave']);
const blockHash = keccak256(toHex('block:1'));
for (const validator of ['alice', 'bob'])
  assert.equal(quorum.recordVote({ validator, height: 1, round: 0, blockHash }).certificate, null);
assert(quorum.recordVote({ validator: 'carol', height: 1, round: 0, blockHash }).certificate);
passed('Quorum', 'three of four authenticated votes reach the local threshold');

const batch = createRollupBatch({ alice: { balance: 100n, nonce: 0n } }, [
  { from: 'alice', to: 'bob', amount: 30n, nonce: 0n },
]);
assert.deepEqual(verifyTransitionWitness(batch, createTransitionWitness(batch, 0)), {
  validWitness: true,
  fraudulent: false,
});
passed('Rollup', 'committed execution step verifies');

mkdirSync('artifacts', { recursive: true });
writeFileSync(
  'artifacts/core-report.json',
  JSON.stringify(
    {
      scope: 'Local teaching models; no public transactions',
      checks,
      commitments: { merkle: tree.root, cid, rollup: batch.postStateRoot },
    },
    null,
    2,
  ) + '\n',
);
console.table(checks);
console.log('Evidence: artifacts/core-report.json');
