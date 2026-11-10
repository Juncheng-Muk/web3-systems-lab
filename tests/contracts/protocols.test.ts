import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  concat,
  encodeAbiParameters,
  keccak256,
  parseEther,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';
import { createLabChain, type LabChain } from '../../scripts/contract-demo-runtime.js';

let chain: LabChain;
beforeEach(async () => {
  chain = await createLabChain();
}, 30_000);
afterEach(async () => {
  await chain?.close();
});

const amount = parseEther('1');
const leaf = (index: bigint, account: Address, value: bigint) =>
  keccak256(
    keccak256(
      encodeAbiParameters(
        [{ type: 'uint256' }, { type: 'address' }, { type: 'uint256' }],
        [index, account, value],
      ),
    ),
  );
const pair = (a: Hex, b: Hex) =>
  keccak256(concat(a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a]));

async function distribution(fund = true) {
  const [owner, alice, bob] = chain.accounts as [Address, Address, Address];
  const token = await chain.deploy('LabToken', [owner]);
  const aliceLeaf = leaf(0n, alice, amount);
  const bobLeaf = leaf(256n, bob, amount * 2n);
  const distributor = await chain.deploy('MerkleDistributor', [
    token.address,
    pair(aliceLeaf, bobLeaf),
  ]);
  if (fund) await chain.write(token, 'transfer', [distributor.address, amount * 3n]);
  return { token, distributor, alice, bob, aliceLeaf, bobLeaf };
}

describe('LabToken / ERC-20 state machine', () => {
  it('mints the fixed supply once and conserves balances across transfers', async () => {
    const [owner, alice] = chain.accounts as [Address, Address];
    const token = await chain.deploy('LabToken', [owner]);
    const supply = parseEther('1000000');
    expect(await chain.read(token, 'totalSupply')).toBe(supply);
    await chain.write(token, 'transfer', [alice, amount]);
    expect(await chain.read(token, 'balanceOf', [alice])).toBe(amount);
    expect(await chain.read(token, 'balanceOf', [owner])).toBe(supply - amount);
    expect(await chain.read(token, 'totalSupply')).toBe(supply);
  });

  it('requires allowance and consumes it on delegated transfer', async () => {
    const [owner, spender, recipient] = chain.accounts as [Address, Address, Address];
    const token = await chain.deploy('LabToken', [owner]);
    await expect(
      chain.write(token, 'transferFrom', [owner, recipient, amount], { account: spender }),
    ).rejects.toThrow(/ERC20InsufficientAllowance/);
    await chain.write(token, 'approve', [spender, amount]);
    await chain.write(token, 'transferFrom', [owner, recipient, amount], { account: spender });
    expect(await chain.read(token, 'allowance', [owner, spender])).toBe(0n);
    expect(await chain.read(token, 'balanceOf', [recipient])).toBe(amount);
  });
});

describe('TrainingBadge / issuer-attested ERC-721', () => {
  const evidence = keccak256(toHex('learner-submission-v1'));

  it('binds an issuer attestation to a transferable unique token', async () => {
    const [issuer, learner, recipient] = chain.accounts as [Address, Address, Address];
    const badge = await chain.deploy('TrainingBadge', [issuer]);
    await chain.write(badge, 'mint', [learner, 1n, evidence]);
    expect((await chain.read<string>(badge, 'ownerOf', [1n])).toLowerCase()).toBe(
      learner.toLowerCase(),
    );
    expect(await chain.read(badge, 'evidenceHash', [1n])).toBe(evidence);
    await chain.write(badge, 'transferFrom', [learner, recipient, 1n], { account: learner });
    expect((await chain.read<string>(badge, 'ownerOf', [1n])).toLowerCase()).toBe(
      recipient.toLowerCase(),
    );
    expect(await chain.read(badge, 'evidenceHash', [1n])).toBe(evidence);
  });

  it('rejects unauthorized issuance and duplicate IDs without changing evidence', async () => {
    const [issuer, learner] = chain.accounts as [Address, Address];
    const badge = await chain.deploy('TrainingBadge', [issuer]);
    await expect(
      chain.write(badge, 'mint', [learner, 1n, evidence], { account: learner }),
    ).rejects.toThrow(/UnauthorizedIssuer/);
    await chain.write(badge, 'mint', [learner, 1n, evidence]);
    const otherEvidence = keccak256(toHex('forged-submission'));
    const reverted = await chain.sendUnchecked(badge, 'mint', [issuer, 1n, otherEvidence]);
    expect(reverted.status).toBe('reverted');
    expect(await chain.read(badge, 'evidenceHash', [1n])).toBe(evidence);
    expect((await chain.read<string>(badge, 'ownerOf', [1n])).toLowerCase()).toBe(
      learner.toLowerCase(),
    );
  });

  it('requires evidence and an ERC-721-compatible receiver', async () => {
    const [issuer, learner] = chain.accounts as [Address, Address];
    const badge = await chain.deploy('TrainingBadge', [issuer]);
    await expect(
      chain.write(badge, 'mint', [learner, 1n, toHex(0n, { size: 32 })]),
    ).rejects.toThrow(/EmptyEvidence/);
    const receiver = await chain.deploy('RejectEther');
    const reverted = await chain.sendUnchecked(badge, 'mint', [receiver.address, 1n, evidence]);
    expect(reverted.status).toBe('reverted');
    expect(await chain.read(badge, 'evidenceHash', [1n])).toBe(toHex(0n, { size: 32 }));
    await expect(chain.read(badge, 'ownerOf', [1n])).rejects.toThrow(/ERC721NonexistentToken/);
  });
});

