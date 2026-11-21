import type { itemTypes } from './item-type.js';

export interface ItemIdentity<Kind extends string = string, Type extends string = string> {
  readonly kind: Kind;
  readonly type: Type;
}

export type BuiltinKind = keyof typeof itemTypes;
export type BuiltinItemType<Kind extends BuiltinKind = BuiltinKind> = (typeof itemTypes)[Kind];
