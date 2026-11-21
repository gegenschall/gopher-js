import { once } from 'node:events';
import { createServer, type Socket } from 'node:net';

import type { GopherAddress } from '@gopher-js/core';

import type { CloseOptions } from '../api/server.types.js';

export const createListener = (
  serve: (socket: Socket, signal: AbortSignal, markResponding: () => void) => Promise<void>,
) => {
  const active = new Map<Socket, { controller: AbortController; responding: boolean }>();
  let started: Promise<GopherAddress> | undefined;
  let closing: Promise<void> | undefined;

  // A client may finish writing its selector and still await the full response.
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    const controller = new AbortController();
    const connection = { controller, responding: false };
    active.set(socket, connection);

    socket.on('error', (error) => controller.abort(error));
    socket.once('close', () => {
      controller.abort();
      active.delete(socket);
    });

    const markResponding = () => {
      connection.responding = true;
    };

    void serve(socket, controller.signal, markResponding).catch(() => socket.destroy());
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

  const abortConnections = (includeResponding: boolean) => {
    for (const [socket, { controller, responding }] of active) {
      if (responding && !includeResponding) continue;

      controller.abort();
      if (!socket.destroyed) socket.resetAndDestroy();
    }
  };

  const stop = async (ready: Promise<GopherAddress>, gracePeriodMs: number) => {
    try {
      await ready;
    } catch {
      return;
    }

    const stopped = new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

    abortConnections(gracePeriodMs === 0);
    const deadline =
      gracePeriodMs > 0 ? setTimeout(() => abortConnections(true), gracePeriodMs) : undefined;

    try {
      await stopped;
    } finally {
      clearTimeout(deadline);
    }
  };

  const close = async ({ gracePeriodMs = 0 }: CloseOptions = {}) => {
    if (closing) return closing;
    if (!Number.isInteger(gracePeriodMs) || gracePeriodMs < 0 || gracePeriodMs > 2 ** 31 - 1) {
      throw new RangeError('gracePeriodMs must be an integer between 0 and 2147483647.');
    }

    if (!started) return;

    closing = stop(started, gracePeriodMs);
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
