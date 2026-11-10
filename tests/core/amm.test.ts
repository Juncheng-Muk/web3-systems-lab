import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { executeSwap, minimumOutput, quoteExactOutput, quoteSwap } from '../../src/core';

describe('constant-product AMM', () => {
  it('matches the exact-input integer reference vector', () => {
    expect(quoteSwap(1_000n, 10_000n, 10_000n)).toBe(906n);
    expect(executeSwap(1_000n, 10_000n, 10_000n)).toEqual({
      amountOut: 906n,
      reserveIn: 11_000n,
      reserveOut: 9_094n,
      kBefore: 100_000_000n,
      kAfter: 100_034_000n,
      feePaid: 3n,
    });
  });

  it('preserves both product and fee-adjusted invariants without floating point', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10n ** 30n }),
        fc.bigInt({ min: 1n, max: 10n ** 30n }),
        fc.bigInt({ min: 1n, max: 10n ** 28n }),
        fc.integer({ min: 0, max: 9999 }),
        (x, y, input, fee) => {
          const output = quoteSwap(input, x, y, fee);
          expect(output).toBeGreaterThanOrEqual(0n);
          expect(output).toBeLessThan(y);
          expect((x + input) * (y - output)).toBeGreaterThanOrEqual(x * y);
          expect(
            ((x + input) * 10_000n - input * BigInt(fee)) * (y - output),
          ).toBeGreaterThanOrEqual(x * y * 10_000n);
          if (output > 0n)
            expect(executeSwap(input, x, y, fee).kAfter).toBeGreaterThanOrEqual(x * y);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('computes minimal exact-output inputs, including exact divisibility', () => {
    expect(quoteExactOutput(5n, 5n, 10n, 0)).toBe(5n);
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10n ** 24n }),
        fc.bigInt({ min: 2n, max: 10n ** 24n }),
        fc.integer({ min: 1, max: 9999 }),
        fc.integer({ min: 0, max: 9999 }),
        (x, y, outputBps, fee) => {
          const output = 1n + ((y - 2n) * BigInt(outputBps)) / 10_000n;
          const input = quoteExactOutput(output, x, y, fee);
          expect(quoteSwap(input, x, y, fee)).toBeGreaterThanOrEqual(output);
          if (input > 1n) expect(quoteSwap(input - 1n, x, y, fee)).toBeLessThan(output);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('enforces slippage and rejects invalid inputs', () => {
    expect(minimumOutput(906n, 50)).toBe(901n);
    expect(() => executeSwap(1_000n, 10_000n, 10_000n, 30, 907n)).toThrow('Slippage');
    expect(() => executeSwap(1n, 10_000n, 1n)).toThrow('zero output');
    expect(() => quoteSwap(0n, 1n, 1n)).toThrow();
    expect(() => quoteSwap(1n, 0n, 1n)).toThrow();
    expect(() => quoteSwap(1n, 1n, 1n, 10_000)).toThrow();
    expect(() => quoteSwap(1n, 1n, 1n, 1.5)).toThrow();
    expect(() => quoteExactOutput(10n, 10n, 10n)).toThrow();
    expect(() => minimumOutput(1n, -1)).toThrow();
  });
});
