import { expect, test } from 'vitest';

import { collectBinary, createWire, type WireCharset } from '../../src/index.js';
import { openPeer, partitions } from './chunks.js';

const labelBytes = Buffer.from('雪');
const entry = Buffer.concat([
  Buffer.from('0'),
  labelBytes,
  Buffer.from('\t/\xff\thost\t70\r\n', 'latin1'),
]);
const transcript = Buffer.concat([entry, Buffer.from('.\r\n')]);

test('a UTF-8 preset decodes fragmented labels and text while preserving selector bytes', async () => {
  const wire = createWire({ charset: 'utf-8' });

  for (const chunks of partitions(transcript)) {
    const menu = await wire.parseMenu(chunks);
    expect(menu[0]?.label).toBe('雪');
    expect(menu[0]?.target.selector).toBe('/\xff');
    expect(wire.encodeMenu(menu)).toEqual(transcript);
  }

  expect(wire.encodeRequest({ selector: '/\xff' })).toEqual(Buffer.from('/\xff\r\n', 'latin1'));

  const text = Buffer.from('..雪\r\n.\r\n');
  for (const chunks of partitions(text)) {
    expect(await wire.parseText(chunks)).toBe('.雪\n');
  }
  expect(Buffer.from(wire.encodeText('.雪'))).toEqual(text);
});

test('a labels-only override leaves text at Latin-1 and rejects invalid UTF-8 labels', async () => {
  const wire = createWire({ charset: { labels: 'utf-8' } });
  expect((await wire.parseMenu(transcript))[0]?.label).toBe('雪');
  expect(await wire.parseText(Buffer.from([0xff]))).toBe('ÿ');
  await expect(
    wire.parseMenu(Buffer.from('0\xff\t/\thost\t70\r\n.\r\n', 'latin1')),
  ).rejects.toThrow();
});

test('accepts a complete menu at EOF but still requires CRLF on the last entry', async () => {
  const wire = createWire({ menuFraming: { read: 'dot-or-eof' } });

  expect(await wire.parseMenu(entry)).toHaveLength(1);
  expect(await wire.parseMenu(openPeer('.\r\n'))).toEqual([]);
  await expect(wire.parseMenu(entry.subarray(0, -1))).rejects.toThrow(SyntaxError);
  expect(wire.encodeMenu([])).toEqual(Buffer.from('.\r\n'));
});

test('EOF menu writing and strict text reading can be selected independently', async () => {
  const wire = createWire({
    menuFraming: { write: 'eof' },
    textFraming: { read: 'dot' },
  });

  expect(wire.encodeMenu([{ type: 'i', label: 'ok' }])).toEqual(Buffer.from('iok\t\tfake\t0\r\n'));
  await expect(wire.parseMenu(entry)).rejects.toThrow(SyntaxError);
  await expect(wire.parseText(Buffer.from('partial\r\n'))).rejects.toThrow(SyntaxError);
  expect(await wire.parseText(openPeer('..\r\n.\r\n'))).toBe('.\n');
});

test('literal EOF text keeps dot lines and line endings in both directions', async () => {
  const wire = createWire({ textFraming: { read: 'eof', write: 'eof' } });
  const body = '.\r\n..line\nend';
  expect(await wire.parseText(Buffer.from(body))).toBe(body);
  expect(wire.encodeText(body)).toEqual(Buffer.from(body));
});

const reversed: WireCharset = {
  encode: (value) => Buffer.from([...value].toReversed().join('')),
  decode: (bytes) => [...Buffer.from(bytes).toString()].toReversed().join(''),
};

test('a shared custom charset handles both fields and dot stuffing follows the encoded bytes', async () => {
  const wire = createWire({ charset: reversed });
  const bytes = Buffer.from('..cba\r\n.\r\n');
  expect(wire.encodeText('abc.')).toEqual(bytes);
  expect(await wire.parseText(bytes)).toBe('abc.\n');
  expect(wire.encodeMenu([{ type: 'i', label: 'abc' }])).toEqual(
    Buffer.from('icba\t\tfake\t0\r\n.\r\n'),
  );
});

test('rejects reserved delimiter bytes produced by a custom label codec', () => {
  const wire = createWire({
    charset: { labels: { ...reversed, encode: () => Buffer.from('a\tb') } },
  });
  expect(() => wire.encodeMenu([{ type: 'i', label: 'ok' }])).toThrow(SyntaxError);
});

test('custom framing receives the configured text codec and complete serialized menu entries', async () => {
  const wire = createWire({
    charset: { text: reversed },
    textFraming: {
      read: async (source, charset) => charset.decode(await collectBinary(source)),
      write: (text, charset) => charset.encode(text),
    },
    menuFraming: {
      async *read(source) {
        const bytes = await collectBinary(source);
        yield bytes.subarray(1);
      },
      write: (entries) => Buffer.concat([Buffer.from('!'), ...entries]),
    },
  });

  expect(wire.encodeText('abc')).toEqual(Buffer.from('cba'));
  expect(await wire.parseText(Buffer.from('cba'))).toBe('abc');
  const bytes = Buffer.from('!ihello\t\tfake\t0\r\n');
  expect(wire.encodeMenu([{ type: 'i', label: 'hello' }])).toEqual(bytes);
  expect((await wire.parseMenu(bytes))[0]?.label).toBe('hello');
});

test('single-entry operations use the configured label charset and preserve selector octets', () => {
  const wire = createWire({ charset: { labels: 'utf-8' } });
  const parsed = wire.parseMenuEntry(entry);

  expect(parsed.label).toBe('雪');
  expect(parsed.target.selector).toBe('/\xff');
  expect(wire.encodeMenuEntry(parsed)).toEqual(entry);
});

test('single-entry operations pass only label bytes to a custom codec', () => {
  const wire = createWire({ charset: { labels: reversed } });
  const bytes = Buffer.from('0cba\t/abc\thost\t70\r\n');
  const parsed = wire.parseMenuEntry(bytes);

  expect(parsed.label).toBe('abc');
  expect(parsed.target.selector).toBe('/abc');
  expect(wire.encodeMenuEntry(parsed)).toEqual(bytes);
});
