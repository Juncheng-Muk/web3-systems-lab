import { concatHex, keccak256, stringToHex, toHex, type Hex } from 'viem';

export interface MerkleTree {
  readonly root: Hex;
  readonly values: readonly string[];
  readonly levels: readonly (readonly Hex[])[];
}

export interface MerkleProof {
  readonly index: number;
  readonly leafCount: number;
  readonly siblings: readonly Hex[];
}

const hashPattern = /^0x[0-9a-fA-F]{64}$/;
const emptyNode = keccak256('0x03');

/** Ordered UTF-8 leaves. Prefixes separate leaves, branches, and root envelopes. */
export function hashMerkleLeaf(value: string): Hex {
  return keccak256(concatHex(['0x00', stringToHex(value)]));
}

function hashBranch(left: Hex, right: Hex): Hex {
  return keccak256(concatHex(['0x01', left, right]));
}

function bindLength(top: Hex, count: number): Hex {
  return keccak256(concatHex(['0x02', toHex(count, { size: 32 }), top]));
}

/** Odd nodes duplicate their sibling; the envelope binds length to avoid ambiguity. */
export function buildMerkleTree(values: readonly string[]): MerkleTree {
  const levels: Hex[][] = [values.map(hashMerkleLeaf)];
  while (levels.at(-1)!.length > 1) {
    const previous = levels.at(-1)!;
    const next: Hex[] = [];
    for (let i = 0; i < previous.length; i += 2) {
      next.push(hashBranch(previous[i]!, previous[i + 1] ?? previous[i]!));
    }
    levels.push(next);
  }
  return Object.freeze({
    root: bindLength(levels.at(-1)![0] ?? emptyNode, values.length),
    values: Object.freeze([...values]),
    levels: Object.freeze(levels.map((level) => Object.freeze(level))),
  });
}

export function getMerkleProof(tree: MerkleTree, index: number): MerkleProof {
  if (!Number.isSafeInteger(index) || index < 0 || index >= tree.values.length) {
    throw new RangeError('Leaf index is outside the tree');
  }
  let cursor = index;
  const siblings: Hex[] = [];
  for (let height = 0; height < tree.levels.length - 1; height++) {
    const level = tree.levels[height]!;
    siblings.push(level[cursor ^ 1] ?? level[cursor]!);
    cursor = Math.floor(cursor / 2);
  }
  return Object.freeze({ index, leafCount: tree.values.length, siblings: Object.freeze(siblings) });
}

export function verifyMerkleProof(value: string, proof: MerkleProof, root: Hex): boolean {
  if (
    !hashPattern.test(root) ||
    !Number.isSafeInteger(proof.leafCount) ||
    proof.leafCount <= 0 ||
    !Number.isSafeInteger(proof.index) ||
    proof.index < 0 ||
    proof.index >= proof.leafCount
  )
    return false;
  let cursor = proof.index;
  let width = proof.leafCount;
  let current = hashMerkleLeaf(value);
  let height = 0;
  while (width > 1) {
    const sibling = proof.siblings[height++];
    if (!sibling || !hashPattern.test(sibling)) return false;
    if (cursor % 2 === 0 && cursor + 1 >= width && sibling.toLowerCase() !== current) return false;
    current = cursor % 2 === 0 ? hashBranch(current, sibling) : hashBranch(sibling, current);
    cursor = Math.floor(cursor / 2);
    width = Math.ceil(width / 2);
  }
  return (
    height === proof.siblings.length &&
    bindLength(current, proof.leafCount).toLowerCase() === root.toLowerCase()
  );
}
