import type { GopherRequest, ItemCodec, ItemValue, Menu } from '@gopher-js/core';
import type { GopherServer, RequestContext, RouteHandler } from '@gopher-js/server';
import { MessagePattern, type MessageHandler } from '@nestjs/microservices';
import { firstValueFrom, fromEvent, isObservable, takeUntil } from 'rxjs';

import type { GopherMethodDecorator } from './transport.types.js';

export const transportId = Symbol('GopherTransport');
export const bindRoute = Symbol('bindGopherRoute');

const route = <Result>(
  pattern: string,
  register: (server: GopherServer<ItemCodec>, handler: RouteHandler<Result>) => void,
): GopherMethodDecorator<Result> =>
  MessagePattern(pattern, transportId, {
    [bindRoute]: (
      server: GopherServer<ItemCodec>,
      callback: MessageHandler<GopherRequest, RequestContext, Result>,
    ) => {
      register(server, async (context: RequestContext & GopherRequest) => {
        const { selector, query, signal } = context;
        const payload = query === undefined ? { selector } : { selector, query };
        const result = await callback(payload, context);
        signal.throwIfAborted();

        if (isObservable(result)) {
          return firstValueFrom(result.pipe(takeUntil(fromEvent(signal, 'abort'))));
        }
        return result;
      });
    },
  });

export const GopherText = (selector: string) =>
  route<string>(selector, (server, handler) => server.text(selector, handler));

export const GopherMenu = (selector: string) =>
  route<Menu>(selector, (server, handler) => server.menu(selector, handler));

export const GopherSearch = (selector: string) =>
  route<Menu>(selector, (server, handler) => server.search(selector, handler));

export const GopherBinary = (selector: string) =>
  route<Uint8Array | AsyncIterable<Uint8Array>>(selector, (server, handler) =>
    server.binary(selector, handler),
  );

export const GopherItem = <Codec extends ItemCodec>(codec: Codec, selector: string) =>
  route<ItemValue<Codec>>(selector, (server, handler) => server.item(codec, selector, handler));
