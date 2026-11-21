import { once } from 'node:events';
import { createConnection } from 'node:net';
import { buffer } from 'node:stream/consumers';

import type { GopherAddress } from '@gopher-js/core';
import { test as base } from 'vitest';

export const loopback = { host: '127.0.0.1', port: 0 };

export const test = base.extend('start', ({ signal }, { onCleanup }) => {
  const servers = new Set<{ close(): Promise<void> }>();
  onCleanup(async () => {
    await Promise.all([...servers].map((server) => server.close()));
  });

  return (server: {
    listen(address: GopherAddress): Promise<GopherAddress>;
    close(): Promise<void>;
  }) => {
    signal.throwIfAborted();
    servers.add(server);
    return server.listen(loopback);
  };
});

export const exchange = async (address: GopherAddress, request: string, signal: AbortSignal) => {
  const socket = createConnection({ ...address, signal });
  try {
    await once(socket, 'connect');
    socket.end(request);
    return await buffer(socket);
  } finally {
    socket.destroy();
  }
};
