import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createConnection } from 'node:net';
import { buffer } from 'node:stream/consumers';
import { setTimeout as delay } from 'node:timers/promises';

import { createClient } from '@gopher-js/client';

const port = Number(process.argv[2]);
const rounds = process.argv[3] === 'warmup' ? 10 : 150;
const concurrency = 12;
const binary = Buffer.alloc(64 * 1024);
for (let i = 0; i < binary.length; i++) binary[i] = i % 256;

const client = createClient({ host: '127.0.0.1', port });
const memoryTest = process.argv.includes('--memory');

const verify = async (index: number) => {
  if (memoryTest && index % concurrency === concurrency - 1) {
    const start = performance.now();
    for await (const chunk of client.binary('/cancel', { signal: AbortSignal.timeout(3000) })) {
      assert.deepEqual(Buffer.from(chunk), Buffer.from([1]));
      return performance.now() - start;
    }
    throw new Error('Cancellation route closed before sending its first byte.');
  }

  const query = 'café 雪 ' + index;
  const cases = [
    { line: '/text', expected: Buffer.from('..gopher\r\nhello\r\n.\r\n') },
    { line: '', expected: Buffer.from('ibrowse\t\tfake\t0\r\n.\r\n') },
    { line: '/find\t' + query, expected: Buffer.from('i' + query + '\t\tfake\t0\r\n.\r\n') },
    { line: '/file', expected: binary },
  ];
  const { line, expected } = cases[index % cases.length]!;
  const start = performance.now();
  const socket = createConnection({
    host: '127.0.0.1',
    port,
    signal: AbortSignal.timeout(3_000),
  });

  try {
    await once(socket, 'connect');
    socket.end(line + '\r\n');
    assert.deepEqual(await buffer(socket), expected);
    return performance.now() - start;
  } finally {
    socket.destroy();
  }
};

const times: number[] = [];
for (let round = 0; round < rounds; round++) {
  const wave = Array.from({ length: concurrency }, (_, i) => verify(round * concurrency + i));
  times.push(...(await Promise.all(wave)));
  await delay(55);
}

times.sort((a, b) => a - b);
console.log({ verified: times.length, p95Ms: times[Math.ceil(times.length * 0.95) - 1] });
