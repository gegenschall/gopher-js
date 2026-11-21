import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

import { createWire } from '@gopher-js/core';
import { createServer, info } from '@gopher-js/server';

import { collectMemory, trackRequests } from './retention.ts';

const memoryTest = process.argv.includes('--memory');
const tracker = memoryTest ? trackRequests() : undefined;
const loopback = { host: '127.0.0.1', port: 0 };
let errors = 0;
let producers = 0;
const server = createServer({
  publicAddress: loopback,
  wire: createWire({ charset: 'utf-8' }),
  onError: () => {
    errors++;
  },
});

server.text('/text', ({ signal }) => {
  tracker?.signal(signal);
  return '.gopher\nhello';
});
server.menu('', ({ signal }) => {
  tracker?.signal(signal);
  return [info('browse')];
});
server.search('/find', ({ query, signal }) => {
  tracker?.signal(signal);
  return [info(query)];
});

const chunk = Buffer.alloc(16 * 1024);
for (let i = 0; i < chunk.length; i++) chunk[i] = i & 255;
server.binary('/file', async function* ({ signal }) {
  tracker?.signal(signal);
  producers++;
  try {
    for (let i = 0; i < 4; i++) yield chunk;
  } finally {
    producers--;
  }
});

if (memoryTest) {
  server.binary('/cancel', async function* ({ signal }) {
    tracker?.signal(signal);
    producers++;
    try {
      const cancelled = once(signal, 'abort');
      yield Uint8Array.of(1);
      await cancelled;
    } finally {
      producers--;
    }
  });
}

const tcpResources = () =>
  process
    .getActiveResourcesInfo()
    .filter((name) => /tcp/i.test(name))
    .toSorted();
const start = performance.now();
const { port } = await server.listen(loopback);
const idle = tcpResources();
let peakRss = process.memoryUsage.rss();
const monitor = setInterval(() => {
  peakRss = Math.max(peakRss, process.memoryUsage.rss());
}, 50);

try {
  if (memoryTest) console.log({ phase: 'before traffic', ...(await collectMemory()) });
  const measuredBatches = memoryTest ? 24 : process.argv.includes('--extended') ? 12 : 4;
  for (let i = 0; i <= measuredBatches; i++) {
    const batch = i === 0 ? 'warmup' : String(i);
    const client = fork(
      new URL('./client.ts', import.meta.url),
      [String(port), batch, ...(memoryTest ? ['--memory'] : [])],
      {
        timeout: memoryTest ? 120_000 : 30_000,
      },
    );
    const [code, signal] = await once(client, 'exit');
    assert.equal(code, 0, 'Client batch ' + batch + ' failed (signal ' + signal + ')');

    await delay(150);
    assert.deepEqual(tcpResources(), idle);
    assert.equal(producers, 0);
    assert.equal(errors, 0);
    if (tracker) {
      await tracker.check(i === 0 ? 120 : 1800);
      console.log({ batch, ...(await collectMemory()) });
      continue;
    }

    globalThis.gc?.();
    const { rss, heapUsed } = process.memoryUsage();
    console.log({
      batch,
      serverRssMiB: rss / 2 ** 20,
      serverHeapMiB: heapUsed / 2 ** 20,
      serverTcpResources: idle,
      producers,
      errors,
    });
  }
} finally {
  clearInterval(monitor);
  tracker?.stop();
  await server.close();

  if (memoryTest) {
    await delay(1000);
    assert.deepEqual(tcpResources(), []);
    console.log({ phase: 'after close', ...(await collectMemory()) });
  }
}

console.log({
  sampledPeakRssMiB: peakRss / 2 ** 20,
  elapsedSeconds: (performance.now() - start) / 1000,
});
