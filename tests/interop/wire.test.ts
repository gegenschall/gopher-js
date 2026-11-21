import { once } from 'node:events';
import { createConnection, createServer, type Socket } from 'node:net';
import { buffer } from 'node:stream/consumers';

import { createClient } from '@gopher-js/client';
import { createWire, encodeText, parseRequest } from '@gopher-js/core';
import { createServer as createGopherServer } from '@gopher-js/server';
import { test as base } from 'vitest';

const test = base.extend('peers', async ({ signal }, { onCleanup }) => {
  const accepted = Promise.withResolvers<Socket>();
  const sockets = new Set<Socket>();
  const listener = createServer((socket) => {
    sockets.add(socket);
    accepted.resolve(socket);
  });

  onCleanup(async () => {
    for (const socket of sockets) {
      socket.destroy();
    }

    if (listener.listening) {
      await listener[Symbol.asyncDispose]();
    }
  });

  const ready = once(listener, 'listening', { signal });
  listener.listen(0, '127.0.0.1');
  await ready;

  const address = listener.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected a TCP listener address.');
  }

  const client = createConnection({ host: address.address, port: address.port });
  sockets.add(client);
  await once(client, 'connect', { signal });

  return { client, server: await accepted.promise };
});

test('can reply on the same TCP socket after reading a complete selector', async ({
  peers,
  expect,
}) => {
  peers.client.write('archive:notes\r\n');
  expect(await parseRequest(peers.server)).toStrictEqual({ selector: 'archive:notes' });
  expect(peers.server.writable).toBe(true);

  peers.server.end(encodeText('.notes'));
  const reply = await buffer(peers.client);

  expect(reply).toEqual(Buffer.from('..notes\r\n.\r\n'));
});

test('client and server can select complementary wire settings for a TCP response', async ({
  peers,
  expect,
}) => {
  const publicAddress = { host: 'archive.example', port: 70 };
  const server = createGopherServer({
    publicAddress,
    wire: createWire({ charset: 'utf-8', menuFraming: { write: 'eof' } }),
  });
  const client = createClient({
    ...publicAddress,
    wire: createWire({
      charset: { labels: 'utf-8', query: 'utf-8' },
      menuFraming: { read: 'dot-or-eof' },
    }),
  });

  const search = { selector: '/\xff', query: '雪' };
  peers.client.write(client.wire.encodeRequest(search));
  expect(await server.wire.parseRequest(peers.server)).toEqual(search);

  const route = server.text('/\xff', () => 'hello');
  peers.server.end(server.wire.encodeMenu([route.link('雪')]));
  expect(await client.wire.parseMenu(peers.client)).toEqual([route.link('雪')]);

  const classic = createClient(publicAddress);
  await expect(classic.wire.parseMenu(Buffer.alloc(0))).rejects.toThrow(SyntaxError);
});
