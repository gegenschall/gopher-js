import {
  createWire,
  itemTypes,
  validateItemTypes,
  type ItemCodec,
  type ItemValue,
} from '@gopher-js/core';

import { createRouteTable } from '../dispatch/route-table.js';
import { serveConnection } from '../transport/connection.js';
import { createListener } from '../transport/listener.js';
import { createRequestReader } from '../transport/request.js';
import type { RouteHandler } from './route.types.js';
import type { GopherServer, ServerOptions } from './server.types.js';

export const createServer = <const Codec extends ItemCodec = never>(
  options: ServerOptions<Codec>,
): GopherServer<Codec> => {
  const types = options.types ?? [];
  validateItemTypes(types);

  const registered = new Set<ItemCodec>(types);
  const wire = options.wire ?? createWire();
  const readRequest = createRequestReader(wire, options.maxRequestBytes, options.requestTimeoutMs);

  const listener = createListener((socket, signal) =>
    serveConnection(socket, signal, wire, readRequest, routes.lookup),
  );
  const routes = createRouteTable(options.publicAddress, () => listener.address()?.port ?? 0);
  const { register } = routes;

  const item = <Selected extends Codec>(
    codec: Selected,
    selector: string,
    handler: RouteHandler<NoInfer<ItemValue<Selected>>>,
  ) => {
    if (!registered.has(codec)) {
      throw new TypeError(`The item type "${codec.kind}" is not registered on this server.`);
    }

    // Registration pairs this exact codec with a handler producing its value type.
    const encoder = codec as { encode(value: ItemValue<Selected>): string | Uint8Array };

    return register(codec.type, selector, {
      read: async (context) => {
        const body = encoder.encode(await handler(context));
        return typeof body === 'string' ? wire.encodeText(body) : body;
      },
    });
  };

  return {
    wire,
    text: (selector, handler) =>
      register(itemTypes.text, selector, {
        read: async (context) => wire.encodeText(await handler(context)),
      }),
    menu: (selector, handler) =>
      register(itemTypes.menu, selector, {
        read: async (context) => wire.encodeMenu(await handler(context)),
      }),
    search: (selector, handler) =>
      register(itemTypes.search, selector, {
        search: async (context) => wire.encodeMenu(await handler(context)),
      }),
    binary: (selector, handler) => register(itemTypes.binary, selector, { read: handler }),
    item,

    listen: listener.listen,
    close: listener.close,
  };
};
