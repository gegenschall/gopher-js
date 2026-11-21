import { createMenuEntry, type GopherAddress } from '@gopher-js/core';

import type { Route } from '../api/route.types.js';
import type { Binding } from './binding.types.js';

export const createRouteTable = (publicAddress: GopherAddress) => {
  const address = { ...publicAddress };
  const routes = new Map<string, Binding>();

  const register = <WireType extends string>(
    selector: string,
    binding: Binding & { type: WireType },
  ): Route<WireType> => {
    if (routes.has(selector)) {
      throw new Error(`A route already exists for selector "${selector}".`);
    }

    const { type } = binding;
    routes.set(selector, binding);

    return {
      type,
      selector,
      link: (label) =>
        createMenuEntry(type, label, {
          ...address,
          selector,
        }),
    };
  };

  return { register };
};
