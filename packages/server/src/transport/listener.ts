import { once } from 'node:events';
import { createServer, type Socket } from 'node:net';

import type { GopherAddress } from '@gopher-js/core';

export const createListener = (serve: (socket: Socket, signal: AbortSignal) => Promise<void>) => {
  const active = new Map<Socket, AbortController>();
  let started: Promise<GopherAddress> | undefined;
  let closing: Promise<void> | undefined;

  // A client may finish writing its selector and still await the full response.
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    const controller = new AbortController();
    active.set(socket, controller);

    socket.on('error', (error) => controller.abort(error));
    socket.once('close', () => {
      controller.abort();
      active.delete(socket);
    });

    void serve(socket, controller.signal).catch(() => socket.destroy());
  });

  const address = () => {
    const bound = server.address();
    if (bound && typeof bound !== 'string') return { host: bound.address, port: bound.port };
    return undefined;
  };

  const bind = async ({ host, port }: GopherAddress) => {
    server.listen({ host, port });
    await once(server, 'listening');

    const bound = address();
    if (!bound) throw new Error('Expected a bound TCP address.');
    return bound;
  };

  const listen = async (endpoint: GopherAddress) => {
    if (started || closing)
      throw new Error('The Gopher server is already starting, listening or closing.');
    started = bind(endpoint);

    try {
      return await started;
    } catch (error) {
      started = undefined;
      throw error;
    }
  };

  const stop = async (ready: Promise<GopherAddress>) => {
    try {
      await ready;
    } catch {
      return;
    }

    const stopped = new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

    for (const [socket, controller] of active) {
      controller.abort();
      if (!socket.destroyed) socket.resetAndDestroy();
    }

    await stopped;
  };

  const close = async () => {
    if (closing) return closing;
    if (!started) return;

    closing = stop(started);
    try {
      await closing;
    } finally {
      closing = undefined;
      started = undefined;
    }
  };

  return {
    listen,
    close,
    address,
  };
};
