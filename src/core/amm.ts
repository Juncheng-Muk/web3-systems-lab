const BPS = 10_000n;

function validatePool(reserveIn: bigint, reserveOut: bigint, feeBps: number): void {
  if (reserveIn <= 0n || reserveOut <= 0n) throw new RangeError('Reserves must be positive');
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps >= Number(BPS)) {
    throw new RangeError('Fee must be an integer between 0 and 9999 basis points');
  }
}

/** Exact-input quote; integer division rounds output down, as in Uniswap V2. */
export function quoteSwap(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeBps = 30,
): bigint {
  validatePool(reserveIn, reserveOut, feeBps);
  if (amountIn <= 0n) throw new RangeError('Input must be positive');
  const adjustedInput = amountIn * (BPS - BigInt(feeBps));
  return (adjustedInput * reserveOut) / (reserveIn * BPS + adjustedInput);
}

/** Smallest integer input that can buy at least the requested output. */
export function quoteExactOutput(
  amountOut: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeBps = 30,
): bigint {
  validatePool(reserveIn, reserveOut, feeBps);
  if (amountOut <= 0n || amountOut >= reserveOut)
    throw new RangeError('Output must be within pool liquidity');
  const numerator = reserveIn * amountOut * BPS;
  const denominator = (reserveOut - amountOut) * (BPS - BigInt(feeBps));
  return (numerator + denominator - 1n) / denominator;
}

export interface SwapResult {
  readonly amountOut: bigint;
  readonly reserveIn: bigint;
  readonly reserveOut: bigint;
  readonly kBefore: bigint;
  readonly kAfter: bigint;
  /** Fee expressed in whole input units, rounded down; quotes retain the rational fee. */
  readonly feePaid: bigint;
}

export function executeSwap(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeBps = 30,
  minAmountOut = 0n,
): SwapResult {
  if (minAmountOut < 0n) throw new RangeError('Minimum output cannot be negative');
  const amountOut = quoteSwap(amountIn, reserveIn, reserveOut, feeBps);
  if (amountOut === 0n) throw new RangeError('Trade rounds to zero output');
  if (amountOut < minAmountOut) throw new Error('Slippage limit exceeded');
  const nextIn = reserveIn + amountIn;
  const nextOut = reserveOut - amountOut;
  const kBefore = reserveIn * reserveOut;
  const kAfter = nextIn * nextOut;
  if ((nextIn * BPS - amountIn * BigInt(feeBps)) * nextOut < kBefore * BPS) {
    throw new Error('Fee-adjusted invariant violated');
  }
  return Object.freeze({
    amountOut,
    reserveIn: nextIn,
    reserveOut: nextOut,
    kBefore,
    kAfter,
    feePaid: (amountIn * BigInt(feeBps)) / BPS,
  });
}

export function minimumOutput(quotedAmount: bigint, slippageBps: number): bigint {
  if (
    quotedAmount < 0n ||
    !Number.isInteger(slippageBps) ||
    slippageBps < 0 ||
    slippageBps > 10_000
  ) {
    throw new RangeError('Invalid quote or slippage tolerance');
  }
  return (quotedAmount * (BPS - BigInt(slippageBps))) / BPS;
}
