import { defineConfig } from 'hardhat/config';

export default defineConfig({
  // Compilation uses the lockfile-pinned solc-js through contracts:compile.
  networks: {
    lab: {
      type: 'edr-simulated',
      chainType: 'l1',
      chainId: 31337,
      hardfork: 'cancun',
      initialDate: '2026-01-01T00:00:00Z',
      // Preserve reverted receipts so tests can verify actual on-chain rollback.
      throwOnTransactionFailures: false,
    },
  },
});
