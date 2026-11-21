import 'reflect-metadata';
import { once } from 'node:events';
import { Socket } from 'node:net';

import { createClient } from '@gopher-js/client';
import { createWire, defineItemType, type Menu } from '@gopher-js/core';
import {
  GopherBinary,
  GopherItem,
  GopherMenu,
  GopherSearch,
  GopherText,
  GopherTransport,
  type GopherServerEvents,
  type RequestContext,
  type SearchContext,
} from '@gopher-js/nest-gopher';
import { info } from '@gopher-js/server';
import {
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  UseGuards,
  UseInterceptors,
  type CallHandler,
  type ExecutionContext,
  type INestApplicationContext,
  type Type,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Ctx, MessagePattern, Payload } from '@nestjs/microservices';
import { map, Observable } from 'rxjs';
import { test as base } from 'vitest';

const loopback = { host: '127.0.0.1', port: 0 };
const wire = createWire({ charset: 'utf-8' });
const counter = defineItemType({
  type: 'x',
  kind: 'counter',
  framing: 'text',
  decode: BigInt,
  encode: (count) => count.toString(),
});

@Injectable()
class Archive {
  readonly released = Promise.withResolvers<void>();
  readonly subscribed = Promise.withResolvers<void>();
  readonly unsubscribed = Promise.withResolvers<void>();

  about() {
    return 'archive';
  }
}

@Controller()
class ArchiveController {
  @Inject(Archive) private readonly archive!: Archive;

  @GopherText('archive:%2F')
  @UseInterceptors({
    intercept: (_context: ExecutionContext, next: CallHandler<string>) =>
      next.handle().pipe(map((value) => value.toUpperCase())),
  })
  about(@Ctx() context: RequestContext) {
    return this.archive.about() + ' ' + context.selector;
  }

  @GopherMenu('')
  home(): Menu {
    return [info('Welcome')];
  }

  @GopherSearch('/find')
  search(
    @Payload('query', { transform: (query: string) => query.trim() }) query: string,
    @Ctx() context: SearchContext,
  ): Menu {
    return [info(query), info(context.query)];
  }

  @GopherItem(counter, '/count')
  count() {
    return 42n;
  }

  @GopherText('/private')
  @UseGuards({ canActivate: () => false })
  privateText() {
    return 'private';
  }

  @GopherBinary('/file')
  async *file(@Ctx() { signal }: RequestContext) {
    const cancelled = once(signal, 'abort');
    try {
      yield Uint8Array.of(0, 255);
      await cancelled;
    } finally {
      this.archive.released.resolve();
    }
  }

  @GopherText('/pending')
  pending() {
    return new Observable<string>(() => {
      this.archive.subscribed.resolve();
      return () => this.archive.unsubscribed.resolve();
    });
  }

  @MessagePattern('/foreign')
  foreign() {
    return 'foreign';
  }

  @Get('/health')
  health() {
    return this.archive.about();
  }
}

@Module({ controllers: [ArchiveController], providers: [Archive] })
// oxlint-disable-next-line typescript/no-extraneous-class -- Nest reads the module decorator.
class ArchiveModule {}

const test = base.extend('track', ({ signal }, { onCleanup }) => {
  const apps: INestApplicationContext[] = [];
  onCleanup(async () => {
    for (const app of apps) await app.close();
  });
  return <T extends INestApplicationContext>(app: T) => {
    apps.push(app);
    signal.throwIfAborted();
    return app;
  };
});

const transport = () =>
  new GopherTransport({
    listen: loopback,
    publicAddress: loopback,
    types: [counter],
    wire,
  });

const start = async (strategy: GopherTransport, module: Type = ArchiveModule) =>
  NestFactory.createMicroservice(module, {
    strategy,
    logger: false,
    abortOnError: false,
  });

const connect = (strategy: GopherTransport) => {
  if (!strategy.address) throw new Error('Expected the bound Gopher address.');
  return createClient({
    ...strategy.address,
    wire,
    types: [counter],
  });
};

