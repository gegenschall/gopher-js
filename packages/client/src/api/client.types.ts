import type { ItemCodec } from '@gopher-js/core';

import type { BrowsableMenu } from './browsable-entry.types.js';
import type { RequestOptions } from './request.types.js';

export interface ClientOptions<Codec extends ItemCodec = never> {
  readonly host: string;
  /** Defaults to the Gopher port, 70. */
  readonly port?: number;
  readonly types?: readonly Codec[];
}

export interface GopherClient<Codec extends ItemCodec = never> {
  menu(selector?: string, options?: RequestOptions): Promise<BrowsableMenu<Codec>>;
  text(selector: string, options?: RequestOptions): Promise<string>;
  search(selector: string, query: string, options?: RequestOptions): Promise<BrowsableMenu<Codec>>;
  binary(selector: string, options?: RequestOptions): AsyncIterable<Uint8Array>;
}