describe('SafeVault / custody and adversarial callbacks', () => {
  it('records deposits and can withdraw only the caller’s own balance', async () => {
    const [owner, alice, bob] = chain.accounts as [Address, Address, Address];
    const vault = await chain.deploy('SafeVault', [owner]);
    const deposited = await chain.write(vault, 'deposit', [], { account: alice, value: amount });
    expect(deposited.logs).toHaveLength(1);
    await expect(chain.write(vault, 'withdraw', [amount, bob], { account: bob })).rejects.toThrow(
      /InsufficientBalance/,
    );
    await chain.write(vault, 'withdraw', [amount / 2n, bob], { account: alice });
    expect(await chain.read(vault, 'balanceOf', [alice])).toBe(amount / 2n);
    expect(await chain.read(vault, 'totalLiabilities')).toBe(amount / 2n);
    expect(await chain.publicClient.getBalance({ address: vault.address })).toBe(amount / 2n);
  });

  it('restricts pausing to owner while preserving withdrawal access', async () => {
    const [owner, alice] = chain.accounts as [Address, Address];
    const vault = await chain.deploy('SafeVault', [owner]);
    await chain.write(vault, 'deposit', [], { account: alice, value: amount });
    await expect(
      chain.write(vault, 'setDepositsPaused', [true], { account: alice }),
    ).rejects.toThrow(/OwnableUnauthorizedAccount/);
    await chain.write(vault, 'setDepositsPaused', [true]);
    await expect(chain.write(vault, 'deposit', [], { value: amount })).rejects.toThrow(
      /DepositsPaused/,
    );
    await chain.write(vault, 'withdraw', [amount, alice], { account: alice });
    expect(await chain.read(vault, 'totalLiabilities')).toBe(0n);
  });

  it('rejects zero deposits, zero withdrawals and the zero recipient', async () => {
    const vault = await chain.deploy('SafeVault', [chain.accounts[0]!]);
    await expect(chain.write(vault, 'deposit')).rejects.toThrow(/ZeroAmount/);
    await expect(chain.write(vault, 'withdraw', [0n, chain.accounts[0]!])).rejects.toThrow(
      /ZeroAmount/,
    );
    await expect(chain.write(vault, 'withdraw', [1n, zeroAddress])).rejects.toThrow(
      /InvalidRecipient/,
    );
  });

  it('rolls accounting back if the receiving contract rejects ETH', async () => {
    const vault = await chain.deploy('SafeVault', [chain.accounts[0]!]);
    const reject = await chain.deploy('RejectEther');
    await chain.write(vault, 'deposit', [], { value: amount });
    await expect(chain.write(vault, 'withdraw', [amount, reject.address])).rejects.toThrow(
      /TransferFailed/,
    );
    const reverted = await chain.sendUnchecked(vault, 'withdraw', [amount, reject.address]);
    expect(reverted.status).toBe('reverted');
    expect(await chain.read(vault, 'balanceOf', [chain.accounts[0]!])).toBe(amount);
    expect(await chain.read(vault, 'totalLiabilities')).toBe(amount);
    expect(await chain.publicClient.getBalance({ address: vault.address })).toBe(amount);
  });

  it('preserves liabilities when forced ETH creates a surplus', async () => {
    const owner = chain.accounts[0]!;
    const vault = await chain.deploy('SafeVault', [owner]);
    await chain.write(vault, 'deposit', [], { value: amount });
    const force = await chain.deploy('ForceEther', [vault.address], amount);
    expect(await chain.publicClient.getBalance({ address: force.address })).toBe(0n);
    expect(await chain.read(vault, 'totalLiabilities')).toBe(amount);
    expect(await chain.publicClient.getBalance({ address: vault.address })).toBe(amount * 2n);
    await chain.write(vault, 'withdraw', [amount, owner]);
    expect(await chain.read(vault, 'totalLiabilities')).toBe(0n);
    expect(await chain.publicClient.getBalance({ address: vault.address })).toBe(amount);
  });

  it('executes a malicious receiver and blocks recursive withdrawal', async () => {
    const vault = await chain.deploy('SafeVault', [chain.accounts[0]!]);
    const attacker = await chain.deploy('VaultAdversary', [vault.address]);
    await chain.write(vault, 'deposit', [], { value: amount * 10n });
    await chain.write(attacker, 'attack', [], { value: amount });
    expect(await chain.read(attacker, 'attempted')).toBe(true);
    expect(await chain.read(attacker, 'blocked')).toBe(true);
    expect(await chain.read(vault, 'balanceOf', [attacker.address])).toBe(0n);
    expect(await chain.read(vault, 'totalLiabilities')).toBe(amount * 10n);
    expect(await chain.publicClient.getBalance({ address: vault.address })).toBe(amount * 10n);
    expect(await chain.publicClient.getBalance({ address: attacker.address })).toBe(amount);
  });

  it('preserves conservation across generated deposit / withdrawal traces', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            actor: fc.integer({ min: 0, max: 1 }),
            value: fc.integer({ min: 1, max: 1000 }),
            withdraw: fc.boolean(),
          }),
          { minLength: 3, maxLength: 12 },
        ),
        async (operations) => {
          const vault = await chain.deploy('SafeVault', [chain.accounts[0]!]);
          const model = [0n, 0n];
          for (const operation of operations) {
            const account = chain.accounts[operation.actor]!;
            const value = BigInt(operation.value);
            if (!operation.withdraw) {
              await chain.write(vault, 'deposit', [], { account, value });
              model[operation.actor] = model[operation.actor]! + value;
            } else if (model[operation.actor]! >= value) {
              await chain.write(vault, 'withdraw', [value, account], { account });
              model[operation.actor] = model[operation.actor]! - value;
            } else {
              await expect(
                chain.write(vault, 'withdraw', [value, account], { account }),
              ).rejects.toThrow(/InsufficientBalance/);
            }
            const total = model[0]! + model[1]!;
            expect(await chain.read(vault, 'totalLiabilities')).toBe(total);
            expect(await chain.publicClient.getBalance({ address: vault.address })).toBe(total);
            expect(await chain.read(vault, 'balanceOf', [account])).toBe(model[operation.actor]);
          }
        },
      ),
      { seed: 20261109, numRuns: 6 },
    );
  }, 30_000);
});

