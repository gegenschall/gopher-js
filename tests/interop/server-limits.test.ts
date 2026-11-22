import { once } from 'node:events';
import { createConnection } from 'node:net';
import { buffer } from 'node:stream/consumers';
import { setTimeout as delay } from 'node:timers/promises';

import { createWire } from '@gopher-js/core';
import { createServer, info } from '@gopher-js/server';
import { vi } from 'vitest';

import { exchange, loopback, test } from './fixtures/server.js';

test('limits the first request line in bytes before decoding or dispatch', async ({
  start,
  signal,
  expect,
}) => {
  const parseRequest = vi.fn(createWire({ charset: 'utf-8' }).parseRequest);
  const wire = { ...createWire({ charset: 'utf-8' }), parseRequest };
  const server = createServer({
    publicAddress: loopback,
    maxRequestBytes: 6,
    wire,
  });
  server.search('', ({ query }) => [info(query)]);
  const address = await start(server);

  const exact = await exchange(address, '\t雪\r\nignored bytes', signal);
  expect(exact.toString()).toContain('i雪');

  const socket = createConnection({ ...address, signal });
  try {
    await once(socket, 'connect');
    socket.write('\t雪\r');
    await delay(5);
    socket.end('\n');
    expect(await buffer(socket)).toEqual(exact);
  } finally {
    socket.destroy();
  }

  const oversized = Buffer.from('3Request too large\t\terror.host\t0\r\n.\r\n');
  expect(await exchange(address, '\t雪x\r\n', signal)).toEqual(oversized);

  const unfinished = createConnection({ ...address, signal });
  try {
    await once(unfinished, 'connect');
    unfinished.write('1234567');
    expect(await buffer(unfinished)).toEqual(oversized);
  } finally {
    unfinished.destroy();
  }
  expect(parseRequest).toHaveBeenCalledTimes(2);
});

test('expires silent and trickling peers but lets a dispatched handler finish', async ({
  start,
  signal,
  expect,
}) => {
  const server = createServer({ publicAddress: loopback, requestTimeoutMs: 80 });
  server.text('', async () => {
    await delay(160);
    return 'ready';
  });
  const address = await start(server);
  const silent = createConnection({ ...address, signal });
  const slow = createConnection({ ...address, signal });
  const trickle = setInterval(() => slow.write('x'), 10);

  try {
    // Closing a socket while the peer is still writing can deliver a reset or EOF.
    const slowClosed = buffer(slow).catch((error: unknown) => {
      expect(error).toMatchObject({ code: 'ECONNRESET' });
    });

    const [empty, , complete] = await Promise.all([
      buffer(silent),
      slowClosed,
      exchange(address, '\r\n', signal),
    ]);
    expect(empty.length).toBe(0);
    expect(slow.bytesRead).toBe(0);
    expect(complete.toString()).toBe('ready\r\n.\r\n');
  } finally {
    clearInterval(trickle);
    silent.destroy();
    slow.destroy();
  }
});

test('validates request limit options when creating the server', ({ expect }) => {
  for (const maxRequestBytes of [0, -1, 1.5, Infinity]) {
    expect(() => createServer({ publicAddress: loopback, maxRequestBytes })).toThrow(RangeError);
  }
  for (const requestTimeoutMs of [0, -1, 1.5, 2 ** 31]) {
    expect(() => createServer({ publicAddress: loopback, requestTimeoutMs })).toThrow(RangeError);
  }
});
