import { once } from 'node:events';

import { createClient } from '@gopher-js/client';
import { createWire } from '@gopher-js/core';

import { tcpTest as test } from './fixtures/tcp.js';

test('sends the opaque selector and completes at the dot line while the peer stays open', async ({
  peer,
  signal,
  expect,
}) => {
  const client = createClient(peer.address);
  const respond = async () => {
    const socket = await peer.socket;
    let request = Buffer.alloc(0);

    for await (const chunk of socket.iterator({ destroyOnReturn: false })) {
      request = Buffer.concat([request, chunk]);
      if (request.includes('\r\n')) break;
    }

    expect(request).toEqual(Buffer.from([0x2f, 0xff, 13, 10]));
    const closed = once(socket, 'close', { signal });
    socket.write('..note\r');
    socket.write('\n.\r\n');
    await closed;
  };

  const [body] = await Promise.all([client.text('/\xff', { signal }), respond()]);
  expect(body).toBe('.note\n');
});

test('uses the configured charset and EOF framing', async ({ peer, signal, expect }) => {
  const wire = createWire({ charset: 'utf-8', textFraming: { read: 'eof' } });
  const client = createClient({ ...peer.address, wire });
  const respond = async () => {
    const socket = await peer.socket;
    await once(socket, 'data', { signal });
    socket.end('雪\r\n.\r\n');
  };

  const [body] = await Promise.all([client.text('', { signal }), respond()]);
  expect(body).toBe('雪\r\n.\r\n');
});

test('aborting a pending read rejects the request and closes the connection', async ({
  peer,
  signal,
  expect,
}) => {
  const controller = new AbortController();
  const abortAfterRequest = async () => {
    const socket = await peer.socket;
    await once(socket, 'data', { signal });
    const closed = once(socket, 'close', { signal });
    controller.abort();
    await closed;
  };

  const read = createClient(peer.address).text('/wait', { signal: controller.signal });
  await Promise.all([
    expect(read).rejects.toMatchObject({ name: 'AbortError' }),
    abortAfterRequest(),
  ]);
});

test('a malformed response rejects the read and releases the socket', async ({
  peer,
  signal,
  expect,
}) => {
  const respond = async () => {
    const socket = await peer.socket;
    await once(socket, 'data', { signal });
    const closed = once(socket, 'close', { signal });
    socket.write('malformed\n');
    await closed;
  };

  const read = createClient(peer.address).text('/bad', { signal });
  await Promise.all([expect(read).rejects.toThrow(SyntaxError), respond()]);
});
