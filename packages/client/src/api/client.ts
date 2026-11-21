import { validateItemTypes, type ItemCodec } from '@gopher-js/core';

import { request, unavailable } from '../transport/request.js';
import type { ClientOptions, GopherClient } from './client.types.js';

export const createClient = <const Codec extends ItemCodec = never>(
  options: ClientOptions<Codec>,
): GopherClient<Codec> => {
  validateItemTypes(options.types ?? []);

  return {
    menu: request,
    text: request,
    search: request,
    binary: unavailable,
  };
};
