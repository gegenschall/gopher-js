import { expect, test } from 'vitest';

import { collectBinary, encodeText, parseText } from '../../src/index.js';
import { openPeer, partitions } from './chunks.js';

test.each([
  ['.\r\n', ''],
  ['\r\n.\r\n', '\n'],
  ['..\r\n...\r\n..hidden\r\n.\r\n', '.\n..\n.hidden\n'],
  ['first\r\n\r\nlast\r\n.\r\n', 'first\n\nlast\n'],
  ['Café\r\n', 'Café\n'],
  ['last line', 'last line'],
  ['', ''],
])('reads text transcript %j', async (wire, expected) => {
  for (const chunks of partitions(Buffer.from(wire, 'latin1'))) {
    expect(await parseText(chunks)).toBe(expected);
  }
});

test.each([
  ['', '.\r\n'],
  ['\n', '\r\n.\r\n'],
  ['.\n..\n.hidden', '..\r\n...\r\n..hidden\r\n.\r\n'],
  ['Café\r\n\r\n', 'Café\r\n\r\n.\r\n'],
])('writes text body %j', (body, wire) => {
  expect(Buffer.from(encodeText(body))).toEqual(Buffer.from(wire, 'latin1'));
});

test('reads binary through EOF, including NUL, eight-bit bytes and embedded dot lines', async () => {
  const bytes = Uint8Array.of(0, 255, 13, 10, 46, 13, 10, 128);

  for (const chunks of partitions(bytes)) {
    expect([...(await collectBinary(chunks))]).toEqual([...bytes]);
  }
});

test('finishes text at the dot line while the peer is still connected', async () => {
  expect(await parseText(openPeer('hello\r\n.\r\n'))).toBe('hello\n');
});

test.each(['a\rb', '\u0100'])('rejects unrepresentable outgoing text %j', (body) => {
  expect(() => encodeText(body)).toThrow();
});

test('propagates a failed binary transfer even after receiving data', async () => {
  await expect(collectBinary(openPeer('partial'))).rejects.toThrow(
    'Read past the end of the message.',
  );
});
