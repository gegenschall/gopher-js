import {
  collectBinary,
  itemTypes,
  type GopherTarget,
  type GopherWire,
  type ItemCodec,
  type MenuEntry,
} from '@gopher-js/core';

import { readResponse, streamBinary } from '../transport/request.js';
import type { BrowsableEntry, BrowsableMenu, CustomEntry } from './browsable-entry.types.js';
import type { RequestOptions } from './request.types.js';

export const createMenuBrowser = <Codec extends ItemCodec>(
  wire: GopherWire,
  types: readonly Codec[],
) => {
  const codecs = new Map(types.map((codec) => [codec.type, codec]));

  const text = (target: GopherTarget, options?: RequestOptions) =>
    readResponse(
      target,
      wire,
      { selector: target.selector },
      (source) => wire.parseText(source),
      options?.signal,
    );

  const binary = (target: GopherTarget, options?: RequestOptions) =>
    streamBinary(target, wire, options?.signal);

  const menu = async (
    target: GopherTarget,
    query?: string,
    options?: RequestOptions,
  ): Promise<BrowsableMenu<Codec>> => {
    const { selector } = target;
    const request = query === undefined ? { selector } : { selector, query };
    const entries = await readResponse(
      target,
      wire,
      request,
      (source) => wire.parseMenu(source),
      options?.signal,
    );

    return entries.map(browse);
  };

  const browse = (entry: MenuEntry): BrowsableEntry<Codec> => {
    const { target, type } = entry;

    switch (type) {
      case itemTypes.text:
        return {
          ...entry,
          type,
          kind: 'text',
          read: (options) => text(target, options),
        };
      case itemTypes.menu:
        return {
          ...entry,
          type,
          kind: 'menu',
          read: (options) => menu(target, undefined, options),
        };
      case itemTypes.search:
        return {
          ...entry,
          type,
          kind: 'search',
          search: (query, options) => menu(target, query, options),
        };
      case itemTypes.binary:
        return {
          ...entry,
          type,
          kind: 'binary',
          read: (options) => binary(target, options),
        };
      case itemTypes.info:
        return {
          ...entry,
          type,
          kind: 'info',
        };
      case itemTypes.error:
        return {
          ...entry,
          type,
          kind: 'error',
        };
    }

    const codec = codecs.get(type);
    if (!codec) {
      return {
        ...entry,
        kind: 'unknown',
        raw: (options) => binary(target, options),
      };
    }

    // Looking up the wire type selects the same codec for the kind and decoded value.
    return {
      ...entry,
      kind: codec.kind,
      read: async (options?: RequestOptions) =>
        codec.framing === 'text'
          ? codec.decode(await text(target, options))
          : codec.decode(await collectBinary(binary(target, options))),
    } as CustomEntry<Codec>;
  };

  return {
    text,
    menu,
    binary,
  };
};
