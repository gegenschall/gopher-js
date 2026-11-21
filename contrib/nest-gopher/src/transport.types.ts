import type { GopherAddress, ItemCodec } from '@gopher-js/core';
import type { CloseOptions, ServerOptions } from '@gopher-js/server';
import type { Observable } from 'rxjs';

export interface GopherTransportOptions extends ServerOptions<ItemCodec> {
  readonly listen: GopherAddress;
  readonly close?: CloseOptions;
}

export type GopherMethodDecorator<Result> = <
  Method extends (...args: never[]) => Result | Promise<Result> | Observable<Result>,
>(
  target: object,
  key: string | symbol,
  descriptor: TypedPropertyDescriptor<Method>,
) => void;
