import { decodeMakeCursor, encodeMakeCursor } from './make-cursor.js';

const ASTON_MARTIN_ID = 440;

const rawCursor = (value: string) => Buffer.from(value).toString('base64url');

describe('make cursor', () => {
  it('decodes what it encodes', () => {
    const cursor = encodeMakeCursor(ASTON_MARTIN_ID);

    expect(decodeMakeCursor(cursor)).toBe(ASTON_MARTIN_ID);
  });

  it('produces an opaque string', () => {
    const cursor = encodeMakeCursor(ASTON_MARTIN_ID);

    expect(cursor).not.toContain(String(ASTON_MARTIN_ID));
  });

  it.each([
    ['garbage', 'not-a-cursor'],
    ['an empty string', ''],
    ['another prefix', rawCursor(`user:${ASTON_MARTIN_ID}`)],
    ['a non-numeric id', rawCursor('make:abc')],
    ['a negative id', rawCursor(`make:-${ASTON_MARTIN_ID}`)],
  ])('rejects %s', (_case, cursor) => {
    expect(decodeMakeCursor(cursor)).toBeNull();
  });
});
