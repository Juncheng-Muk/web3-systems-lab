import type { Hex } from 'viem';

export interface QuorumVote {
  readonly validator: string;
  readonly height: number;
  readonly round: number;
  readonly blockHash: Hex;
}

export interface QuorumCertificate {
  readonly height: number;
  readonly round: number;
  readonly blockHash: Hex;
  readonly signers: readonly string[];
}

export interface VoteResult {
  readonly accepted: boolean;
  readonly support: number;
  readonly quorum: number;
  readonly certificate: QuorumCertificate | null;
}

function committeeOf(validators: readonly string[]): Set<string> {
  quorumThreshold(validators.length);
  const members = new Set(validators);
  if (members.size !== validators.length) throw new Error('Duplicate validator');
  if (validators.some((id) => !/^[a-z][a-z0-9_-]{0,63}$/.test(id)))
    throw new Error('Invalid validator identifier');
  return members;
}

function validPosition(height: number, round: number, hash: string): boolean {
  return (
    Number.isSafeInteger(height) &&
    height >= 0 &&
    Number.isSafeInteger(round) &&
    round >= 0 &&
    /^0x[0-9a-fA-F]{64}$/.test(hash)
  );
}

/** Strictly more than two thirds of an equal-weight, fixed validator set. */
export function quorumThreshold(validatorCount: number): number {
  if (!Number.isSafeInteger(validatorCount) || validatorCount < 1)
    throw new RangeError('Invalid validator count');
  return Number((2n * BigInt(validatorCount)) / 3n + 1n);
}

/** Membership/count checks only. The caller must already have authenticated every vote. */
export function verifyQuorumCertificate(
  validators: readonly string[],
  certificate: QuorumCertificate,
): boolean {
  try {
    const members = committeeOf(validators);
    return (
      validPosition(certificate.height, certificate.round, certificate.blockHash) &&
      certificate.signers.length >= quorumThreshold(members.size) &&
      new Set(certificate.signers).size === certificate.signers.length &&
      certificate.signers.every((id) => members.has(id))
    );
  } catch {
    return false;
  }
}

/**
 * Local quorum/finality model over already-authenticated, equal-weight votes.
 * No signatures, networking, proposer selection, view-change locks or liveness proof.
 * Finality here is a local conflict guard, not an implementation of Tendermint.
 */
export class QuorumTracker {
  readonly #validators: readonly string[];
  readonly #members: Set<string>;
  readonly #rounds = new Map<string, Map<string, Hex>>();
  readonly #finalized = new Map<number, Hex>();
  readonly quorum: number;

  constructor(validators: readonly string[]) {
    this.#members = committeeOf(validators);
    this.#validators = Object.freeze([...validators]);
    this.quorum = quorumThreshold(validators.length);
  }

  finalizedHash(height: number): Hex | null {
    if (!Number.isSafeInteger(height) || height < 0) throw new RangeError('Invalid height');
    return this.#finalized.get(height) ?? null;
  }

  recordVote(vote: QuorumVote): VoteResult {
    if (!this.#members.has(vote.validator)) throw new Error('Unknown validator');
    if (!validPosition(vote.height, vote.round, vote.blockHash))
      throw new Error('Invalid vote position or block hash');
    const blockHash = vote.blockHash.toLowerCase() as Hex;
    const finalized = this.#finalized.get(vote.height);
    if (finalized && finalized !== blockHash)
      throw new Error('Vote conflicts with local finalized block');
    const key = JSON.stringify([vote.height, vote.round]);
    const votes = this.#rounds.get(key) ?? new Map<string, Hex>();
    const previous = votes.get(vote.validator);
    if (previous && previous !== blockHash)
      throw new Error('Equivocation: validator voted for another block in this round');
    votes.set(vote.validator, blockHash);
    this.#rounds.set(key, votes);
    const signers = [...votes]
      .filter(([, hash]) => hash === blockHash)
      .map(([id]) => id)
      .sort();
    const certificate =
      signers.length >= this.quorum
        ? Object.freeze({
            height: vote.height,
            round: vote.round,
            blockHash,
            signers: Object.freeze(signers),
          })
        : null;
    if (certificate) {
      if (!verifyQuorumCertificate(this.#validators, certificate))
        throw new Error('Invalid internal quorum');
      this.#finalized.set(vote.height, blockHash);
    }
    return Object.freeze({
      accepted: previous === undefined,
      support: signers.length,
      quorum: this.quorum,
      certificate,
    });
  }
}
