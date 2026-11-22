import assert from 'node:assert/strict';

import { createClient } from '@gopher-js/client';
import { createWire, type GopherAddress } from '@gopher-js/core';
import { GopherTransport } from '@gopher-js/nest-gopher';
import { createServer } from '@gopher-js/server';

const loopback: GopherAddress = { host: '127.0.0.1', port: 0 };
const wire = createWire();
const server = createServer({ publicAddress: loopback, wire });
const about = server.text('/about', () => 'Hello from port zero.');
server.menu('', () => [about.link('About')]);
assert.equal(typeof GopherTransport, 'function');

try {
  const address = await server.listen(loopback);
  const client = createClient(address);
  const signal = AbortSignal.timeout(5_000);
  const [entry] = await client.menu('', { signal });
  assert.equal(entry?.kind, 'text');
  assert.ok(entry?.kind === 'text');
  assert.equal(await entry.read({ signal }), 'Hello from port zero.\n');
} finally {
  await server.close();
}
