import { isCustomFraming } from './framing.js';
import { dotLine, wireLines } from './lines.js';
import type { MenuFraming, MenuFramingOptions } from './options.types.js';

export const resolveMenuFraming = (options: MenuFraming | MenuFramingOptions = {}): MenuFraming => {
  if (isCustomFraming(options)) {
    return options;
  }

  const { read = 'dot', write = 'dot' } = options;

  return {
    async *read(source) {
      for await (const line of wireLines(source)) {
        if (line.equals(dotLine)) {
          return;
        }

        yield line;
      }

      if (read === 'dot') {
        throw new SyntaxError('Gopher menu ended before its dot terminator.');
      }
    },

    write(entries) {
      const chunks = [...entries];
      if (write === 'dot') {
        chunks.push(dotLine);
      }

      return Buffer.concat(chunks);
    },
  };
};
