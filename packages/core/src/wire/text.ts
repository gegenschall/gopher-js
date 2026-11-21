import { collectBinary } from './binary.js';
import { isCustomFraming } from './framing.js';
import { crlf, dotLine, stripCrlf, wireLines } from './lines.js';
import type { TextFraming, TextFramingOptions, WireCharset } from './options.types.js';
import type { WireSource } from './wire.types.js';

const readDotText = async (source: WireSource, charset: WireCharset, requireDot: boolean) => {
  const lines: string[] = [];

  for await (const line of wireLines(source)) {
    if (line.equals(dotLine)) {
      return lines.join('');
    }

    const complete = line.at(-1) === 10;
    const content = complete ? stripCrlf(line) : line;
    const stuffed = content[0] === 46 && content[1] === 46;
    lines.push(charset.decode(stuffed ? content.subarray(1) : content));

    if (complete) {
      lines.push('\n');
    }
  }

  if (requireDot) {
    throw new SyntaxError('Gopher text ended before its dot terminator.');
  }

  return lines.join('');
};

const dot = Buffer.from('.');

const writeDotText = (text: string, charset: WireCharset): Uint8Array => {
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  if (lines.at(-1) === '') {
    lines.pop();
  }

  const chunks: Uint8Array[] = [];
  for (const line of lines) {
    if (line.includes('\r')) {
      throw new SyntaxError('Expected LF or CRLF in a Gopher text document.');
    }

    const bytes = charset.encode(line);
    if (bytes.includes(13) || bytes.includes(10)) {
      throw new SyntaxError('Encoded text line contains a reserved newline byte.');
    }

    if (bytes[0] === 46) {
      chunks.push(dot);
    }

    chunks.push(bytes, crlf);
  }

  chunks.push(dotLine);
  return Buffer.concat(chunks);
};

export const resolveTextFraming = (options: TextFraming | TextFramingOptions = {}): TextFraming => {
  if (isCustomFraming(options)) {
    return options;
  }

  const { read = 'dot-or-eof', write = 'dot' } = options;

  return {
    read:
      read === 'eof'
        ? async (source, charset) => charset.decode(await collectBinary(source))
        : (source, charset) => readDotText(source, charset, read === 'dot'),
    write: write === 'eof' ? (text, charset) => charset.encode(text) : writeDotText,
  };
};
