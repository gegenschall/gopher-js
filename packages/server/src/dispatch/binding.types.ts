import type { BuiltinItemType, ItemCodec } from '@gopher-js/core';

import type { RouteHandler } from '../api/route.types.js';
import type { GopherServer } from '../api/server.types.js';

type RoutedKind = 'text' | 'menu' | 'search' | 'binary';

type BuiltinBinding = {
  [Kind in RoutedKind]: {
    type: BuiltinItemType<Kind>;
    handler: Parameters<GopherServer[Kind]>[1];
  };
}[RoutedKind];

export type Binding =
  | BuiltinBinding
  | {
      type: string;
      codec: ItemCodec;
      handler: RouteHandler<unknown>;
    };
