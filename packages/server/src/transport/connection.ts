import { once } from 'node:events';
import type { Socket } from 'node:net';

import { createMenuEntry, itemTypes, type GopherRequest, type GopherWire } from '@gopher-js/core';

import type { ServerErrorEvent, ServerOptions } from '../api/server.types.js';
import type { Binding, ResponseBody, RouteResult } from '../dispatch/binding.types.js';
import { RequestTooLarge } from './request.js';

const writeBody = async (socket: Socket, body: ResponseBody, signal: AbortSignal) => {
  signal.throwIfAborted();

  if (body instanceof Uint8Array) {
    socket.end(body, () => socket.destroy());
    return;
  }

  for await (const chunk of body) {
    signal.throwIfAborted();
    if (!socket.write(chunk)) {
      await once(socket, 'drain', { signal });
    }
  }

  socket.end(() => socket.destroy());
};

export const serveConnection = async (
  socket: Socket,
  signal: AbortSignal,
  {
    wire,
    readRequest,
    lookup,
    onError,
  }: {
    wire: GopherWire;
    readRequest: (socket: Socket) => Promise<GopherRequest>;
    lookup: (selector: string) => Binding | undefined;
    onError: ServerOptions['onError'];
  },
) => {
  const fail = (label: string) =>
    writeBody(
      socket,
      wire.encodeMenu([
        createMenuEntry(itemTypes.error, label, {
          selector: '',
          host: 'error.host',
          port: 0,
        }),
      ]),
      signal,
    );

  let request: GopherRequest;
  try {
    request = await readRequest(socket);
  } catch (cause) {
    if (!socket.destroyed && !signal.aborted) {
      await fail(cause instanceof RequestTooLarge ? 'Request too large' : 'Malformed request');
    }
    return;
  }

  if (socket.destroyed || signal.aborted) return;
  const { selector, query } = request;
  const binding = lookup(selector);

  if (!binding) return fail('Selector not found');

  let stage: ServerErrorEvent['stage'] = 'handler';
  try {
    let result: RouteResult;
    if ('search' in binding) {
      if (query === undefined) return fail('Search query required');
      result = await binding.search({
        selector,
        signal,
        query,
      });
    } else {
      if (query !== undefined) return fail('Unexpected search query');
      result = await binding.read({ selector, signal });
    }

    signal.throwIfAborted();
    stage = 'response';
    await writeBody(socket, typeof result === 'function' ? result() : result, signal);
  } catch (cause) {
    if (socket.destroyed || signal.aborted) return;

    if (onError) {
      // A diagnostic hook cannot hold the response open or recursively report its own failure.
      void Promise.resolve()
        .then(() =>
          onError({
            stage,
            selector,
            cause,
          }),
        )
        .catch(() => {});
    }

    if (socket.bytesWritten > 0) {
      socket.resetAndDestroy();
      return;
    }

    await fail('Handler failed');
  }
};
