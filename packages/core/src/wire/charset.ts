import { decodeByteString, encodeByteString } from './bytes.js';
import type { Charset, WireCharset, WireOptions } from './options.types.js';

const latin1: WireCharset = { encode: encodeByteString, decode: decodeByteString };

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

const utf8: WireCharset = {
  encode: (text) => {
    if (!text.isWellFormed()) {
      throw new RangeError('UTF-8 requires well-formed Unicode text.');
    }

    return Buffer.from(text, 'utf8');
  },
  decode: (bytes) => decoder.decode(bytes),
};

const resolveCharset = (charset: Charset = latin1): WireCharset => {
  switch (charset) {
    case 'latin-1':
      return latin1;
    case 'utf-8':
      return utf8;
    default:
      if (typeof charset.encode !== 'function' || typeof charset.decode !== 'function') {
        throw new TypeError('Expected a charset preset or a codec with encode and decode.');
      }

      return charset;
  }
};

export const resolveCharsets = (charset: WireOptions['charset'] = {}) => {
  if (typeof charset === 'string' || 'encode' in charset) {
    const shared = resolveCharset(charset);
    return {
      labels: shared,
      query: shared,
      text: shared,
    };
  }

  if ('decode' in charset) {
    throw new TypeError('A custom charset needs both encode and decode functions.');
  }

  return {
    labels: resolveCharset(charset.labels),
    query: resolveCharset(charset.query),
    text: resolveCharset(charset.text),
  };
};
