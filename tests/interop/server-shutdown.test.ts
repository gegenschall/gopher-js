import { once } from 'node:events';
import { createConnection } from 'node:net';

import { createClient } from '@gopher-js/client';
import { createServer } from '@gopher-js/server';
import { vi } from 'vitest';

import { loopback, test } from './fixtures/server.js';

test('drains active work, closes partial requests, and refuses new connections', async ({
  start,
  signal,
  expect,
}) => {
  const release = Promise.withResolvers<void>();
  const server = createServer({ publicAddress: loopback });
  server.binary('/file', async function* () {
    yield Buffer.from('first');
    await release.promise;
    yield Buffer.from('last');
  });

  const address = await start(server);
  const client = createClient(address);
  const idle = createConnection({ ...address, signal });
  try {
    await once(idle, 'connect');
    idle.write('/incomplete');
    const stream = client.binary('/file', { signal })[Symbol.asyncIterator]();
    expect((await stream.next()).value).toEqual(Buffer.from('first'));

    const idleClosed = new Promise<void>((resolve) => idle.once('close', () => resolve()));
    idle.on('error', () => {});
    const closing = server.close({ gracePeriodMs: 60_000 });
    const joined = server.close();

    await idleClosed;
    await expect(client.text('/file', { signal })).rejects.toMatchObject({ code: 'ECONNREFUSED' });

    release.resolve();
    expect((await stream.next()).value).toEqual(Buffer.from('last'));
    expect((await stream.next()).done).toBe(true);
    await Promise.all([closing, joined]);

    const restarted = await start(server);
    expect(restarted.port).toBeGreaterThan(0);
  } finally {
    release.resolve();
    idle.destroy();
  }
});

test('at the grace deadline aborts active handlers and closes even if they ignore cancellation', async ({
  start,
  signal,
  expect,
}) => {
  const entered = Promise.withResolvers<AbortSignal>();
  const release = Promise.withResolvers<string>();
  const onError = vi.fn();
  const server = createServer({ publicAddress: loopback, onError });
  server.text('', (request) => {
    entered.resolve(request.signal);
    return release.promise;
  });

  const client = createClient(await start(server));
  const read = expect(client.text('', { signal })).rejects.toThrow();
  const requestSignal = await entered.promise;

  try {
    const closing = server.close({ gracePeriodMs: 60 });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(requestSignal.aborted).toBe(false);
    await Promise.all([closing, read]);
    expect(requestSignal.aborted).toBe(true);
    expect(onError).not.toHaveBeenCalled();
  } finally {
    release.resolve('finished');
  }
});

test('rejects invalid grace periods without closing the listener', async ({
  start,
  signal,
  expect,
}) => {
  const server = createServer({ publicAddress: loopback });
  server.text('', () => 'ok');
  const client = createClient(await start(server));

  for (const gracePeriodMs of [-1, 0.5, 2 ** 31, Infinity]) {
    await expect(server.close({ gracePeriodMs })).rejects.toThrow(RangeError);
  }
  expect(await client.text('', { signal })).toBe('ok\n');
});
