import type {
  GopherWire,
  BuiltinItemType,
  GopherAddress,
  ItemCodec,
  ItemValue,
  Menu,
} from '@gopher-js/core';

import type { Route, RouteHandler, SearchContext } from './route.types.js';

export interface ServerErrorEvent {
  readonly stage: 'handler' | 'response';
  readonly selector: string;
  readonly cause: unknown;
}

export interface ServerOptions<Codec extends ItemCodec = never> {
  readonly publicAddress: GopherAddress;
  readonly types?: readonly Codec[];
  readonly wire?: GopherWire;

  readonly maxRequestBytes?: number;
  readonly requestTimeoutMs?: number;

  readonly onError?: (event: ServerErrorEvent) => void | Promise<void>;
}

export interface CloseOptions {
  readonly gracePeriodMs?: number;
}

type BinaryBody = Uint8Array | AsyncIterable<Uint8Array>;

export interface GopherServer<Codec extends ItemCodec = never> {
  readonly wire: GopherWire;

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

  listen(address: GopherAddress): Promise<GopherAddress>;
  close(options?: CloseOptions): Promise<void>;
}
