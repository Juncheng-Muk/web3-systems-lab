import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { keccak256, stringToHex, type Hex } from 'viem';
import { buildMerkleTree, getMerkleProof, hashMerkleLeaf, verifyMerkleProof } from '../../src/core';

describe('domain-separated Merkle commitments', () => {
  it('verifies every leaf, including Unicode and uneven trees', () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { minLength: 1, maxLength: 48 }), (values) => {
        const tree = buildMerkleTree(values);
        values.forEach((value, index) => {
          const proof = getMerkleProof(tree, index);
          expect(verifyMerkleProof(value, proof, tree.root)).toBe(true);
          expect(verifyMerkleProof(`${value}\u0000`, proof, tree.root)).toBe(false);
        });
      }),
      { numRuns: 60 },
    );
  });

  it('commits ordering, length, and leaf type', () => {
    expect(buildMerkleTree(['a', 'b']).root).not.toBe(buildMerkleTree(['b', 'a']).root);
    expect(buildMerkleTree(['a', 'b', 'c']).root).not.toBe(
      buildMerkleTree(['a', 'b', 'c', 'c']).root,
    );
    expect(hashMerkleLeaf('a')).not.toBe(keccak256(stringToHex('a')));
    expect(buildMerkleTree([]).root).not.toBe(buildMerkleTree(['']).root);
  });

  it('rejects changed siblings, index, count, and proof depth', () => {
    const tree = buildMerkleTree(['alice', 'bob', 'carol']);
    const proof = getMerkleProof(tree, 2);
    expect(verifyMerkleProof('carol', { ...proof, index: 3 }, tree.root)).toBe(false);
    expect(verifyMerkleProof('carol', { ...proof, leafCount: 4 }, tree.root)).toBe(false);
    expect(
      verifyMerkleProof('carol', { ...proof, siblings: proof.siblings.slice(1) }, tree.root),
    ).toBe(false);
    expect(
      verifyMerkleProof('carol', { ...proof, siblings: [...proof.siblings, tree.root] }, tree.root),
    ).toBe(false);
    expect(
      verifyMerkleProof(
        'carol',
        { ...proof, siblings: [tree.root, ...proof.siblings.slice(1)] },
        tree.root,
      ),
    ).toBe(false);
    expect(() => getMerkleProof(tree, -1)).toThrow();
    expect(() => getMerkleProof(buildMerkleTree([]), 0)).toThrow();
  });

  it('does not retain mutable caller arrays', () => {
    const values = ['alice'];
    const tree = buildMerkleTree(values);
    values[0] = 'eve';
    expect(tree.values).toEqual(['alice']);
    expect(verifyMerkleProof('alice', getMerkleProof(tree, 0), tree.root)).toBe(true);
  });

  it('treats hexadecimal letter casing as the same proof bytes', () => {
    const tree = buildMerkleTree(['alice', 'bob', 'carol']);
    const proof = getMerkleProof(tree, 2);
    const uppercase = (value: Hex): Hex => `0x${value.slice(2).toUpperCase()}`;
    expect(
      verifyMerkleProof(
        'carol',
        {
          ...proof,
          siblings: proof.siblings.map(uppercase),
        },
        uppercase(tree.root),
      ),
    ).toBe(true);
  });
});
