export interface TransferLog {
  readonly transactionHash: string;
  readonly logIndex: number;
  readonly from: string;
  readonly to: string;
  readonly amount: bigint;
}

export interface IndexedBlock {
  readonly hash: string;
  readonly parentHash: string | null;
  readonly number: number;
  readonly logs: readonly TransferLog[];
}

export interface IndexerSnapshot {
  readonly head: string | null;
  readonly height: number;
  readonly balances: Record<string, bigint>;
  readonly logCount: number;
  readonly chain: readonly string[];
  readonly finalizedHeight: number;
}

interface StoredBlock {
  block: IndexedBlock;
  fingerprint: string;
  balances: Map<string, bigint>;
  events: Set<string>;
  chain: string[];
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
function normalize(value: string): string {
  if (!value.trim()) throw new Error('Empty account or hash');
  return value.toLowerCase();
}

function eventId(log: TransferLog): string {
  return JSON.stringify([normalize(log.transactionHash), log.logIndex]);
}

function eventFingerprint(log: TransferLog): string {
  return JSON.stringify([
    eventId(log),
    normalize(log.from),
    normalize(log.to),
    log.amount.toString(),
  ]);
}

/** Caller selects canonical blocks; this indexer handles atomic rollback, not consensus. */
export class ReorgIndexer {
  readonly #initial: Map<string, bigint>;
  readonly #blocks = new Map<string, StoredBlock>();
  #current: StoredBlock | undefined;
  #finalizedHeight = -1;
  #finalizedHash: string | undefined;

  constructor(initialBalances: Readonly<Record<string, bigint>> = {}) {
    this.#initial = new Map();
    for (const [rawAddress, amount] of Object.entries(initialBalances)) {
      const address = normalize(rawAddress);
      if (amount < 0n) throw new RangeError('Initial balances cannot be negative');
      if (address === ZERO_ADDRESS) throw new Error('Zero address cannot hold a balance');
      if (this.#initial.has(address)) throw new Error('Duplicate initial account');
      this.#initial.set(address, amount);
    }
  }

  get head(): string | null {
    return this.#current?.block.hash ?? null;
  }
  balanceOf(address: string): bigint {
    return (this.#current?.balances ?? this.#initial).get(normalize(address)) ?? 0n;
  }

  snapshot(): IndexerSnapshot {
    return {
      head: this.head,
      height: this.#current?.block.number ?? -1,
      balances: Object.fromEntries(this.#current?.balances ?? this.#initial),
      logCount: this.#current?.events.size ?? 0,
      chain: [...(this.#current?.chain ?? [])],
      finalizedHeight: this.#finalizedHeight,
    };
  }

  finalize(height: number): void {
    if (
      !Number.isInteger(height) ||
      height < this.#finalizedHeight ||
      height < 0 ||
      height > (this.#current?.block.number ?? -1)
    ) {
      throw new RangeError('Finality must move forward within the canonical chain');
    }
    this.#finalizedHeight = height;
    this.#finalizedHash = this.#current!.chain[height]!;
  }

  applyBlock(input: IndexedBlock): {
    applied: boolean;
    reverted: string[];
    head: string;
    height: number;
  } {
    const hash = normalize(input.hash);
    const parentHash = input.parentHash === null ? null : normalize(input.parentHash);
    if (!Number.isSafeInteger(input.number) || input.number < 0)
      throw new RangeError('Invalid block height');
    const uniqueLogs = new Map<string, TransferLog>();
    for (const entry of input.logs) {
      if (!Number.isSafeInteger(entry.logIndex) || entry.logIndex < 0 || entry.amount < 0n)
        throw new Error('Invalid event');
      const log: TransferLog = Object.freeze({
        ...entry,
        transactionHash: normalize(entry.transactionHash),
        from: normalize(entry.from),
        to: normalize(entry.to),
      });
      const id = eventId(log);
      const previous = uniqueLogs.get(id);
      if (previous && eventFingerprint(previous) !== eventFingerprint(log))
        throw new Error('Conflicting duplicate event');
      uniqueLogs.set(id, log);
    }
    const logs = [...uniqueLogs.values()].sort((a, b) => a.logIndex - b.logIndex);
    if (new Set(logs.map((log) => log.logIndex)).size !== logs.length)
      throw new Error('Log indexes must be unique within a block');
    const block = Object.freeze({
      hash,
      parentHash,
      number: input.number,
      logs: Object.freeze(logs),
    });
    const fingerprint = JSON.stringify([
      hash,
      parentHash,
      input.number,
      logs.map(eventFingerprint),
    ]);
    const existing = this.#blocks.get(hash);
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new Error('Conflicting block with the same hash');
      return {
        applied: false,
        reverted: [],
        head: this.head!,
        height: this.#current!.block.number,
      };
    }
    const parent = parentHash === null ? undefined : this.#blocks.get(parentHash);
    if (parentHash !== null && !parent)
      throw new Error('Unknown parent: backfill the missing branch');
    if (block.number !== (parent?.block.number ?? -1) + 1)
      throw new Error('Non-contiguous block height');
    if (parentHash === null && this.#blocks.size > 0) throw new Error('Genesis is immutable');
    const chain = [...(parent?.chain ?? []), hash];
    if (this.#finalizedHash && chain[this.#finalizedHeight] !== this.#finalizedHash)
      throw new Error('Reorg crosses finalized block');
    // Build candidate state privately. Any bad event leaves the canonical head untouched.
    const balances = new Map(parent?.balances ?? this.#initial);
    const events = new Set(parent?.events ?? []);
    for (const log of logs) {
      const id = eventId(log);
      if (events.has(id)) throw new Error('Event already exists in canonical ancestry');
      if (log.from === ZERO_ADDRESS && log.to === ZERO_ADDRESS)
        throw new Error('Invalid zero-address transfer');
      if (log.from !== ZERO_ADDRESS) {
        const balance = balances.get(log.from) ?? 0n;
        if (balance < log.amount) throw new Error('Event would create a negative balance');
        balances.set(log.from, balance - log.amount);
      }
      if (log.to !== ZERO_ADDRESS) balances.set(log.to, (balances.get(log.to) ?? 0n) + log.amount);
      events.add(id);
    }
    const previousChain = this.#current?.chain ?? [];
    let commonLength = 0;
    while (
      previousChain[commonLength] !== undefined &&
      previousChain[commonLength] === chain[commonLength]
    )
      commonLength++;
    const reverted = previousChain.slice(commonLength).reverse();
    const stored = { block, fingerprint, balances, events, chain };
    this.#blocks.set(hash, stored);
    this.#current = stored;
    return { applied: true, reverted, head: hash, height: block.number };
  }
}