describe('MerkleDistributor / authenticated allocations', () => {
  it('allows relayers without allowing them to redirect the allocation', async () => {
    const { token, distributor, alice, bobLeaf } = await distribution();
    await chain.write(distributor, 'claim', [0n, alice, amount, [bobLeaf]]);
    expect(await chain.read(token, 'balanceOf', [alice])).toBe(amount);
    expect(await chain.read(distributor, 'isClaimed', [0n])).toBe(true);
    await expect(chain.write(distributor, 'claim', [0n, alice, amount, [bobLeaf]])).rejects.toThrow(
      /AlreadyClaimed/,
    );
  });

  it('rejects tampered account, index, amount and proof', async () => {
    const { distributor, alice, bob, bobLeaf } = await distribution();
    const forged: readonly unknown[][] = [
      [0n, bob, amount, [bobLeaf]],
      [1n, alice, amount, [bobLeaf]],
      [0n, alice, amount + 1n, [bobLeaf]],
      [0n, alice, amount, [toHex(1n, { size: 32 })]],
    ];
    for (const args of forged)
      await expect(chain.write(distributor, 'claim', args)).rejects.toThrow(/InvalidProof/);
    expect(await chain.read(distributor, 'isClaimed', [0n])).toBe(false);
  });

  it('keeps claims independent across bitmap word boundaries', async () => {
    const { token, distributor, alice, bob, aliceLeaf, bobLeaf } = await distribution();
    await chain.write(distributor, 'claim', [0n, alice, amount, [bobLeaf]]);
    expect(await chain.read(distributor, 'isClaimed', [256n])).toBe(false);
    await chain.write(distributor, 'claim', [256n, bob, amount * 2n, [aliceLeaf]]);
    expect(await chain.read(distributor, 'isClaimed', [0n])).toBe(true);
    expect(await chain.read(distributor, 'isClaimed', [256n])).toBe(true);
    expect(await chain.read(token, 'balanceOf', [distributor.address])).toBe(0n);
  });

  it('does not burn a claim if token transfer fails', async () => {
    const { token, distributor, alice, bobLeaf } = await distribution(false);
    await expect(
      chain.write(distributor, 'claim', [0n, alice, amount, [bobLeaf]]),
    ).rejects.toThrow();
    const reverted = await chain.sendUnchecked(distributor, 'claim', [
      0n,
      alice,
      amount,
      [bobLeaf],
    ]);
    expect(reverted.status).toBe('reverted');
    expect(await chain.read(distributor, 'isClaimed', [0n])).toBe(false);
    await chain.write(token, 'transfer', [distributor.address, amount]);
    await chain.write(distributor, 'claim', [0n, alice, amount, [bobLeaf]]);
    expect(await chain.read(token, 'balanceOf', [alice])).toBe(amount);
  });
});

