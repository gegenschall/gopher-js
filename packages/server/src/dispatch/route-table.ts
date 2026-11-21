import { createMenuEntry, type GopherAddress } from '@gopher-js/core';

import type { Route } from '../api/route.types.js';
import type { Binding } from './binding.types.js';

export const createRouteTable = ({ host, port }: GopherAddress, boundPort: () => number) => {
  const routes = new Map<string, Binding>();

  const register = <Type extends string>(
    type: Type,
    selector: string,
    binding: Binding,
  ): Route<Type> => {
    if (routes.has(selector)) {
      throw new Error(`A route already exists for selector "${selector}".`);
    }

    routes.set(selector, binding);

    return {
      type,
      selector,
      link: (label) =>
        createMenuEntry(type, label, {
          host,
          get port() {
            return port || boundPort();
          },
          selector,
        }),
    };
  };

  return { register, lookup: (selector: string) => routes.get(selector) };
};
