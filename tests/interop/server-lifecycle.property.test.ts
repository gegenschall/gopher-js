import { createClient } from '@gopher-js/client';
import { collectBinary } from '@gopher-js/core';
import { createServer } from '@gopher-js/server';
import fc from 'fast-check';
import { test } from 'vitest';

import { loopback } from './fixtures/server.js';

const payload = fc.uint8Array({ minLength: 1, maxLength: 2048 });
const shutdownAction = fc.constantFrom('drain', 'close', 'cancel');

test('binary transfers drain completely or report interruption at a known milestone', async ({
  expect,
  signal,
}) => {
  await fc.assert(
    fc.asyncProperty(
      payload,
      payload,
      fc.boolean(),
      shutdownAction,
      async (prefix, suffix, afterFirstRead, action) => {
        signal.throwIfAborted();
        const server = createServer({ publicAddress: loopback });
        const entered = Promise.withResolvers<void>();
        const prefixRead = Promise.withResolvers<void>();
        const release = Promise.withResolvers<void>();
        const released = Promise.withResolvers<void>();

        server.binary('/file', async function* (request) {
          entered.resolve();
          request.signal.addEventListener('abort', () => release.resolve(), { once: true });
          try {
            yield prefix;
            await release.promise;
            request.signal.throwIfAborted();
            yield suffix;
          } finally {
            released.resolve();
          }
        });

        const controller = new AbortController();
        const requestSignal = AbortSignal.any([signal, controller.signal]);
        try {
          const client = createClient(await server.listen(loopback));
          const read = async () => {
            const chunks = [];
            for await (const chunk of client.binary('/file', { signal: requestSignal })) {
              chunks.push(chunk);
              prefixRead.resolve();
            }
            return Buffer.concat(chunks);
          };
          const result = read();
          const milestone = afterFirstRead ? prefixRead : entered;
          await Promise.race([
            milestone.promise,
            result.then(() => {
              throw new Error('Transfer ended before milestone');
            }),
          ]);

          if (action === 'drain') {
            const closing = server.close({ gracePeriodMs: 3000 });
            release.resolve();
            expect(await result).toEqual(Buffer.concat([prefix, suffix]));
            await closing;
          } else {
            const interrupted = expect(result).rejects.toThrow();
            if (action === 'cancel') controller.abort();
            else await server.close();
            await interrupted;
          }

          await released.promise;
          await server.close();
          const restarted = createClient(await server.listen(loopback));
          const bytes = await collectBinary(restarted.binary('/file', { signal }));
          expect(bytes).toEqual(Buffer.concat([prefix, suffix]));
        } finally {
          release.resolve();
          controller.abort();
          await server.close();
        }
      },
    ),
  );
}, 30_000);
