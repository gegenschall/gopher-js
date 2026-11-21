import 'reflect-metadata';
import { createClient } from '@gopher-js/client';
import { createWire } from '@gopher-js/core';
import { GopherTransport, type GopherTransportOptions } from '@gopher-js/nest-gopher';
import type { INestApplicationContext, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { test as base } from 'vitest';

import { ArchiveModule } from './archive/archive.module.js';
import { counter } from './counter.codec.js';

export const loopback = { host: '127.0.0.1', port: 0 };
const wire = createWire({ charset: 'utf-8' });

export const createTransport = (options: Partial<GopherTransportOptions> = {}) =>
  new GopherTransport({
    listen: loopback,
    publicAddress: loopback,
    types: [counter],
    wire,
    ...options,
  });

export const connect = (strategy: GopherTransport) => {
  if (!strategy.address) throw new Error('Expected the bound Gopher address.');
  return createClient({
    ...strategy.address,
    wire,
    types: [counter],
  });
};

export const test = base
  .extend('track', ({ signal }, { onCleanup }) => {
    const apps: INestApplicationContext[] = [];

    onCleanup(async () => {
      for (const app of apps) await app.close();
    });

    return <T extends INestApplicationContext>(app: T) => {
      apps.push(app);
      signal.throwIfAborted();
      return app;
    };
  })
  .extend(
    'createApp',
    ({ track }) =>
      async (strategy: GopherTransport, module: Type = ArchiveModule) =>
        track(
          await NestFactory.createMicroservice(module, {
            strategy,
            logger: false,
            abortOnError: false,
          }),
        ),
  )
  .extend('running', async ({ createApp }) => {
    const strategy = createTransport();
    const app = await createApp(strategy);
    await app.listen();

    return {
      app,
      strategy,
      client: connect(strategy),
    };
  })
  .extend('client', ({ running }) => running.client);
