export { defineItemType } from './codecs/item-codec.js';
export { itemTypes } from './model/item-type.js';
export { createMenuEntry } from './model/menu.js';
export { validateItemTypes } from './codecs/registry.js';

export type { ItemCodec, ItemValue } from './codecs/item-codec.types.js';
export type { BuiltinKind, BuiltinItemType, ItemIdentity } from './model/item-type.types.js';
export type {
  BuiltinMenuItem,
  InfoLine,
  Menu,
  MenuEntry,
  MenuEntry as MenuRecord,
  MenuItem,
  MenuLine,
} from './model/menu.types.js';
export type { GopherAddress, GopherTarget } from './model/target.types.js';
