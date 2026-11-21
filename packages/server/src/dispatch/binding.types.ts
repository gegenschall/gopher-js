import type { RouteHandler, SearchContext } from '../api/route.types.js';

export type ResponseBody = Uint8Array | AsyncIterable<Uint8Array>;

export type Binding =
  | { read: RouteHandler<ResponseBody> }
  | { search: RouteHandler<ResponseBody, SearchContext> };
