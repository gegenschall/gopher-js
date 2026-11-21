import { expect, test } from 'vitest';

import { createWire, encodeRequest, parseRequest } from '../../src/index.js';
import { openPeer, partitions } from './chunks.js';

test.each([
  ['\r\n', { selector: '' }],
  ['a: /%2f\xff \r\n', { selector: 'a: /%2f\xff ' }],
  ['/index\tred or blue\r\n', { selector: '/index', query: 'red or blue' }],
  ['\tquery\r\n', { selector: '', query: 'query' }],
  ['/index\t\r\n', { selector: '/index', query: '' }],
] as const)('reads and writes request %j', async (wire, request) => {
  const bytes = Buffer.from(wire, 'latin1');

  for (const chunks of partitions(bytes)) {
    expect(await parseRequest(chunks)).toStrictEqual(request);
  }

  expect(Buffer.from(encodeRequest(request))).toEqual(bytes);
});

test('responds to the first complete request without waiting for EOF', async () => {
  expect(await parseRequest(openPeer('/doc\r\n'))).toStrictEqual({ selector: '/doc' });
});

test.each(['', '/no-crlf', '/a\nb', '/a\rb\r\n', '/s\tq\textra\r\n', '/a\0\r\n'])(
  'rejects malformed request %j',
  async (wire) => {
    await expect(parseRequest(Buffer.from(wire))).rejects.toThrow(SyntaxError);
  },
);

test.each([
  { selector: '/a\r\nb' },
  { selector: '/a\tq' },
  { selector: '', query: 'a\0b' },
  { selector: '', query: 'a\nb' },
  { selector: '/\u0100' },
])('rejects unrepresentable request %j', (request) => {
  expect(() => encodeRequest(request)).toThrow();
});

test.each(['utf-8', { query: 'utf-8' }] as const)(
  'reads and writes UTF-8 queries with charset %j and opaque selectors',
  async (charset) => {
    const wire = createWire({ charset });
    const request = { selector: '/\xff', query: '雪' };
    const bytes = Buffer.from([0x2f, 0xff, 0x09, 0xe9, 0x9b, 0xaa, 0x0d, 0x0a]);

    expect(wire.encodeRequest(request)).toEqual(bytes);
    for (const chunks of partitions(bytes)) {
      expect(await wire.parseRequest(chunks)).toStrictEqual(request);
    }

    await expect(wire.parseRequest(Buffer.from('/\t\xff\r\n', 'latin1'))).rejects.toThrow();
  },
);

test('keeps queries at Latin-1 when only text uses UTF-8', async () => {
  const wire = createWire({ charset: { text: 'utf-8' } });
  const bytes = Buffer.from('/\t\xff\r\n', 'latin1');

  expect(wire.encodeRequest({ selector: '/', query: 'ÿ' })).toEqual(bytes);
  expect(await wire.parseRequest(bytes)).toStrictEqual({ selector: '/', query: 'ÿ' });
});

test('applies a custom query codec only to the query field', async () => {
  const wire = createWire({
    charset: {
      query: {
        encode: (query) => Buffer.from(query.toUpperCase()),
        decode: (bytes) => Buffer.from(bytes).toString().toLowerCase(),
      },
    },
  });

  const request = { selector: '/MiXeD', query: 'find' };
  const bytes = Buffer.from('/MiXeD\tFIND\r\n');
  expect(wire.encodeRequest(request)).toEqual(bytes);
  expect(await wire.parseRequest(bytes)).toStrictEqual(request);
});

test('rejects reserved query bytes even if the codec would hide them', async () => {
  const wire = createWire({
    charset: { query: { encode: () => Uint8Array.of(9), decode: () => 'ok' } },
  });

  expect(() => wire.encodeRequest({ selector: '', query: 'ok' })).toThrow(SyntaxError);
  await expect(wire.parseRequest(Buffer.from('\tq\0\r\n'))).rejects.toThrow(SyntaxError);
});
