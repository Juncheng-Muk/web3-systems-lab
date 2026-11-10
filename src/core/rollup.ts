import { type Hex } from 'viem';
import { buildMerkleTree, getMerkleProof, verifyMerkleProof, type MerkleProof } from './merkle';

export interface RollupAccount {
  readonly balance: bigint;
  readonly nonce: bigint;
}
export type RollupState = Readonly<Record<string, RollupAccount>>;
export interface RollupTransaction {
  readonly from: string;
  readonly to: string;
  readonly amount: bigint;
  readonly nonce: bigint;
}
export interface RollupCommitment {
  readonly preStateRoot: Hex;
  readonly postStateRoot: Hex;
  readonly transactionsRoot: Hex;
  readonly traceRoot: Hex;
  readonly transactionCount: number;
}
export interface RollupBatch extends RollupCommitment {
  readonly transactions: readonly RollupTransaction[];
  readonly states: readonly RollupState[];
  readonly trace: readonly Hex[];
}
export interface TransitionWitness {
  readonly transaction: RollupTransaction;
  readonly transactionProof: MerkleProof;
  readonly beforeState: RollupState;
  readonly afterState: RollupState;
  readonly beforeProof: MerkleProof;
  readonly afterProof: MerkleProof;
}

function validAccountName(value: string): void {
  if (!/^[a-z0-9_-]{1,64}$/.test(value))
    throw new Error('Account names must be canonical lowercase identifiers');
}

function copyState(state: RollupState): Record<string, RollupAccount> {
  const copy: Record<string, RollupAccount> = Object.create(null) as Record<string, RollupAccount>;
  for (const [name, account] of Object.entries(state)) {
    validAccountName(name);
    if (account.balance < 0n || account.nonce < 0n) throw new Error('Negative account state');
    copy[name] = Object.freeze({ balance: account.balance, nonce: account.nonce });
  }
  return copy;
}

export function rollupStateRoot(state: RollupState): Hex {
  const canonical = copyState(state);
  return buildMerkleTree(
    Object.keys(canonical)
      .sort()
      .map((name) =>
        JSON.stringify([
          name,
          canonical[name]!.balance.toString(),
          canonical[name]!.nonce.toString(),
        ]),
      ),
  ).root;
}

export function encodeRollupTransaction(tx: RollupTransaction): string {
  validAccountName(tx.from);
  validAccountName(tx.to);
  // Encoding checks the domain, not execution validity: a sequencer can commit
  // a zero-value operation, and a challenger must still authenticate its bytes.
  if (tx.amount < 0n || tx.nonce < 0n) throw new Error('Invalid rollup transaction');
  return JSON.stringify([tx.from, tx.to, tx.amount.toString(), tx.nonce.toString()]);
}

/** Deterministic execution kernel; transaction authentication is a separate ledger layer. */
export function applyRollupTransaction(state: RollupState, tx: RollupTransaction): RollupState {
  encodeRollupTransaction(tx);
  if (tx.amount === 0n) throw new Error('Rollup amount must be positive');
  const next = copyState(state);
  const sender = next[tx.from];
  if (!sender || sender.nonce !== tx.nonce) throw new Error('Invalid rollup nonce');
  if (sender.balance < tx.amount) throw new Error('Insufficient rollup balance');
  if (tx.from === tx.to) {
    next[tx.from] = Object.freeze({ balance: sender.balance, nonce: sender.nonce + 1n });
  } else {
    const recipient = next[tx.to] ?? { balance: 0n, nonce: 0n };
    next[tx.from] = Object.freeze({
      balance: sender.balance - tx.amount,
      nonce: sender.nonce + 1n,
    });
    next[tx.to] = Object.freeze({ balance: recipient.balance + tx.amount, nonce: recipient.nonce });
  }
  return Object.freeze(next);
}

/** Commit an execution trace, including the initial state, for one-step disputes. */
export function createRollupBatch(
  initialState: RollupState,
  input: readonly RollupTransaction[],
): RollupBatch {
  const transactions = Object.freeze(input.map((tx) => Object.freeze({ ...tx })));
  const states: RollupState[] = [Object.freeze(copyState(initialState))];
  for (const tx of transactions) states.push(applyRollupTransaction(states.at(-1)!, tx));
  const trace = Object.freeze(states.map(rollupStateRoot));
  return Object.freeze({
    preStateRoot: trace[0]!,
    postStateRoot: trace.at(-1)!,
    transactionsRoot: buildMerkleTree(transactions.map(encodeRollupTransaction)).root,
    traceRoot: buildMerkleTree(trace).root,
    transactionCount: transactions.length,
    transactions,
    states: Object.freeze(states),
    trace,
  });
}

export function createTransitionWitness(batch: RollupBatch, index: number): TransitionWitness {
  if (!Number.isSafeInteger(index) || index < 0 || index >= batch.transactions.length)
    throw new RangeError('Invalid transition index');
  const traceTree = buildMerkleTree(batch.trace);
  return Object.freeze({
    transaction: batch.transactions[index]!,
    transactionProof: getMerkleProof(
      buildMerkleTree(batch.transactions.map(encodeRollupTransaction)),
      index,
    ),
    beforeState: batch.states[index]!,
    afterState: batch.states[index + 1]!,
    beforeProof: getMerkleProof(traceTree, index),
    afterProof: getMerkleProof(traceTree, index + 1),
  });
}

/** Reject forged witnesses; prove fraud only for an included but invalid transition. */
export function verifyTransitionWitness(
  commitment: RollupCommitment,
  witness: TransitionWitness,
): { validWitness: boolean; fraudulent: boolean } {
  const invalid = { validWitness: false, fraudulent: false };
  try {
    const index = witness.transactionProof.index;
    if (
      !Number.isSafeInteger(commitment.transactionCount) ||
      commitment.transactionCount < 1 ||
      witness.transactionProof.leafCount !== commitment.transactionCount ||
      witness.beforeProof.leafCount !== commitment.transactionCount + 1 ||
      witness.afterProof.leafCount !== commitment.transactionCount + 1 ||
      witness.beforeProof.index !== index ||
      witness.afterProof.index !== index + 1
    )
      return invalid;
    const beforeRoot = rollupStateRoot(witness.beforeState);
    const afterRoot = rollupStateRoot(witness.afterState);
    if (
      !verifyMerkleProof(
        encodeRollupTransaction(witness.transaction),
        witness.transactionProof,
        commitment.transactionsRoot,
      ) ||
      !verifyMerkleProof(beforeRoot, witness.beforeProof, commitment.traceRoot) ||
      !verifyMerkleProof(afterRoot, witness.afterProof, commitment.traceRoot) ||
      (index === 0 && beforeRoot !== commitment.preStateRoot) ||
      (index === commitment.transactionCount - 1 && afterRoot !== commitment.postStateRoot)
    )
      return invalid;
    try {
      const expected = rollupStateRoot(
        applyRollupTransaction(witness.beforeState, witness.transaction),
      );
      return { validWitness: true, fraudulent: expected !== afterRoot };
    } catch {
      return { validWitness: true, fraudulent: true };
    }
  } catch {
    return invalid;
  }
}
