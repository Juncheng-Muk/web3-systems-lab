import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ReorgIndexer, type IndexedBlock, type TransferLog } from '../../src/core';

const genesis: IndexedBlock = { hash: 'genesis', parentHash: null, number: 0, logs: [] };
function log(
  transactionHash: string,
  from: string,
  to: string,
  amount: bigint,
  logIndex = 0,
): TransferLog {
  return { transactionHash, from, to, amount, logIndex };
}
function block(
  hash: string,
  parentHash: string,
  number: number,
  logs: TransferLog[] = [],
): IndexedBlock {
  return { hash, parentHash, number, logs };
}

describe('reorganization-safe indexer', () => {
  it('deduplicates repeated delivery and replaces orphaned effects', () => {
    const indexer = new ReorgIndexer({ alice: 100n });
    indexer.applyBlock(genesis);
    const event = log('tx1', 'alice', 'bob', 30n);
    const first = block('a1', 'genesis', 1, [event, event]);
    indexer.applyBlock(first);
    indexer.applyBlock(block('a2', 'a1', 2, [log('tx2', 'bob', 'carol', 10n)]));
    expect(indexer.applyBlock(first).applied).toBe(false);
    expect(indexer.head).toBe('a2');
    expect(indexer.snapshot().logCount).toBe(2);
    expect(
      indexer.applyBlock(block('b1', 'genesis', 1, [log('tx3', 'alice', 'carol', 50n)])),
    ).toMatchObject({
      applied: true,
      reverted: ['a2', 'a1'],
      head: 'b1',
    });
    expect(indexer.balanceOf('alice')).toBe(50n);
    expect(indexer.balanceOf('bob')).toBe(0n);
    expect(indexer.balanceOf('carol')).toBe(50n);
    expect(indexer.snapshot().logCount).toBe(1);
  });

  it('can extend a previously orphaned branch and preserves only its history', () => {
    const indexer = new ReorgIndexer({ alice: 100n });
    indexer.applyBlock(genesis);
    indexer.applyBlock(block('a1', 'genesis', 1, [log('tx1', 'alice', 'bob', 30n)]));
    indexer.applyBlock(block('b1', 'genesis', 1, [log('tx1', 'alice', 'bob', 30n)]));
    const result = indexer.applyBlock(block('a2', 'a1', 2, [log('tx2', 'bob', 'carol', 10n)]));
    expect(result.reverted).toEqual(['b1']);
    expect(indexer.snapshot().chain).toEqual(['genesis', 'a1', 'a2']);
    expect(indexer.balanceOf('bob')).toBe(20n);
  });

  it('rolls back atomically if any candidate event is invalid', () => {
    const indexer = new ReorgIndexer({ alice: 100n });
    indexer.applyBlock(genesis);
    const before = indexer.snapshot();
    expect(() =>
      indexer.applyBlock(
        block('bad', 'genesis', 1, [
          log('tx1', 'alice', 'bob', 10n, 0),
          log('tx2', 'bob', 'carol', 11n, 1),
        ]),
      ),
    ).toThrow('negative balance');
    expect(indexer.snapshot()).toEqual(before);
    expect(() => indexer.applyBlock(block('child', 'bad', 2))).toThrow('Unknown parent');
    expect(() => indexer.applyBlock(block('gap', 'genesis', 2))).toThrow('Non-contiguous');
    expect(() => indexer.applyBlock({ ...genesis, hash: 'other-genesis' })).toThrow('Genesis');
  });

  it('rejects conflicting hashes, conflicting duplicate logs, and ancestor replay', () => {
    const indexer = new ReorgIndexer({ alice: 100n });
    indexer.applyBlock(genesis);
    const event = log('tx1', 'alice', 'bob', 10n);
    indexer.applyBlock(block('a1', 'genesis', 1, [event]));
    expect(() => indexer.applyBlock(block('a1', 'genesis', 1, []))).toThrow('same hash');
    expect(() => indexer.applyBlock(block('a2', 'a1', 2, [event]))).toThrow('ancestry');
    expect(() =>
      indexer.applyBlock(block('b1', 'genesis', 1, [event, { ...event, amount: 11n }])),
    ).toThrow('Conflicting duplicate');
    expect(() =>
      indexer.applyBlock(block('b1', 'genesis', 1, [event, { ...event, transactionHash: 'tx2' }])),
    ).toThrow('Log indexes');
    expect(indexer.balanceOf('bob')).toBe(10n);
  });

  it('enforces monotonic finality while permitting forks above finalized blocks', () => {
    const indexer = new ReorgIndexer();
    indexer.applyBlock(genesis);
    indexer.applyBlock(block('a1', 'genesis', 1));
    indexer.applyBlock(block('a2', 'a1', 2));
    indexer.finalize(1);
    expect(() => indexer.applyBlock(block('b1', 'genesis', 1))).toThrow('finalized');
    expect(() => indexer.finalize(0)).toThrow();
    indexer.applyBlock(block('b2', 'a1', 2));
    expect(indexer.head).toBe('b2');
  });

  it('handles ERC-20 mint, burn, self-transfer, and detached snapshots', () => {
    const zero = '0x0000000000000000000000000000000000000000';
    const indexer = new ReorgIndexer();
    indexer.applyBlock({ ...genesis, logs: [log('mint', zero, 'alice', 100n)] });
    indexer.applyBlock(
      block('a1', 'genesis', 1, [
        log('self', 'alice', 'alice', 80n),
        log('burn', 'alice', zero, 30n, 1),
      ]),
    );
    const snapshot = indexer.snapshot();
    snapshot.balances.alice = 9_999n;
    expect(indexer.balanceOf('ALICE')).toBe(70n);
    expect(indexer.balanceOf(zero)).toBe(0n);
  });

  it('matches replaying only the selected branch over randomized balances', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 2n, max: 10n ** 18n }),
        fc.integer({ min: 0, max: 100 }),
        (supply, percent) => {
          const indexer = new ReorgIndexer({ alice: supply });
          indexer.applyBlock(genesis);
          indexer.applyBlock(block('a1', 'genesis', 1, [log('tx-a', 'alice', 'bob', supply / 2n)]));
          const transferred = (supply * BigInt(percent)) / 100n;
          indexer.applyBlock(
            block('b1', 'genesis', 1, [log('tx-b', 'alice', 'carol', transferred)]),
          );
          const clean = new ReorgIndexer({ alice: supply });
          clean.applyBlock(genesis);
          clean.applyBlock(block('b1', 'genesis', 1, [log('tx-b', 'alice', 'carol', transferred)]));
          expect(indexer.snapshot()).toEqual(clean.snapshot());
          expect(
            Object.values(indexer.snapshot().balances).reduce((sum, value) => sum + value, 0n),
          ).toBe(supply);
        },
      ),
      { numRuns: 80 },
    );
  });
});
