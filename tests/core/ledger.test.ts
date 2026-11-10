import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import {
  createTransferTypedData,
  DEFAULT_LEDGER_DOMAIN,
  SignedLedger,
  type LedgerTransfer,
} from '../../src/core';

// Public deterministic test-only keys. Never fund these accounts.
const alice = privateKeyToAccount(`0x${'01'.repeat(32)}`);
const bob = privateKeyToAccount(`0x${'02'.repeat(32)}`);
const transfer: LedgerTransfer = {
  from: alice.address,
  to: bob.address,
  amount: 40n,
  nonce: 0n,
  deadline: 1_000n,
};

describe('EIP-712 signed ledger', () => {
  it('authenticates a transfer, conserves balances, and prevents replay', async () => {
    const ledger = new SignedLedger({ [alice.address]: 100n });
    const beforeRoot = ledger.snapshot().stateRoot;
    const signature = await alice.signTypedData(createTransferTypedData(transfer));
    const receipt = await ledger.submit(transfer, signature, 500n);
    expect(receipt.stateRoot).not.toBe(beforeRoot);
    expect(ledger.balanceOf(alice.address)).toBe(60n);
    expect(ledger.balanceOf(bob.address)).toBe(40n);
    expect(ledger.nonceOf(alice.address)).toBe(1n);
    await expect(ledger.submit(transfer, signature, 500n)).rejects.toThrow('nonce');
  });

  it('allows exactly one concurrent submission of a nonce', async () => {
    const ledger = new SignedLedger({ [alice.address]: 100n });
    const signature = await alice.signTypedData(createTransferTypedData(transfer));
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => ledger.submit(transfer, signature, 500n)),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(ledger.balanceOf(bob.address)).toBe(40n);
  });

  it('rejects sender forgery, payload mutation, and cross-domain replay', async () => {
    const ledger = new SignedLedger({ [alice.address]: 100n });
    const signature = await alice.signTypedData(createTransferTypedData(transfer));
    const forged = await bob.signTypedData(createTransferTypedData(transfer));
    await expect(ledger.submit(transfer, forged, 500n)).rejects.toThrow('signature');
    await expect(ledger.submit({ ...transfer, amount: 99n }, signature, 500n)).rejects.toThrow(
      'signature',
    );
    const otherChain = new SignedLedger(
      { [alice.address]: 100n },
      { ...DEFAULT_LEDGER_DOMAIN, chainId: 1 },
    );
    await expect(otherChain.submit(transfer, signature, 500n)).rejects.toThrow('signature');
    const otherContract = new SignedLedger(
      { [alice.address]: 100n },
      { ...DEFAULT_LEDGER_DOMAIN, verifyingContract: bob.address },
    );
    await expect(otherContract.submit(transfer, signature, 500n)).rejects.toThrow('signature');
    expect(ledger.balanceOf(alice.address)).toBe(100n);
    expect(ledger.nonceOf(alice.address)).toBe(0n);
  });

  it('rejects expiry, overspending, and out-of-order nonces without writes', async () => {
    const ledger = new SignedLedger({ [alice.address]: 100n });
    for (const [message, now, error] of [
      [transfer, 1001n, 'expired'],
      [{ ...transfer, amount: 101n }, 500n, 'Insufficient'],
      [{ ...transfer, nonce: 1n }, 500n, 'nonce'],
    ] as const) {
      const signature = await alice.signTypedData(createTransferTypedData(message));
      await expect(ledger.submit(message, signature, now)).rejects.toThrow(error);
    }
    expect(ledger.balanceOf(alice.address)).toBe(100n);
    expect(ledger.nonceOf(alice.address)).toBe(0n);
  });

  it('consumes nonce for a self-transfer without changing supply', async () => {
    const ledger = new SignedLedger({ [alice.address]: 100n });
    const message = { ...transfer, to: alice.address };
    const signature = await alice.signTypedData(createTransferTypedData(message));
    await ledger.submit(message, signature, 1000n);
    expect(ledger.balanceOf(alice.address)).toBe(100n);
    expect(ledger.nonceOf(alice.address)).toBe(1n);
  });

  it('captures mutable input before asynchronous verification', async () => {
    const ledger = new SignedLedger({ [alice.address]: 100n });
    const mutable = { ...transfer };
    const signature = await alice.signTypedData(createTransferTypedData(mutable));
    const pending = ledger.submit(mutable, signature, 500n);
    mutable.amount = 99n;
    await pending;
    expect(ledger.balanceOf(bob.address)).toBe(40n);
  });
});
