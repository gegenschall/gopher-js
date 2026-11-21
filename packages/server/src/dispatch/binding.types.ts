import type { RouteHandler, SearchContext } from '../api/route.types.js';

export type ResponseBody = Uint8Array | AsyncIterable<Uint8Array>;

/** Encoded routes defer serialization until the transport enters the response stage. */
export type RouteResult = ResponseBody | (() => Uint8Array);

export type Binding =
  | { read: RouteHandler<RouteResult> }
  | { search: RouteHandler<RouteResult, SearchContext> };
