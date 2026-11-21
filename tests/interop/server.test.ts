import { once } from 'node:events';
import { createConnection } from 'node:net';
import { buffer } from 'node:stream/consumers';

import { createClient } from '@gopher-js/client';
import { collectBinary, createWire, defineItemType, type GopherAddress } from '@gopher-js/core';
import { createServer, info } from '@gopher-js/server';
import { test as base } from 'vitest';

const loopback = { host: '127.0.0.1', port: 0 };

const test = base.extend('start', ({ signal }, { onCleanup }) => {
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

const exchange = async (address: GopherAddress, request: string, signal: AbortSignal) => {
  const socket = createConnection({ ...address, signal });
  try {
    await once(socket, 'connect');
    socket.end(request);
    return await buffer(socket);
  } finally {
    socket.destroy();
  }
};

test('serves a text route through the public client and reports the bound address', async ({
  start,
  signal,
  expect,
}) => {
  const server = createServer({ publicAddress: loopback });
  const about = server.text('/about', async ({ selector }) => '.' + selector);
  const link = about.link('About');
  const address = await start(server);

  expect(address.port).toBeGreaterThan(0);
  expect(link.target.port).toBe(address.port);
  expect(await createClient(address).text('/about', { signal })).toBe('./about\n');
});

test('a half-closed client receives the exact complete response', async ({
  start,
  signal,
  expect,
}) => {
  const server = createServer({ publicAddress: { host: 'public.example', port: 7070 } });
  const route = server.text('/about', async () => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    return '.hello';
  });
  const address = await start(server);

  expect(route.link('About').target.port).toBe(7070);
  expect(await exchange(address, '/about\r\n', signal)).toEqual(Buffer.from('..hello\r\n.\r\n'));
});

test('browses across servers, searches in UTF-8, and reads custom text and binary items', async ({
  start,
  signal,
  expect,
}) => {
  const count = defineItemType({
    type: 'x',
    kind: 'count',
    framing: 'text',
    decode: BigInt,
    encode: (value) => value.toString(),
  });
  const packet = defineItemType({
    type: 'p',
    kind: 'packet',
    framing: 'binary',
    decode: (bytes) => Array.from(bytes),
    encode: (values) => Uint8Array.from(values),
  });
  const wire = createWire({ charset: 'utf-8' });
  const archive = createServer({
    publicAddress: loopback,
    types: [count, packet],
    wire,
  });
  const counter = archive.item(count, 'archive:count', () => 42n);
  const data = archive.item(packet, '/packet', () => [255, 0]);
  const search = archive.search('/\xff', ({ query }) => [
    info(query),
    counter.link('Count'),
    data.link('Bytes'),
  ]);
  await start(archive);

  const root = createServer({ publicAddress: loopback, wire });
  root.menu('', () => [search.link('Find')]);
  const client = createClient({
    ...(await start(root)),
    types: [count, packet],
    wire,
  });
  const [find] = await client.menu('', { signal });
  if (find?.kind !== 'search') throw new Error('Expected a search entry.');

  for (const query of ['', '雪']) {
    const [label, result, bytes] = await find.search(query, { signal });
    expect(label?.label).toBe(query);
    if (result?.kind !== 'count' || bytes?.kind !== 'packet')
      throw new Error('Expected custom items.');
    expect(await result.read({ signal })).toBe(42n);
    expect(await bytes.read({ signal })).toEqual([255, 0]);
  }
});

test('serves buffers and asynchronous binary chunks byte-for-byte', async ({
  start,
  signal,
  expect,
}) => {
  const server = createServer({ publicAddress: loopback });
  const bytes = Buffer.from([0, 255, 13, 10, 46, 13, 10]);
  server.binary('/buffer', () => bytes);
  server.binary('/stream', async function* () {
    yield bytes.subarray(0, 2);
    yield bytes.subarray(2);
  });
  const client = createClient(await start(server));
  for (const selector of ['/buffer', '/stream']) {
    expect(await collectBinary(client.binary(selector, { signal }))).toEqual(bytes);
  }
});

test('reports malformed requests, missing routes and handler failures as type-3 menu entries', async ({
  start,
  signal,
  expect,
}) => {
  const server = createServer({ publicAddress: loopback });
  server.search('/find', () => []);
  server.text('/ok', () => 'ok');
  server.text('/broken', () => {
    throw new Error('private detail');
  });
  const address = await start(server);

  for (const [request, label] of [
    ['bad\n', 'Malformed request'],
    ['/missing\r\n', 'Selector not found'],
    ['/find\r\n', 'Search query required'],
    ['/ok\tq\r\n', 'Unexpected search query'],
    ['/broken\r\n', 'Handler failed'],
  ] as const) {
    expect(await exchange(address, request, signal)).toEqual(
      Buffer.from(`3${label}\t\terror.host\t0\r\n.\r\n`),
    );
  }
  expect(await createClient(address).text('/ok', { signal })).toBe('ok\n');
});

test('a client abort signals a handler that is waiting without writing', async ({
  start,
  expect,
}) => {
  const entered = Promise.withResolvers<void>();
  const cancelled = Promise.withResolvers<void>();
  const server = createServer({ publicAddress: loopback });
  server.text('/wait', async ({ signal }) => {
    entered.resolve();
    await once(signal, 'abort');
    cancelled.resolve();
    return 'unused';
  });

  const controller = new AbortController();
  const read = createClient(await start(server)).text('/wait', { signal: controller.signal });
  await entered.promise;
  controller.abort();

  await expect(read).rejects.toMatchObject({ name: 'AbortError' });
  await cancelled.promise;
});

test('closing an active server aborts its producer and interrupts an incomplete transfer', async ({
  start,
  signal,
  expect,
}) => {
  const released = Promise.withResolvers<void>();
  const server = createServer({ publicAddress: loopback });
  server.binary('/wait', async function* (context) {
    try {
      yield Uint8Array.of(1);
      await once(context.signal, 'abort', { signal });
    } finally {
      released.resolve();
    }
  });

  const client = createClient(await start(server));
  const stream = client.binary('/wait', { signal })[Symbol.asyncIterator]();
  expect((await stream.next()).value).toEqual(Buffer.from([1]));
  const interrupted = expect(stream.next()).rejects.toThrow();
  await Promise.all([server.close(), server.close(), interrupted, released.promise]);
});

test('can close during startup and retry after a bind failure', async ({
  start,
  signal,
  expect,
}) => {
  const blocker = createServer({ publicAddress: loopback });
  const occupied = await start(blocker);
  const server = createServer({ publicAddress: loopback });
  await expect(server.listen(occupied)).rejects.toMatchObject({ code: 'EADDRINUSE' });

  const pending = start(server);
  const stopped = server.close();
  await Promise.all([pending, stopped]);

  server.text('', () => 'ready');
  const address = await start(server);
  await expect(server.listen(loopback)).rejects.toThrow(/already/);
  expect(await createClient(address).text('', { signal })).toBe('ready\n');
});

test('a failure after a binary chunk resets the transfer instead of appending a menu', async ({
  start,
  signal,
  expect,
}) => {
  const fail = Promise.withResolvers<void>();
  const server = createServer({ publicAddress: loopback });
  server.binary('/broken', async function* () {
    yield Buffer.from('first');
    await fail.promise;
    throw new Error('producer failed');
  });

  const client = createClient(await start(server));
  const stream = client.binary('/broken', { signal })[Symbol.asyncIterator]();
  expect((await stream.next()).value).toEqual(Buffer.from('first'));
  const interrupted = expect(stream.next()).rejects.toThrow();
  fail.resolve();
  await interrupted;
});

test('an unread binary transfer leaves other routes available and releases its producer on reset', async ({
  start,
  signal,
  expect,
}) => {
  const server = createServer({ publicAddress: loopback });
  const released = Promise.withResolvers<void>();
  const chunk = Buffer.alloc(64 * 1024);
  server.binary('/stream', async function* ({ signal: requestSignal }) {
    try {
      while (!requestSignal.aborted) yield chunk;
    } finally {
      released.resolve();
    }
  });
  server.text('/ready', () => 'ready');

  const address = await start(server);
  const slowReader = createConnection({ ...address, signal });

  try {
    await once(slowReader, 'connect');
    slowReader.write('/stream\r\n');
    await once(slowReader, 'readable', { signal });
    expect(await createClient(address).text('/ready', { signal })).toBe('ready\n');
  } finally {
    slowReader.resetAndDestroy();
  }

  await released.promise;
});
