import { itemTypes } from '../model/item-type.js';
import type { ItemCodec } from './item-codec.types.js';

/** Check an instance's extensions before serving or reading menu entries. */
export const validateItemTypes = (types: readonly ItemCodec[]): void => {
  const wireTypes = new Set<string>(Object.values(itemTypes));
  const kinds = new Set([...Object.keys(itemTypes), 'unknown']);

  for (const { type, kind } of types) {
    if (!/^[!-~]$/.test(type)) {
      throw new TypeError('An item type must be one printable ASCII character.');
    }

    if (!kind.trim() || wireTypes.has(type) || kinds.has(kind)) {
      throw new TypeError(`Invalid or conflicting Gopher item type: ${type} (${kind})`);
    }

    wireTypes.add(type);
    kinds.add(kind);
  }
};
