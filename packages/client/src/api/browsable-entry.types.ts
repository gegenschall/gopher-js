import type { Menu, BuiltinMenuItem, ItemCodec, ItemValue, MenuItem } from '@gopher-js/core';

import type { RequestOptions } from './request.types.js';

interface Readable<Result> {
  read(options?: RequestOptions): Result;
}

export type CustomEntry<Codec extends ItemCodec> = Codec extends ItemCodec
  ? MenuItem<Codec['kind'], Codec['type']> & Readable<Promise<ItemValue<Codec>>>
  : never;

export type BrowsableMenu<Codec extends ItemCodec = never> = Menu<BrowsableEntry<Codec>>;

export type BrowsableEntry<Codec extends ItemCodec = never> =
  | (BuiltinMenuItem<'text'> & Readable<Promise<string>>)
  | (BuiltinMenuItem<'menu'> & Readable<Promise<BrowsableMenu<Codec>>>)
  | (BuiltinMenuItem<'binary'> & Readable<AsyncIterable<Uint8Array>>)
  | (BuiltinMenuItem<'search'> & {
      search(query: string, options?: RequestOptions): Promise<BrowsableMenu<Codec>>;
    })
  | BuiltinMenuItem<'info' | 'error'>
  | (MenuItem<'unknown', string> & {
      raw(options?: RequestOptions): AsyncIterable<Uint8Array>;
    })
  | CustomEntry<Codec>;
