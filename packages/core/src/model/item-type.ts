import type { ItemIdentity } from './item-type.types.js';

export const itemTypes = Object.freeze({
  text: '0',
  menu: '1',
  error: '3',
  search: '7',
  binary: '9',
  info: 'i',
} as const satisfies Record<string, ItemIdentity['type']>);
