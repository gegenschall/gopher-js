import { chunksOf } from './bytes.js';
import type { WireSource } from './wire.types.js';

export const crlf = Buffer.from('\r\n');
export const dotLine = Buffer.from('.\r\n');

/** Assemble lines before interpreting their bytes. Keep the delimiter for EOF policy. */
export async function* wireLines(source: WireSource) {
  let fragments: Buffer[] = [];

  for await (const chunk of chunksOf(source)) {
    const bytes = Buffer.from(chunk);
    let start = 0;

    for (let end = bytes.indexOf(10); end >= 0; end = bytes.indexOf(10, start)) {
      const part = bytes.subarray(start, end + 1);
      if (fragments.length) {
        fragments.push(part);
        yield Buffer.concat(fragments);
        fragments = [];
      } else {
        yield part;
      }

      start = end + 1;
    }

    if (start < bytes.length) {
      fragments.push(bytes.subarray(start));
    }
  }

  if (fragments.length) {
    yield Buffer.concat(fragments);
  }
}

export const stripCrlf = (line: Uint8Array): Uint8Array => {
  if (line.at(-2) !== 13 || line.at(-1) !== 10) {
    throw new SyntaxError('Expected a CRLF-terminated Gopher line.');
  }

  const content = line.subarray(0, -2);

  if (content.includes(13) || content.includes(10)) {
    throw new SyntaxError('Unexpected newline inside a Gopher line.');
  }

  return content;
};
