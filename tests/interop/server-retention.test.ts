import { createClient } from '@gopher-js/client';
import { createServer } from '@gopher-js/server';

import { loopback, test } from './fixtures/server.js';
import { trackRequests } from './soak/retention.js';

test.for(['complete', 'reset', 'shutdown'] as const)(
  'a retained signal releases the socket after %s',
  async (outcome, { expect, signal, start }) => {
    const tracker = trackRequests();
    const held = Promise.withResolvers<AbortSignal>();
    const cancelled = Promise.withResolvers<void>();

    const server = createServer({ publicAddress: loopback });
    server.text('/text', async (request) => {
      tracker.signal(request.signal);
      request.signal.addEventListener('abort', () => cancelled.resolve(), { once: true });
      held.resolve(request.signal);

      if (outcome !== 'complete') await cancelled.promise;
      return 'done';
    });

    try {
      const controller = new AbortController();
      const client = createClient(await start(server));
      const response = client.text('/text', {
        signal: AbortSignal.any([signal, controller.signal]),
      });
      const requestSignal = await held.promise;

      if (outcome === 'complete') {
        expect(await response).toBe('done\n');
      } else {
        const interrupted = expect(response).rejects.toThrow();
        if (outcome === 'shutdown') await server.close();
        else controller.abort();
        await interrupted;
      }

      await cancelled.promise;
      await server.close();
      await tracker.check(1, { retainedSignals: 1 });
      expect(requestSignal.aborted).toBe(true);
      if (outcome === 'reset') expect(requestSignal.reason).toMatchObject({ code: 'ECONNRESET' });
      else expect(requestSignal.reason).toMatchObject({ name: 'AbortError' });
    } finally {
      tracker.stop();
    }
  },
);
