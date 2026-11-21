import type { BuiltinItemType, BuiltinKind, ItemIdentity } from './item-type.types.js';
import type { GopherTarget } from './target.types.js';

export interface MenuEntry<Type extends string = string> {
  readonly type: Type;
  readonly label: string;
  readonly target: GopherTarget;
}

export type MenuItem<Kind extends string, Type extends string> = ItemIdentity<Kind, Type> &
  MenuEntry<Type>;

export type BuiltinMenuItem<Kind extends BuiltinKind = BuiltinKind> = {
  [K in Kind]: MenuItem<K, BuiltinItemType<K>>;
}[Kind];

export interface InfoLine {
  readonly type: BuiltinItemType<'info'>;
  readonly label: string;
}

export type MenuLine = MenuEntry | InfoLine;

export type Menu<Line extends MenuLine = MenuLine> = readonly Line[];
