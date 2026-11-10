import { getAddress, hashTypedData, verifyTypedData, type Address, type Hex } from 'viem';
import { buildMerkleTree } from './merkle';

const UINT256_MAX = (1n << 256n) - 1n;

export interface LedgerDomain {
  readonly chainId: number;
  readonly verifyingContract: Address;
}

export interface LedgerTransfer {
  readonly from: Address;
  readonly to: Address;
  readonly amount: bigint;
  readonly nonce: bigint;
  readonly deadline: bigint;
}

export const DEFAULT_LEDGER_DOMAIN: LedgerDomain = Object.freeze({
  chainId: 31337,
  verifyingContract: '0x0000000000000000000000000000000000000001',
});

export const TRANSFER_TYPES = {
  Transfer: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

function uint256(value: bigint, label: string): void {
  if (value < 0n || value > UINT256_MAX) throw new RangeError(`${label} is outside uint256`);
}

export function createTransferTypedData(transfer: LedgerTransfer, config = DEFAULT_LEDGER_DOMAIN) {
  if (!Number.isSafeInteger(config.chainId) || config.chainId <= 0)
    throw new RangeError('Invalid chain ID');
  uint256(transfer.amount, 'Amount');
  uint256(transfer.nonce, 'Nonce');
  uint256(transfer.deadline, 'Deadline');
  return {
    domain: {
      name: 'Web3 Systems Lab Ledger',
      version: '1',
      chainId: config.chainId,
      verifyingContract: getAddress(config.verifyingContract),
    },
    primaryType: 'Transfer' as const,
    types: TRANSFER_TYPES,
    message: {
      from: getAddress(transfer.from),
      to: getAddress(transfer.to),
      amount: transfer.amount,
      nonce: transfer.nonce,
      deadline: transfer.deadline,
    },
  };
}

export interface LedgerReceipt {
  readonly id: Hex;
  readonly from: Address;
  readonly to: Address;
  readonly amount: bigint;
  readonly nonce: bigint;
  readonly stateRoot: Hex;
}

/** In-memory EOA state machine. Domain + sender nonce protect signed transfers. */
export class SignedLedger {
  readonly domain: LedgerDomain;
  readonly #balances = new Map<Address, bigint>();
  readonly #nonces = new Map<Address, bigint>();

  constructor(
    initialBalances: Readonly<Record<string, bigint>> = {},
    domain = DEFAULT_LEDGER_DOMAIN,
  ) {
    if (!Number.isSafeInteger(domain.chainId) || domain.chainId <= 0)
      throw new RangeError('Invalid chain ID');
    this.domain = Object.freeze({
      chainId: domain.chainId,
      verifyingContract: getAddress(domain.verifyingContract),
    });
    for (const [rawAddress, balance] of Object.entries(initialBalances)) {
      const address = getAddress(rawAddress);
      uint256(balance, 'Initial balance');
      if (this.#balances.has(address)) throw new Error('Duplicate initial account');
      this.#balances.set(address, balance);
    }
  }

  balanceOf(address: string): bigint {
    return this.#balances.get(getAddress(address)) ?? 0n;
  }
  nonceOf(address: string): bigint {
    return this.#nonces.get(getAddress(address)) ?? 0n;
  }

  snapshot(): { balances: Record<string, bigint>; nonces: Record<string, bigint>; stateRoot: Hex } {
    const addresses = [...new Set([...this.#balances.keys(), ...this.#nonces.keys()])].sort();
    const stateRoot = buildMerkleTree(
      addresses.map((address) =>
        JSON.stringify([
          address.toLowerCase(),
          this.balanceOf(address).toString(),
          this.nonceOf(address).toString(),
        ]),
      ),
    ).root;
    return {
      balances: Object.fromEntries(this.#balances),
      nonces: Object.fromEntries(this.#nonces),
      stateRoot,
    };
  }

  async submit(transfer: LedgerTransfer, signature: Hex, now?: bigint): Promise<LedgerReceipt> {
    // Snapshot caller data before awaiting cryptographic verification.
    const typedData = createTransferTypedData(transfer, this.domain);
    const message = typedData.message;
    if (!(await verifyTypedData({ ...typedData, address: message.from, signature }))) {
      throw new Error('Invalid transfer signature');
    }
    // No await between state validation and writes: concurrent replay has one winner.
    const timestamp = now ?? BigInt(Math.floor(Date.now() / 1000));
    if (timestamp < 0n || timestamp > message.deadline) throw new Error('Transfer expired');
    if (message.amount === 0n) throw new RangeError('Amount must be positive');
    if (message.nonce !== this.nonceOf(message.from))
      throw new Error('Invalid nonce: replay or out-of-order transfer');
    if (message.nonce === UINT256_MAX) throw new RangeError('Nonce exhausted');
    const senderBalance = this.balanceOf(message.from);
    if (message.amount > senderBalance) throw new Error('Insufficient balance');
    if (message.from !== message.to) {
      const recipientBalance = this.balanceOf(message.to) + message.amount;
      uint256(recipientBalance, 'Recipient balance');
      this.#balances.set(message.from, senderBalance - message.amount);
      this.#balances.set(message.to, recipientBalance);
    }
    this.#nonces.set(message.from, message.nonce + 1n);
    return Object.freeze({
      id: hashTypedData(typedData),
      from: message.from,
      to: message.to,
      amount: message.amount,
      nonce: message.nonce,
      stateRoot: this.snapshot().stateRoot,
    });
  }
}
