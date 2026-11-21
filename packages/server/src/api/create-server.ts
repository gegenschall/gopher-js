import { createWire, itemTypes, validateItemTypes, type ItemCodec } from '@gopher-js/core';

import { createRouteTable } from '../dispatch/route-table.js';
import { close, listen } from '../transport/listener.js';
import type { GopherServer, ServerOptions } from './server.types.js';

export const createServer = <const Codec extends ItemCodec = never>(
  options: ServerOptions<Codec>,
): GopherServer<Codec> => {
  const types = options.types ?? [];
  validateItemTypes(types);

  const registered = new Set<ItemCodec>(types);
  const { register } = createRouteTable(options.publicAddress);

  return {
    wire: options.wire ?? createWire(),

    text: (selector, handler) =>
      register(selector, {
        type: itemTypes.text,
        handler,
      }),
    menu: (selector, handler) =>
      register(selector, {
        type: itemTypes.menu,
        handler,
      }),
    search: (selector, handler) =>
      register(selector, {
        type: itemTypes.search,
        handler,
      }),
    binary: (selector, handler) =>
      register(selector, {
        type: itemTypes.binary,
        handler,
      }),

    item: (codec, selector, handler) => {
      if (!registered.has(codec)) {
        throw new TypeError(`The item type "${codec.kind}" is not registered on this server.`);
      }

      return register(selector, {
        type: codec.type,
        codec,
        handler,
      });
    },

    listen,
    close,
  };
};
