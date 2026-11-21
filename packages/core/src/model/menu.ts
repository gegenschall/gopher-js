import type { MenuEntry } from './menu.types.js';
import type { GopherTarget } from './target.types.js';

export const createMenuEntry = <Type extends string>(
  type: Type,
  label: string,
  target: GopherTarget,
): MenuEntry<Type> => ({
  type,
  label,
  target,
});
