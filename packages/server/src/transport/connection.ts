import { once } from 'node:events';
import type { Socket } from 'node:net';

import { createMenuEntry, itemTypes, type GopherWire } from '@gopher-js/core';

import type { Binding, ResponseBody } from '../dispatch/binding.types.js';

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
  wire: GopherWire,
  lookup: (selector: string) => Binding | undefined,
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

  let failure = 'Malformed request';
  try {
    const { selector, query } = await wire.parseRequest(socket);
    signal.throwIfAborted();
    const binding = lookup(selector);

    if (!binding) {
      await fail('Selector not found');
      return;
    }

    let body: ResponseBody;
    failure = 'Handler failed';

    if ('search' in binding) {
      if (query === undefined) {
        await fail('Search query required');
        return;
      }

      body = await binding.search({
        selector,
        signal,
        query,
      });
    } else {
      if (query !== undefined) {
        await fail('Unexpected search query');
        return;
      }

      body = await binding.read({ selector, signal });
    }

    await writeBody(socket, body, signal);
  } catch {
    if (socket.destroyed || signal.aborted) return;
    if (socket.bytesWritten > 0) {
      socket.resetAndDestroy();
      return;
    }

    await fail(failure);
  }
};
