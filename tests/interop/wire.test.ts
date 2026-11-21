import { once } from 'node:events';
import { createConnection } from 'node:net';
import { buffer } from 'node:stream/consumers';

import { createClient } from '@gopher-js/client';
import { createWire, encodeText, parseRequest } from '@gopher-js/core';
import { createServer as createGopherServer } from '@gopher-js/server';

import { tcpTest } from './fixtures/tcp.js';

const test = tcpTest.extend('peers', async ({ peer, signal }, { onCleanup }) => {
  const client = createConnection(peer.address);
  onCleanup(() => {
    client.destroy();
  });
  await once(client, 'connect', { signal });

  return { client, server: await peer.socket };
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
