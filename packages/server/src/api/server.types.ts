import type { BuiltinItemType, GopherAddress, ItemCodec, ItemValue, Menu } from '@gopher-js/core';

import type { Route, RouteHandler, SearchContext } from './route.types.js';

export interface ServerOptions<Codec extends ItemCodec = never> {
  readonly publicAddress: GopherAddress;
  readonly types?: readonly Codec[];
}

type BinaryBody = Uint8Array | AsyncIterable<Uint8Array>;

export interface GopherServer<Codec extends ItemCodec = never> {
  text(selector: string, handler: RouteHandler<string>): Route<BuiltinItemType<'text'>>;
  menu(selector: string, handler: RouteHandler<Menu>): Route<BuiltinItemType<'menu'>>;
  search(
    selector: string,
    handler: RouteHandler<Menu, SearchContext>,
  ): Route<BuiltinItemType<'search'>>;
  binary(selector: string, handler: RouteHandler<BinaryBody>): Route<BuiltinItemType<'binary'>>;

  item<Selected extends Codec>(
    codec: Selected,
    selector: string,
    handler: RouteHandler<NoInfer<ItemValue<Selected>>>,
  ): Route<Selected['type']>;

  listen(address: GopherAddress): Promise<void>;
  close(): Promise<void>;
}
