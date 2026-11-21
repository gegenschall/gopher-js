import { createWire, validateItemTypes, type ItemCodec } from '@gopher-js/core';

import { createMenuBrowser } from './browse.js';
import type { ClientOptions, GopherClient } from './client.types.js';

export const createClient = <const Codec extends ItemCodec = never>(
  options: ClientOptions<Codec>,
): GopherClient<Codec> => {
  const types = options.types ?? [];
  validateItemTypes(types);

  const address = { host: options.host, port: options.port ?? 70 };
  const wire = options.wire ?? createWire();
  const { menu, text, binary } = createMenuBrowser(wire, types);

  return {
    wire,

    menu: (selector = '', requestOptions) =>
      menu({ ...address, selector }, undefined, requestOptions),
    search: (selector, query, requestOptions) =>
      menu({ ...address, selector }, query, requestOptions),
    text: (selector, requestOptions) => text({ ...address, selector }, requestOptions),
    binary: (selector, requestOptions) => binary({ ...address, selector }, requestOptions),
  };
};
