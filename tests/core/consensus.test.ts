import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { toHex } from 'viem';
import { QuorumTracker, quorumThreshold, verifyQuorumCertificate } from '../../src/core';

const validators = ['alice', 'bob', 'carol', 'dave'];
const blockA = toHex(1n, { size: 32 });
const blockB = toHex(2n, { size: 32 });
const position = { height: 10, round: 0, blockHash: blockA };

describe('authenticated-vote quorum model', () => {
  it('requires strictly more than two thirds and gives intersecting quorums', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(quorumThreshold)).toEqual([1, 2, 3, 3, 4, 5, 5]);
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000 }), (n) => {
        const q = quorumThreshold(n);
        expect(3 * q).toBeGreaterThan(2 * n);
        expect(3 * (q - 1)).toBeLessThanOrEqual(2 * n);
        expect(2 * q - n).toBeGreaterThan(Math.floor((n - 1) / 3));
      }),
      { numRuns: 100 },
    );
    expect(() => quorumThreshold(0)).toThrow();
    expect(() => new QuorumTracker(['alice', 'alice'])).toThrow('Duplicate');
  });

  it('does not count repeated votes and finalizes only at quorum', () => {
    const tracker = new QuorumTracker(validators);
    expect(tracker.recordVote({ ...position, validator: 'alice' })).toMatchObject({
      accepted: true,
      support: 1,
      certificate: null,
    });
    expect(tracker.recordVote({ ...position, validator: 'alice' })).toMatchObject({
      accepted: false,
      support: 1,
    });
    tracker.recordVote({ ...position, validator: 'bob' });
    expect(tracker.finalizedHash(10)).toBe(null);
    const result = tracker.recordVote({ ...position, validator: 'carol' });
    expect(result.certificate?.signers).toEqual(['alice', 'bob', 'carol']);
    expect(verifyQuorumCertificate(validators, result.certificate!)).toBe(true);
    expect(tracker.finalizedHash(10)).toBe(blockA);
    expect(() =>
      tracker.recordVote({ ...position, validator: 'dave', round: 1, blockHash: blockB }),
    ).toThrow('finalized');
  });

  it('rejects equivocation and outsider votes without altering support', () => {
    const tracker = new QuorumTracker(validators);
    tracker.recordVote({ ...position, validator: 'alice' });
    expect(() =>
      tracker.recordVote({ ...position, validator: 'alice', blockHash: blockB }),
    ).toThrow('Equivocation');
    expect(() => tracker.recordVote({ ...position, validator: 'mallory' })).toThrow('Unknown');
    expect(tracker.recordVote({ ...position, validator: 'bob' }).support).toBe(2);
  });

  it('separates heights, rounds and block hashes', () => {
    const tracker = new QuorumTracker(validators);
    tracker.recordVote({ ...position, validator: 'alice' });
    expect(tracker.recordVote({ ...position, validator: 'bob', round: 1 }).support).toBe(1);
    expect(tracker.recordVote({ ...position, validator: 'carol', height: 11 }).support).toBe(1);
    expect(tracker.recordVote({ ...position, validator: 'dave', blockHash: blockB }).support).toBe(
      1,
    );
    expect(tracker.finalizedHash(10)).toBeNull();
  });

  it('rejects duplicate signers, unknown signers and malformed certificates', () => {
    for (const signers of [
      ['alice', 'alice', 'bob'],
      ['alice', 'bob', 'mallory'],
      ['alice', 'bob'],
    ]) {
      expect(verifyQuorumCertificate(validators, { ...position, signers })).toBe(false);
    }
    expect(
      verifyQuorumCertificate(validators, { ...position, height: -1, signers: validators }),
    ).toBe(false);
    expect(
      verifyQuorumCertificate(validators, { ...position, round: 1.5, signers: validators }),
    ).toBe(false);
    expect(
      verifyQuorumCertificate(validators, { ...position, blockHash: '0x01', signers: validators }),
    ).toBe(false);
  });
});
