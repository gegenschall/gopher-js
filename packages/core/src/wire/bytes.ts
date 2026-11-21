import type { WireSource } from './wire.types.js';

export const chunksOf = (source: WireSource) => (source instanceof Uint8Array ? [source] : source);

/** Each code unit represents one octet in an opaque protocol field. */
export const decodeByteString = (bytes: Uint8Array) =>
  Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1');

export const encodeByteString = (text: string): Uint8Array => {
  if (/[\u0100-\u{10ffff}]/u.test(text)) {
    throw new RangeError('A byte string can only contain code units from 0 to 255.');
  }

  return Buffer.from(text, 'latin1');
};

export const validateField = (value: string): void => {
  if (/[\t\r\n\0]/u.test(value)) {
    throw new SyntaxError('Gopher fields cannot contain TAB, CR, LF or NUL.');
  }
};

export const validateFieldBytes = (bytes: Uint8Array): void => {
  if (bytes.some((byte) => byte === 0 || byte === 9 || byte === 13 || byte === 10)) {
    throw new SyntaxError('Gopher fields cannot contain TAB, CR, LF or NUL bytes.');
  }
};
