import { Readable } from 'node:stream';

import { decodeByteString, encodeByteString, validateField, validateFieldBytes } from './bytes.js';
import { crlf, stripCrlf, wireLines } from './lines.js';
import type { WireCharset } from './options.types.js';
import type { GopherRequest, WireSource } from './wire.types.js';

export const readRequest = async (
  source: WireSource,
  queryCharset: WireCharset,
): Promise<GopherRequest> => {
  // A server still owns the writable half after it has read the selector.
  const input = source instanceof Readable ? source.iterator({ destroyOnReturn: false }) : source;

  for await (const line of wireLines(input)) {
    const content = stripCrlf(line);
    const tab = content.indexOf(9);
    const selector = decodeByteString(tab < 0 ? content : content.subarray(0, tab));
    validateField(selector);

    if (tab < 0) {
      return { selector };
    }

    const bytes = content.subarray(tab + 1);
    validateFieldBytes(bytes);

    const query = queryCharset.decode(bytes);
    validateField(query);

    return { selector, query };
  }

  throw new SyntaxError('Gopher request ended before its selector line.');
};

const tabByte = Buffer.from('\t');

export const writeRequest = (
  { selector, query }: GopherRequest,
  queryCharset: WireCharset,
): Uint8Array => {
  validateField(selector);

  if (query === undefined) {
    return encodeByteString(selector + '\r\n');
  }

  validateField(query);
  const bytes = queryCharset.encode(query);
  validateFieldBytes(bytes);

  return Buffer.concat([encodeByteString(selector), tabByte, bytes, crlf]);
};