test('dispatches opaque selectors through Nest DI, pipes, interceptors, and guards', async ({
  track,
  signal,
  expect,
}) => {
  const strategy = transport();
  const app = track(await start(strategy));
  await app.listen();
  const client = connect(strategy);

  expect(await client.text('archive:%2F', { signal })).toBe('ARCHIVE ARCHIVE:%2F\n');
  expect((await client.menu('', { signal }))[0]?.label).toBe('Welcome');
  expect((await client.search('/find', ' 雪 ', { signal })).map((line) => line.label)).toEqual([
    '雪',
    ' 雪 ',
  ]);
  expect(await client.text('/count', { signal })).toBe('42\n');
  expect((await client.menu('/private', { signal }))[0]).toMatchObject({
    kind: 'error',
    label: 'Handler failed',
  });
  expect((await client.menu('/foreign', { signal }))[0]?.label).toBe('Selector not found');
});

test('forwards native TCP events through Nest and supports removing a listener', async ({
  track,
  signal,
  expect,
}) => {
  const strategy = transport();
  const app = track(await start(strategy));
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

test('delivers the first binary bytes before EOF and releases the producer on disconnect', async ({
  track,
  signal,
  expect,
}) => {
  const strategy = transport();
  const app = track(await start(strategy));
  await app.listen();
  const archive = app.get(Archive);
  for await (const chunk of connect(strategy).binary('/file', { signal })) {
    expect(chunk).toEqual(Buffer.from([0, 255]));
    break;
  }
  await archive.released.promise;
});

test('unsubscribes a pending Observable when the Nest app closes', async ({
  track,
  signal,
  expect,
}) => {
  const strategy = transport();
  const app = track(await start(strategy));
  await app.listen();
  const archive = app.get(Archive);
  const lost = expect(connect(strategy).text('/pending', { signal })).rejects.toThrow();
  await archive.subscribed.promise;
  await app.close();
  await Promise.all([lost, archive.unsubscribed.promise]);
  expect(strategy.address).toBeUndefined();
});

test('serves HTTP and Gopher on separate ports in a hybrid app', async ({
  track,
  signal,
  expect,
}) => {
  const app = track(
    await NestFactory.create(ArchiveModule, { logger: false, abortOnError: false }),
  );
  const strategy = transport();
  app.connectMicroservice({ strategy });
  await app.startAllMicroservices();
  await app.listen(0, loopback.host);

  const response = await fetch((await app.getUrl()) + '/health', { signal });
  expect(await response.text()).toBe('archive');
  expect((await connect(strategy).menu('', { signal }))[0]?.label).toBe('Welcome');
});

test('rejects custom routes whose codec is missing from the transport', async ({
  track,
  expect,
}) => {
  const strategy = new GopherTransport({ listen: loopback, publicAddress: loopback });
  const app = track(await start(strategy));

  await expect(app.listen()).rejects.toThrow('The item type "counter" is not registered');
  expect(strategy.address).toBeUndefined();
});

test('rejects duplicate selectors and propagates bind errors to Nest', async ({
  track,
  expect,
}) => {
  @Controller()
  class Duplicate {
    @GopherText('') first() {
      return 'first';
    }

    @GopherBinary('') second() {
      return Uint8Array.of(1);
    }
  }

  @Module({ controllers: [Duplicate] })
  // oxlint-disable-next-line typescript/no-extraneous-class -- Nest reads the module decorator.
  class DuplicateModule {}
  const duplicate = track(await start(transport(), DuplicateModule));
  await expect(duplicate.listen()).rejects.toThrow(/already exists/);

  const occupied = transport();
  await track(await start(occupied)).listen();
  if (!occupied.address) throw new Error('Missing bound address.');
  const conflict = new GopherTransport({
    publicAddress: loopback,
    listen: occupied.address,
    types: [counter],
  });
  const errors: Error[] = [];
  const app = track(await start(conflict));
  app.on<GopherServerEvents, 'error'>('error', (error) => errors.push(error));

  await expect(app.listen()).rejects.toMatchObject({ code: 'EADDRINUSE' });
  expect(errors).toEqual([expect.objectContaining({ code: 'EADDRINUSE' })]);
});
