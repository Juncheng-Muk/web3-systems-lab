import { describe, expect, it } from 'vitest';
import { createRawCid, verifyRawCid } from '../../src/core';

describe('raw CIDv1 content addressing', () => {
  it('matches the independently specified raw SHA-256 hello vector', async () => {
    expect(await createRawCid('hello')).toBe(
      'bafkreibm6jg3ux5qumhcn2b3flc3tyu6dmlb4xa7u5bf44yegnrjhc4yeq',
    );
  });

  it('commits exact bytes including Unicode, zero bytes and the empty block', async () => {
    const data = new TextEncoder().encode('你好\u0000');
    const cid = await createRawCid(data);
    expect(await createRawCid('你好\u0000')).toBe(cid);
    expect(await verifyRawCid(data, cid)).toBe(true);
    expect(await verifyRawCid('你好', cid)).toBe(false);
    expect(await createRawCid('')).not.toBe(await createRawCid(new Uint8Array([0])));
  });

  it('rejects other encodings, malformed CIDs and altered content', async () => {
    const cid = await createRawCid('hello');
    for (const malformed of ['', cid.toUpperCase(), `${cid}=`, cid.slice(1), `z${cid.slice(1)}`]) {
      expect(await verifyRawCid('hello', malformed)).toBe(false);
    }
    expect(await verifyRawCid('Hello', cid)).toBe(false);
  });

  it('snapshots caller bytes before asynchronous hashing', async () => {
    const data = new TextEncoder().encode('hello');
    const pending = createRawCid(data);
    data.fill(0);
    expect(await pending).toBe(await createRawCid('hello'));
  });
});
