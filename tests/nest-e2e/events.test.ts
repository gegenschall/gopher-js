import { Socket } from 'node:net';

import type { GopherServerEvents } from '@gopher-js/nest-gopher';

import { connect, createTransport, test } from './fixtures/app.js';

test('forwards native TCP events through Nest and supports removing a listener', async ({
  createApp,
  signal,
  expect,
}) => {
  const strategy = createTransport();
  const app = await createApp(strategy);
  const events: string[] = [];

  app.on<GopherServerEvents, 'listening'>('listening', () => {
    expect(strategy.address?.port).toBeGreaterThan(0);
    events.push('listening');
  });
  app.on<GopherServerEvents, 'close'>('close', () => {
    expect(strategy.address).toBeUndefined();
    events.push('close');
  });
  await app.listen();

  const unsubscribe = strategy.on('connection', (socket) => {
    expect(socket).toBeInstanceOf(Socket);
    events.push('connection');
  });
  const client = connect(strategy);
  await client.menu('', { signal });
  unsubscribe();
  await client.menu('', { signal });
  await app.close();

  expect(events).toEqual(['listening', 'connection', 'close']);
});

test('emits the bind error and rejects startup when the port is occupied', async ({
  createApp,
  running,
  expect,
}) => {
  const address = running.strategy.address;
  if (!address) throw new Error('Expected the occupied port to be bound.');

  const app = await createApp(createTransport({ listen: address }));
  const errors: Error[] = [];
  app.on<GopherServerEvents, 'error'>('error', (error) => errors.push(error));

  await expect(app.listen()).rejects.toMatchObject({ code: 'EADDRINUSE' });
  expect(errors).toEqual([expect.objectContaining({ code: 'EADDRINUSE' })]);
});
