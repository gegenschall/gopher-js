import { createClient, type BrowsableEntry, type BrowsableMenu } from '@gopher-js/client';
import {
  createWire,
  defineItemType,
  type BuiltinMenuItem,
  type BuiltinItemType,
  type Menu,
  type MenuEntry,
  type MenuRecord,
} from '@gopher-js/core';
import { createServer, info } from '@gopher-js/server';
import { expectTypeOf } from 'vitest';

const counter = defineItemType({
  type: 'x',
  kind: 'counter',
  framing: 'text',
  decode: (text) => BigInt(text.trim()),
  encode: (value) => value.toString(),
});

const packet = defineItemType({
  type: 'p',
  kind: 'packet',
  framing: 'binary',
  decode: (bytes) => Array.from(bytes),
  encode: (values) => Uint8Array.from(values),
});

expectTypeOf<BuiltinItemType<'menu'>>().toEqualTypeOf<'1'>();
expectTypeOf<Extract<BuiltinMenuItem, { kind: 'text' }>['type']>().toEqualTypeOf<'0'>();
expectTypeOf<Extract<BrowsableEntry, { kind: 'menu' }>>().toExtend<MenuRecord<'1'>>();
expectTypeOf<BuiltinMenuItem<'menu'>>().not.toHaveProperty('read');

type Extensions = typeof counter | typeof packet;

expectTypeOf<BrowsableEntry<Extensions>>().toExtend<MenuEntry>();
expectTypeOf<BrowsableMenu<Extensions>>().toExtend<Menu>();
expectTypeOf<MenuEntry>().not.toHaveProperty('read');

export const browse = (entry: BrowsableEntry<Extensions>) => {
  switch (entry.kind) {
    case 'text':
      expectTypeOf(entry.read()).toEqualTypeOf<Promise<string>>();
      break;
    case 'menu':
      expectTypeOf(entry.read()).toEqualTypeOf<Promise<BrowsableMenu<Extensions>>>();
      break;
    case 'search':
      expectTypeOf(entry.search('archive')).toEqualTypeOf<Promise<BrowsableMenu<Extensions>>>();
      // @ts-expect-error Search entries require a query.
      entry.search();
      break;
    case 'binary':
      expectTypeOf(entry.read()).toEqualTypeOf<AsyncIterable<Uint8Array>>();
      break;
    case 'counter':
      expectTypeOf(entry.type).toEqualTypeOf<'x'>();
      expectTypeOf(entry.read()).toEqualTypeOf<Promise<bigint>>();
      break;
    case 'packet':
      expectTypeOf(entry.read()).toEqualTypeOf<Promise<number[]>>();
      break;
    case 'info':
    case 'error':
      // @ts-expect-error Display entries have no fetch operation.
      entry.read();
      break;
    case 'unknown':
      expectTypeOf(entry.type).toEqualTypeOf<string>();
      expectTypeOf(entry.raw()).toEqualTypeOf<AsyncIterable<Uint8Array>>();
      break;
    default:
      expectTypeOf(entry).toBeNever();
  }
};

export const archive = () => {
  const client = createClient({
    host: 'localhost',
    types: [counter, packet],
  });
  const publicAddress = {
    host: 'localhost',
    port: 70,
  };
  const server = createServer({
    publicAddress,
    types: [counter, packet],
  });

  expectTypeOf(client.menu()).toEqualTypeOf<Promise<BrowsableMenu<Extensions>>>();
  expectTypeOf(createClient({ host: 'localhost' }).menu()).toEqualTypeOf<Promise<BrowsableMenu>>();
  expectTypeOf(counter.encode).parameter(0).toEqualTypeOf<bigint>();
  expectTypeOf(packet.decode).parameter(0).toEqualTypeOf<Uint8Array>();

  // A server can relay an upstream menu using the shared data contract.
  server.menu('/mirror', () => client.menu());

  const visits = server.item(counter, '/visits', async () => 42n);
  expectTypeOf(visits.link('Count')).toEqualTypeOf<MenuEntry<'x'>>();
  const find = server.search('/find', ({ query }) => [info(query)]);
  server.menu('', () => [visits.link('Visit count'), find.link('Search')]);
  expectTypeOf(visits.link('Count').type).toEqualTypeOf<'x'>();

  // @ts-expect-error The counter handler must produce a bigint.
  server.item(counter, '/bad', () => '42');
  // @ts-expect-error The codec must be registered on this server.
  createServer({ publicAddress }).item(counter, '/count', () => 42n);
  // @ts-expect-error Only search routes receive a query.
  server.text('/about', ({ query }) => query);
  defineItemType({
    type: 'z',
    kind: 'size',
    framing: 'text',
    decode: Number,
    // @ts-expect-error A text codec's encoder must produce text.
    encode: () => 42,
  });
};

// @ts-expect-error A charset preset must be supported.
createWire({ charset: 'utf-16' });
// @ts-expect-error A custom charset must also decode.
createWire({ charset: { encode: () => new Uint8Array() } });
// @ts-expect-error A menu writer must choose one way to end the response.
createWire({ menuFraming: { write: 'dot-or-eof' } });
// @ts-expect-error A custom framing strategy supplies both directions.
createWire({ textFraming: { read: async () => 'hello' } });
