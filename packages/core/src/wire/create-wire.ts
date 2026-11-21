import type { MenuEntry, MenuLine } from '../model/menu.types.js';
import { resolveCharsets } from './charset.js';
import { resolveMenuFraming } from './menu-framing.js';
import { readEntry, writeEntry } from './menu.js';
import type { GopherWire, MenuEntryCodec, WireOptions } from './options.types.js';
import { readRequest, writeRequest } from './request.js';
import { resolveTextFraming } from './text.js';

export const createWire = (options: WireOptions = {}): GopherWire & MenuEntryCodec => {
  const charset = resolveCharsets(options.charset);
  const menuFraming = resolveMenuFraming(options.menuFraming);
  const textFraming = resolveTextFraming(options.textFraming);

  const parseMenuEntry = (bytes: Uint8Array) => readEntry(bytes, charset.labels);
  const encodeMenuEntry = (entry: MenuLine) => writeEntry(entry, charset.labels);

  return {
    encodeRequest: (request) => writeRequest(request, charset.query),
    parseRequest: (source) => readRequest(source, charset.query),

    parseMenuEntry,
    encodeMenuEntry,

    async parseMenu(source) {
      const entries: MenuEntry[] = [];
      for await (const line of menuFraming.read(source)) {
        entries.push(parseMenuEntry(line));
      }

      return entries;
    },

    encodeMenu: (menu) => menuFraming.write(menu.map(encodeMenuEntry)),

    parseText: (source) => textFraming.read(source, charset.text),
    encodeText: (text) => textFraming.write(text, charset.text),
  };
};

export const {
  encodeRequest,
  parseRequest,
  encodeMenuEntry,
  parseMenuEntry,
  encodeMenu,
  parseMenu,
  encodeText,
  parseText,
} = createWire();
