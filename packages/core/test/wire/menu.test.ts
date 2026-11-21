import { expect, test } from 'vitest';

import { encodeMenu, encodeMenuEntry, parseMenu, parseMenuEntry } from '../../src/index.js';
import { openPeer, partitions } from './chunks.js';

test('reads the advertised destination and preserves the opaque selector', () => {
  const line = Buffer.from('0About\tarchive:About us\tother.example\t7070\r\n');

  expect(parseMenuEntry(line)).toStrictEqual({
    type: '0',
    label: 'About',
    target: {
      selector: 'archive:About us',
      host: 'other.example',
      port: 7070,
    },
  });
});

test('reads unknown types, eight-bit labels and selectors, and ignores extension fields', async () => {
  const bytes = Buffer.from('xCafé\t/\xff%2f\telsewhere\t00070\t+metadata\r\n.\r\n', 'latin1');

  for (const chunks of partitions(bytes)) {
    expect(await parseMenu(chunks)).toStrictEqual([
      {
        type: 'x',
        label: 'Café',
        target: {
          selector: '/\xff%2f',
          host: 'elsewhere',
          port: 70,
        },
      },
    ]);
  }
});

test('finishes an empty menu as soon as the terminator arrives', async () => {
  expect(await parseMenu(openPeer('.\r\n'))).toStrictEqual([]);
});

test.each([
  '0missing fields\r\n',
  '\t\thost\t70\r\n',
  '0label\t\t\t70\r\n',
  '0label\t\thost\t-1\r\n',
  '0label\t\thost\t70x\r\n',
  '0label\t\thost\t65536\r\n',
  '0label\t\thost\t7.0\r\n',
  '0label\t\thost\t70\n',
  '0a\rb\t\thost\t70\r\n',
  '0a\nb\t\thost\t70\r\n',
  '0label\tbad\0selector\thost\t70\r\n',
  '\xfflabel\t\thost\t70\r\n',
])('rejects malformed menu entry %j', (line) => {
  expect(() => parseMenuEntry(Buffer.from(line, 'latin1'))).toThrow(SyntaxError);
});

test.each(['', '0A\t\thost\t70\r\n', '.\r'])('rejects a truncated menu %j', async (wire) => {
  await expect(parseMenu(Buffer.from(wire))).rejects.toThrow(SyntaxError);
});

test('writes entries, info shorthand and the menu terminator', () => {
  const target = {
    selector: '/\xff',
    host: 'elsewhere',
    port: 65535,
  };
  const bytes = encodeMenu([
    {
      type: 'x',
      label: 'Café',
      target,
    },
    { type: 'i', label: 'About' },
  ]);

  expect(Buffer.from(bytes)).toEqual(
    Buffer.from('xCafé\t/\xff\telsewhere\t65535\r\niAbout\t\tfake\t0\r\n.\r\n', 'latin1'),
  );
});

test.each([
  { type: 'xx' },
  { label: 'tab\there' },
  { label: '\u0100' },
  {
    target: {
      host: 'host',
      selector: '',
      port: 0.5,
    },
  },
  {
    target: {
      host: 'host',
      selector: '',
      port: -1,
    },
  },
  {
    target: {
      host: 'host\r\n',
      selector: '',
      port: 0,
    },
  },
])('rejects an unrepresentable outgoing menu field %j', (change) => {
  const entry = {
    type: '0',
    label: '',
    target: {
      host: 'host',
      selector: '',
      port: 70,
    },
    ...change,
  };

  expect(() => encodeMenu([entry])).toThrow();
});

test('encodes a single entry without the menu terminator', () => {
  const bytes = encodeMenuEntry({ type: 'i', label: 'Notice' });

  expect(Buffer.from(bytes)).toEqual(Buffer.from('iNotice\t\tfake\t0\r\n'));
});

test('writes an empty menu as just the terminator', () => {
  expect(Buffer.from(encodeMenu([]))).toEqual(Buffer.from('.\r\n'));
});

test('keeps entry order and treats a dot item type as an entry until a standalone dot arrives', async () => {
  const bytes = Buffer.from('1First\t\ta.example\t70\r\n.Next\t/x\tb.example\t7070\r\n.\r\n');

  for (const chunks of partitions(bytes)) {
    const menu = await parseMenu(chunks);
    expect(menu.map(({ type, label }) => [type, label])).toStrictEqual([
      ['1', 'First'],
      ['.', 'Next'],
    ]);
  }
});
