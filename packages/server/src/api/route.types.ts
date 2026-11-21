import type { MenuEntry } from '@gopher-js/core';

export interface RequestContext {
  readonly selector: string;
  readonly signal: AbortSignal;
}

export interface SearchContext extends RequestContext {
  readonly query: string;
}

export type RouteHandler<Result, Context extends RequestContext = RequestContext> = (
  request: Context,
) => Result | Promise<Result>;

export interface Route<Type extends string = string> {
  readonly selector: string;
  readonly type: Type;
  link(label: string): MenuEntry<Type>;
}