describe('TimelockTreasury / delayed authority', () => {
  const delay = 3600;
  const salt = toHex(42, { size: 32 });

  it('enforces proposer authority, delay and one-time execution', async () => {
    const [owner, recipient, executor] = chain.accounts as [Address, Address, Address];
    const treasury = await chain.deploy('TimelockTreasury', [owner, BigInt(delay)]);
    await chain.receipt(
      await chain.wallet.sendTransaction({ account: owner, to: treasury.address, value: amount }),
    );
    const operation = [recipient, amount, '0x', salt] as const;
    await expect(
      chain.write(treasury, 'schedule', operation, { account: executor }),
    ).rejects.toThrow(/OwnableUnauthorizedAccount/);
    await chain.write(treasury, 'schedule', operation);
    await expect(chain.write(treasury, 'schedule', operation)).rejects.toThrow(/AlreadyScheduled/);
    await expect(chain.write(treasury, 'execute', operation)).rejects.toThrow(/NotReady/);
    await chain.advance(delay);
    const before = await chain.publicClient.getBalance({ address: recipient });
    await chain.write(treasury, 'execute', operation, { account: executor });
    expect(await chain.publicClient.getBalance({ address: recipient })).toBe(before + amount);
    expect(await chain.publicClient.getBalance({ address: treasury.address })).toBe(0n);
    await expect(chain.write(treasury, 'execute', operation)).rejects.toThrow(/NotPending/);
  });

  it('supports cancellation and binds operation hashes to the contract', async () => {
    const [owner, recipient] = chain.accounts as [Address, Address];
    const treasury = await chain.deploy('TimelockTreasury', [owner, BigInt(delay)]);
    const other = await chain.deploy('TimelockTreasury', [owner, BigInt(delay)]);
    const operation = [recipient, 0n, '0x', salt] as const;
    const id = await chain.read<Hex>(treasury, 'operationId', operation);
    expect(await chain.read(other, 'operationId', operation)).not.toBe(id);
    await chain.write(treasury, 'schedule', operation);
    await expect(chain.write(treasury, 'cancel', [id], { account: recipient })).rejects.toThrow(
      /OwnableUnauthorizedAccount/,
    );
    await chain.write(treasury, 'cancel', [id]);
    await chain.advance(delay);
    await expect(chain.write(treasury, 'execute', operation)).rejects.toThrow(/NotPending/);
  });

  it('requires the nominated owner to accept the two-step handover', async () => {
    const [owner, successor, stranger] = chain.accounts as [Address, Address, Address];
    const treasury = await chain.deploy('TimelockTreasury', [owner, BigInt(delay)]);
    await chain.write(treasury, 'transferOwnership', [successor]);
    expect((await chain.read<string>(treasury, 'owner')).toLowerCase()).toBe(owner.toLowerCase());
    await expect(
      chain.write(treasury, 'acceptOwnership', [], { account: stranger }),
    ).rejects.toThrow(/OwnableUnauthorizedAccount/);
    await chain.write(treasury, 'acceptOwnership', [], { account: successor });
    expect((await chain.read<string>(treasury, 'owner')).toLowerCase()).toBe(
      successor.toLowerCase(),
    );
  });

  it('rolls execution status back when its target reverts', async () => {
    const treasury = await chain.deploy('TimelockTreasury', [chain.accounts[0]!, BigInt(delay)]);
    const reject = await chain.deploy('RejectEther');
    const operation = [reject.address, 0n, '0x', salt] as const;
    const id = await chain.read<Hex>(treasury, 'operationId', operation);
    await chain.write(treasury, 'schedule', operation);
    await chain.advance(delay);
    await expect(chain.write(treasury, 'execute', operation)).rejects.toThrow(/ExecutionFailed/);
    const reverted = await chain.sendUnchecked(treasury, 'execute', operation);
    expect(reverted.status).toBe('reverted');
    expect(await chain.read(treasury, 'executed', [id])).toBe(false);
  });
});
