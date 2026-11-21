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
import type { RequestContext, RouteHandler } from './route.types.js';
import type { GopherServer, ServerOptions } from './server.types.js';

const encodeResult =
  <Value, Context extends RequestContext>(
    handler: RouteHandler<Value, Context>,
    encode: (value: Value) => Uint8Array,
  ): RouteHandler<() => Uint8Array, Context> =>
  async (context) => {
    const value = await handler(context);
    return () => encode(value);
  };

export const createServer = <const Codec extends ItemCodec = never>(
  options: ServerOptions<Codec>,
): GopherServer<Codec> => {
  const types = options.types ?? [];
  validateItemTypes(types);

  const registered = new Set<ItemCodec>(types);
  const wire = options.wire ?? createWire();
  const readRequest = createRequestReader(wire, options.maxRequestBytes, options.requestTimeoutMs);

  const listener = createListener((socket, signal, markResponding) =>
    serveConnection(socket, signal, {
      wire,
      readRequest,
      markResponding,
      lookup: routes.lookup,
      onError: options.onError,
    }),
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
      read: encodeResult(handler, (value) => {
        const body = encoder.encode(value);
        return typeof body === 'string' ? wire.encodeText(body) : body;
      }),
    });
  };

  return {
    wire,
    get address() {
      return listener.address();
    },
    on: listener.on,

    text: (selector, handler) =>
      register(itemTypes.text, selector, {
        read: encodeResult(handler, (text) => wire.encodeText(text)),
      }),
    menu: (selector, handler) =>
      register(itemTypes.menu, selector, {
        read: encodeResult(handler, (menu) => wire.encodeMenu(menu)),
      }),
    search: (selector, handler) =>
      register(itemTypes.search, selector, {
        search: encodeResult(handler, (menu) => wire.encodeMenu(menu)),
      }),
    binary: (selector, handler) => register(itemTypes.binary, selector, { read: handler }),
    item,

    listen: listener.listen,
    close: listener.close,
  };
};
