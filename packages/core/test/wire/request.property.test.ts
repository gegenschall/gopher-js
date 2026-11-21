import fc from 'fast-check';
import { test } from 'vitest';

import { createWire } from '../../src/index.js';

const fieldByte = fc.integer({ min: 0, max: 255 }).filter((byte) => ![0, 9, 10, 13].includes(byte));
const selectorArbitrary = fc
  .array(fieldByte, { maxLength: 64 })
  .map((bytes) => Buffer.from(bytes).toString('latin1'));
const character = fc.oneof(
  fieldByte.map((byte) => String.fromCharCode(byte)),
  fc.integer({ min: 0x800, max: 0xd7ff }).map((point) => String.fromCodePoint(point)),
  fc.integer({ min: 0x10000, max: 0x10ffff }).map((point) => String.fromCodePoint(point)),
);
const queryArbitrary = fc.option(
  fc.array(character, { maxLength: 64 }).map((parts) => parts.join('')),
  { nil: undefined },
);

test('decodes opaque selectors and UTF-8 queries across arbitrary chunk boundaries', async ({
  expect,
}) => {
  const wire = createWire({ charset: 'utf-8' });

  await fc.assert(
    fc.asyncProperty(
      selectorArbitrary,
      queryArbitrary,
      fc.array(fc.nat({ max: 8 })),
      async (selector, query, widths) => {
        const expected = query === undefined ? { selector } : { selector, query };
        const bytes = Buffer.concat([
          Buffer.from(selector, 'latin1'),
          Buffer.from(query === undefined ? '\r\n' : '\t' + query + '\r\n'),
        ]);

        const chunks = [];
        let offset = 0;
        for (const width of widths) {
          chunks.push(bytes.subarray(offset, offset + width));
          offset += width;
          if (offset >= bytes.length) break;
        }
        chunks.push(bytes.subarray(offset));

        expect(await wire.parseRequest(chunks)).toStrictEqual(expected);
        expect(Buffer.from(wire.encodeRequest(expected))).toEqual(bytes);
      },
    ),
  );
});
