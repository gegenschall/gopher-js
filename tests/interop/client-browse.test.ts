import { once } from 'node:events';

import { createClient } from '@gopher-js/client';
import { collectBinary, createWire, defineItemType } from '@gopher-js/core';
import { vi } from 'vitest';

import { tcpTest } from './fixtures/tcp.js';

const test = tcpTest.extend(
  'serve',
  ({ listen }) =>
    async (respond: (line: string) => string | Uint8Array) => {
      const requests: string[] = [];
      const address = await listen((socket) => {
        let input = '';
        socket.setEncoding('latin1');
        socket.on('data', (chunk: string) => {
          input += chunk;
          if (input.endsWith('\r\n')) {
            requests.push(input);
            socket.end(respond(input));
          }
        });
      });

      return { address, requests };
    },
);

test('follows menu, search and text entries to their advertised destination', async ({
  serve,
  signal,
  expect,
}) => {
  const remote = await serve((line) => {
    if (line === '/doc\r\n') return '..hello\r\n.\r\n';
    return 'iFound\t\tfake\t0\r\n.\r\n';
  });
  const target = `\t${remote.address.host}\t${remote.address.port}\r\n`;
  const root = await serve(() =>
    [
      `1Sub\t/sub${target}`,
      `7Find\t/find${target}`,
      `0Doc\t/doc${target}`,
      '3Missing\t\tfake\t0\r\n.\r\n',
    ].join(''),
  );
  const client = createClient({ ...root.address, wire: createWire({ charset: 'utf-8' }) });
  const entries = await client.menu(undefined, { signal });

  expect(entries.map((entry) => entry.kind)).toEqual(['menu', 'search', 'text', 'error']);
  for (const entry of entries) {
    switch (entry.kind) {
      case 'menu':
        expect((await entry.read({ signal }))[0]?.kind).toBe('info');
        break;
      case 'search':
        expect((await entry.search('雪', { signal }))[0]?.label).toBe('Found');
        break;
      case 'text':
        expect(await entry.read({ signal })).toBe('.hello\n');
        break;
      case 'error':
        expect(entry).not.toHaveProperty('read');
        break;
    }
  }
  expect(root.requests).toEqual(['\r\n']);
  expect(remote.requests).toEqual(['/sub\r\n', '/find\t\xe9\x9b\xaa\r\n', '/doc\r\n']);
});

test('search returns browsable results with custom codecs, binary streams and raw unknown items', async ({
  serve,
  signal,
  expect,
}) => {
  const bytes = Buffer.from([0, 13, 10, 46, 13, 10, 255]);
  const remote = await serve((line) => (line === '/count\r\n' ? '42\r\n.\r\n' : bytes));
  const target = `\t${remote.address.host}\t${remote.address.port}\r\n`;
  const root = await serve(() =>
    [
      `xCount\t/count${target}`,
      `pSize\t/blob${target}`,
      `9Blob\t/blob${target}`,
      `?Unknown\t/blob${target}`,
      '.\r\n',
    ].join(''),
  );

  const count = defineItemType({
    kind: 'count',
    type: 'x',
    framing: 'text',
    decode: BigInt,
    encode: (value) => value.toString(),
  });
  const size = defineItemType({
    kind: 'size',
    type: 'p',
    framing: 'binary',
    decode: (body) => body.byteLength,
    encode: (length) => new Uint8Array(length),
  });
  const client = createClient({ ...root.address, types: [count, size] });
  const entries = await client.search('/lookup', '', { signal });

  expect(entries.map((entry) => entry.kind)).toEqual(['count', 'size', 'binary', 'unknown']);
  for (const entry of entries) {
    switch (entry.kind) {
      case 'count':
        expect(await entry.read({ signal })).toBe(42n);
        break;
      case 'size':
        expect(await entry.read({ signal })).toBe(bytes.length);
        break;
      case 'binary':
        expect(await collectBinary(entry.read({ signal }))).toEqual(bytes);
        break;
      case 'unknown':
        expect(await collectBinary(entry.raw({ signal }))).toEqual(bytes);
        break;
    }
  }
  const unregistered = await createClient(root.address).menu('', { signal });
  expect(unregistered.map((entry) => entry.kind)).toEqual([
    'unknown',
    'unknown',
    'binary',
    'unknown',
  ]);

  expect(root.requests).toEqual(['/lookup\t\r\n', '\r\n']);
  expect(remote.requests).toEqual(['/count\r\n', '/blob\r\n', '/blob\r\n', '/blob\r\n']);
});

test('binary yields before EOF and breaking iteration closes the socket', async ({
  peer,
  signal,
  expect,
}) => {
  const respond = async () => {
    const socket = await peer.socket;
    await once(socket, 'data', { signal });
    const closed = once(socket, 'close', { signal });
    socket.write(Buffer.from([255]));
    await closed;
  };
  const readFirst = async () => {
    const stream = createClient(peer.address).binary('/stream', { signal });
    for await (const chunk of stream) {
      expect(chunk).toEqual(Buffer.from([255]));
      return;
    }
    throw new Error('Expected a binary chunk.');
  };

  await Promise.all([readFirst(), respond()]);
});

test('aborting a pending binary read releases the socket', async ({ peer, signal, expect }) => {
  const controller = new AbortController();
  const abortAfterRequest = async () => {
    const socket = await peer.socket;
    await once(socket, 'data', { signal });
    const closed = once(socket, 'close', { signal });
    controller.abort();
    await closed;
  };

  const stream = createClient(peer.address).binary('/wait', { signal: controller.signal });
  await Promise.all([
    expect(collectBinary(stream)).rejects.toMatchObject({ name: 'AbortError' }),
    abortAfterRequest(),
  ]);
});

test('a truncated menu rejects and a subsequent request on the same client succeeds', async ({
  serve,
  signal,
  expect,
}) => {
  const peer = await serve((line) => (line === '/bad\r\n' ? '0Doc\t/doc\thost\t70\r\n' : '.\r\n'));
  const client = createClient(peer.address);

  await expect(client.menu('/bad', { signal })).rejects.toThrow(SyntaxError);
  expect(await client.menu('/empty', { signal })).toEqual([]);
});

test('binary defers the request until iteration and honors cancellation before the first read', async ({
  serve,
  expect,
}) => {
  const peer = await serve(() => 'unused');
  const wire = createWire();
  const encodeRequest = vi.spyOn(wire, 'encodeRequest');
  const client = createClient({ ...peer.address, wire });
  const controller = new AbortController();

  const stream = client.binary('/later', { signal: controller.signal });
  expect(encodeRequest).not.toHaveBeenCalled();
  controller.abort();

  await expect(collectBinary(stream)).rejects.toMatchObject({ name: 'AbortError' });
  expect(encodeRequest).not.toHaveBeenCalled();
  expect(peer.requests).toEqual([]);
});
