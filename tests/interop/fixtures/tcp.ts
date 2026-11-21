import { once } from 'node:events';
import { createServer, type Socket, type Server } from 'node:net';

import { test as base } from 'vitest';

export const tcpTest = base
  .extend('listen', ({ signal }, { onCleanup }) => {
    const listeners = new Set<Server>();
    const sockets = new Set<Socket>();

    onCleanup(async () => {
      for (const socket of sockets) socket.destroy();
      await Promise.all([...listeners].map((server) => server[Symbol.asyncDispose]()));
    });

    return async (accept: (socket: Socket) => void) => {
      const server = createServer((socket) => {
        sockets.add(socket);
        accept(socket);
      });

      const ready = once(server, 'listening', { signal });
      server.listen(0, '127.0.0.1');
      await ready;
      listeners.add(server);

      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Expected a TCP listener address.');
      return { host: address.address, port: address.port };
    };
  })
  .extend('peer', async ({ listen }) => {
    const accepted = Promise.withResolvers<Socket>();
    const address = await listen(accepted.resolve);

    return { address, socket: accepted.promise };
  });

export const waitForReset = async (socket: Socket, signal: AbortSignal) => {
  const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()));
  const [error] = await once(socket, 'error', { signal });
  if (error.code !== 'ECONNRESET') throw error;
  await closed;
};
