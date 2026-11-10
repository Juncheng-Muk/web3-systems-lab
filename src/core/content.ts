const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

function encodeBase32(bytes: Uint8Array): string {
  let pending = 0;
  let bitCount = 0;
  let output = '';
  for (const byte of bytes) {
    pending = (pending << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      bitCount -= 5;
      output += BASE32[(pending >>> bitCount) & 31];
    }
    pending &= (1 << bitCount) - 1;
  }
  if (bitCount > 0) output += BASE32[(pending << (5 - bitCount)) & 31];
  return output;
}

/** CIDv1 + raw codec + sha2-256 + lowercase base32. No upload or UnixFS chunking. */
export async function createRawCid(data: string | Uint8Array): Promise<string> {
  // Copy before awaiting: callers cannot change the committed bytes in flight.
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : Uint8Array.from(data);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  const cid = new Uint8Array(4 + digest.length);
  cid.set([0x01, 0x55, 0x12, 0x20]);
  cid.set(digest, 4);
  return `b${encodeBase32(cid)}`;
}

/** Accept only the canonical encoding produced by createRawCid, not arbitrary CID codecs. */
export async function verifyRawCid(data: string | Uint8Array, cid: string): Promise<boolean> {
  if (!/^b[a-z2-7]{58}$/.test(cid)) return false;
  return (await createRawCid(data)) === cid;
}
