import { createClient } from '@gopher-js/client';
import { createWire } from '@gopher-js/core';
import { createServer, type ServerErrorEvent } from '@gopher-js/server';
import { vi } from 'vitest';

import { exchange, loopback, test } from './fixtures/server.js';

test('reports application failures once with the original cause and preserves the error menu', async ({
  start,
  signal,
  expect,
}) => {
  const handlerError = new Error('private handler detail');
  const encodingError = new Error('private encoder detail');
  const wire = {
    ...createWire(),
    encodeText: () => {
      throw encodingError;
    },
  };

  const onError = vi.fn((_event: ServerErrorEvent) => Promise.reject(new Error('logger failed')));
  const server = createServer({
    publicAddress: loopback,
    wire,
    onError,
  });
  server.text('/handler', () => Promise.reject(handlerError));
  server.text('/encoding', () => 'response');
  const address = await start(server);

  for (const request of ['bad\n', '/missing\r\n', '/handler\tx\r\n']) {
    await exchange(address, request, signal);
  }
  expect(onError).not.toHaveBeenCalled();

  for (const [selector, stage, cause] of [
    ['/handler', 'handler', handlerError],
    ['/encoding', 'response', encodingError],
  ] as const) {
    const bytes = await exchange(address, selector + '\r\n', signal);
    expect(bytes.toString()).toBe('3Handler failed\t\terror.host\t0\r\n.\r\n');
    expect(onError).toHaveBeenLastCalledWith({
      selector,
      stage,
      cause,
    });
    expect(onError.mock.lastCall?.[0].cause).toBe(cause);
  }
  expect(onError).toHaveBeenCalledTimes(2);
});

test('reports a streaming failure and resets the transfer while the hook is pending', async ({
  start,
  signal,
  expect,
}) => {
  const cause = new Error('producer failed');
  const fail = Promise.withResolvers<void>();
  const logged = Promise.withResolvers<void>();
  const onError = vi.fn((_event: ServerErrorEvent) => logged.promise);

  const server = createServer({ publicAddress: loopback, onError });
  server.binary('/stream', async function* () {
    yield Buffer.from('started');
    await fail.promise;
    throw cause;
  });
  const client = createClient(await start(server));
  const stream = client.binary('/stream', { signal })[Symbol.asyncIterator]();

  try {
    expect((await stream.next()).value).toEqual(Buffer.from('started'));
    const interrupted = expect(stream.next()).rejects.toThrow();
    fail.resolve();
    await interrupted;
    expect(onError).toHaveBeenCalledExactlyOnceWith({
      stage: 'response',
      selector: '/stream',
      cause,
    });
  } finally {
    logged.resolve();
  }
});
