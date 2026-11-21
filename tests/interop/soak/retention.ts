import assert from 'node:assert/strict';
import { channel } from 'node:diagnostics_channel';
import { Socket } from 'node:net';
import { setImmediate } from 'node:timers/promises';

export const collectMemory = async () => {
  assert(globalThis.gc, 'Run the retention check with --expose-gc.');
  for (let i = 0; i < 3; i++) {
    await setImmediate();
    globalThis.gc();
  }

  const { heapUsed, heapTotal, external, arrayBuffers, rss } = process.memoryUsage();
  return {
    heapMiB: heapUsed / 2 ** 20,
    heapTotalMiB: heapTotal / 2 ** 20,
    externalMiB: external / 2 ** 20,
    arrayBufferMiB: arrayBuffers / 2 ** 20,
    rssMiB: rss / 2 ** 20,
  };
};

export const trackRequests = () => {
  const sockets: WeakRef<Socket>[] = [];
  const signals: WeakRef<AbortSignal>[] = [];

  const accepted = channel('net.server.socket');
  const observe = (event: unknown) => {
    if (
      typeof event === 'object' &&
      event !== null &&
      'socket' in event &&
      event.socket instanceof Socket
    ) {
      sockets.push(new WeakRef(event.socket));
    }
  };
  accepted.subscribe(observe);

  return {
    signal: (signal: AbortSignal) => signals.push(new WeakRef(signal)),
    async check(expected: number, { retainedSignals = 0 } = {}) {
      assert.equal(sockets.length, expected, 'Accepted socket count');
      assert.equal(signals.length, expected, 'Dispatched request count');
      await collectMemory();

      const liveSockets = sockets.filter((ref) => ref.deref() !== undefined).length;
      const liveSignals = signals.filter((ref) => ref.deref() !== undefined).length;
      assert.equal(liveSockets, 0, 'Closed server sockets retained after GC');
      assert.equal(
        liveSignals,
        retainedSignals,
        'Unexpected number of retained request signals after GC',
      );
      sockets.length = 0;
      signals.length = 0;
    },
    stop: () => accepted.unsubscribe(observe),
  };
};
