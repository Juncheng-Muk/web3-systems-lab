import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  applyRollupTransaction,
  buildMerkleTree,
  createRollupBatch,
  createTransitionWitness,
  encodeRollupTransaction,
  getMerkleProof,
  rollupStateRoot,
  verifyTransitionWitness,
  type RollupBatch,
  type RollupState,
} from '../../src/core';

const initial: RollupState = {
  alice: { balance: 100n, nonce: 0n },
  bob: { balance: 0n, nonce: 0n },
};
const transactions = [
  { from: 'alice', to: 'bob', amount: 40n, nonce: 0n },
  { from: 'bob', to: 'carol', amount: 10n, nonce: 0n },
];

describe('optimistic execution commitments', () => {
  it('commits deterministic sorted state and verifies honest transitions', () => {
    const batch = createRollupBatch(initial, transactions);
    expect(batch.preStateRoot).toBe(rollupStateRoot({ bob: initial.bob!, alice: initial.alice! }));
    expect(batch.trace).toHaveLength(3);
    expect(batch.states[2]!.carol!.balance).toBe(10n);
    for (let i = 0; i < transactions.length; i++) {
      expect(verifyTransitionWitness(batch, createTransitionWitness(batch, i))).toEqual({
        validWitness: true,
        fraudulent: false,
      });
    }
  });

  it('detects an included invalid transition in a malicious state trace', () => {
    const honest = createRollupBatch(initial, transactions.slice(0, 1));
    const fabricatedState = {
      alice: { balance: 60n, nonce: 1n },
      bob: { balance: 400n, nonce: 0n },
    };
    const fabricatedRoot = rollupStateRoot(fabricatedState);
    const trace = [honest.preStateRoot, fabricatedRoot];
    const malicious: RollupBatch = {
      ...honest,
      postStateRoot: fabricatedRoot,
      trace,
      states: [initial, fabricatedState],
      traceRoot: buildMerkleTree(trace).root,
    };
    expect(verifyTransitionWitness(malicious, createTransitionWitness(malicious, 0))).toEqual({
      validWitness: true,
      fraudulent: true,
    });
  });

  it('detects overspending committed by an untrusted sequencer', () => {
    const tx = { from: 'alice', to: 'bob', amount: 101n, nonce: 0n };
    const stateRoot = rollupStateRoot(initial);
    const txTree = buildMerkleTree([encodeRollupTransaction(tx)]);
    const traceTree = buildMerkleTree([stateRoot, stateRoot]);
    expect(
      verifyTransitionWitness(
        {
          preStateRoot: stateRoot,
          postStateRoot: stateRoot,
          transactionsRoot: txTree.root,
          traceRoot: traceTree.root,
          transactionCount: 1,
        },
        {
          transaction: tx,
          transactionProof: getMerkleProof(txTree, 0),
          beforeState: initial,
          afterState: initial,
          beforeProof: getMerkleProof(traceTree, 0),
          afterProof: getMerkleProof(traceTree, 1),
        },
      ),
    ).toEqual({ validWitness: true, fraudulent: true });
  });

  it('authenticates a committed zero-value operation before proving it invalid', () => {
    const tx = { from: 'alice', to: 'bob', amount: 0n, nonce: 0n };
    expect(() => applyRollupTransaction(initial, tx)).toThrow('positive');
    expect(() => createRollupBatch(initial, [tx])).toThrow('positive');
    const root = rollupStateRoot(initial);
    const transactionsTree = buildMerkleTree([encodeRollupTransaction(tx)]);
    const traceTree = buildMerkleTree([root, root]);
    expect(
      verifyTransitionWitness(
        {
          preStateRoot: root,
          postStateRoot: root,
          transactionsRoot: transactionsTree.root,
          traceRoot: traceTree.root,
          transactionCount: 1,
        },
        {
          transaction: tx,
          transactionProof: getMerkleProof(transactionsTree, 0),
          beforeState: initial,
          afterState: initial,
          beforeProof: getMerkleProof(traceTree, 0),
          afterProof: getMerkleProof(traceTree, 1),
        },
      ),
    ).toEqual({ validWitness: true, fraudulent: true });
  });

  it('rejects fabricated or non-adjacent witnesses rather than claiming fraud', () => {
    const batch = createRollupBatch(initial, transactions);
    const witness = createTransitionWitness(batch, 0);
    expect(verifyTransitionWitness(batch, { ...witness, afterState: initial })).toEqual({
      validWitness: false,
      fraudulent: false,
    });
    expect(
      verifyTransitionWitness(batch, {
        ...witness,
        transaction: { ...witness.transaction, amount: 99n },
      }),
    ).toEqual({ validWitness: false, fraudulent: false });
    const other = createTransitionWitness(batch, 1);
    expect(
      verifyTransitionWitness(batch, {
        ...witness,
        afterState: other.afterState,
        afterProof: other.afterProof,
      }),
    ).toEqual({ validWitness: false, fraudulent: false });
  });

  it('preserves supply and consumes one nonce for randomized valid steps', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10n ** 24n }),
        fc.integer({ min: 1, max: 100 }),
        (supply, percent) => {
          const state = { alice: { balance: supply, nonce: 7n } };
          const amount = 1n + ((supply - 1n) * BigInt(percent)) / 100n;
          const next = applyRollupTransaction(state, {
            from: 'alice',
            to: 'bob',
            amount,
            nonce: 7n,
          });
          expect(next.alice!.balance + next.bob!.balance).toBe(supply);
          expect(next.alice!.nonce).toBe(8n);
          expect(state.alice.balance).toBe(supply);
        },
      ),
      { numRuns: 80 },
    );
  });

  it('rejects nonce gaps and treats self-transfer as a nonce-only transition', () => {
    expect(() => applyRollupTransaction(initial, { ...transactions[0]!, nonce: 1n })).toThrow(
      'nonce',
    );
    const next = applyRollupTransaction(initial, {
      from: 'alice',
      to: 'alice',
      amount: 100n,
      nonce: 0n,
    });
    expect(next.alice).toEqual({ balance: 100n, nonce: 1n });
    const empty = createRollupBatch(initial, []);
    expect(empty.preStateRoot).toBe(empty.postStateRoot);
    expect(() => createTransitionWitness(empty, 0)).toThrow();
  });
});
