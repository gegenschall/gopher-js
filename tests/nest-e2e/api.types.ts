import { GopherItem, GopherMenu, GopherText } from '@gopher-js/nest-gopher';

import { counter } from './fixtures/counter.codec.js';

export class InvalidHandlers {
  // @ts-expect-error Text handlers return strings.
  @GopherText('/text')
  text() {
    return Uint8Array.of(1);
  }

  // @ts-expect-error Menus contain menu entries.
  @GopherMenu('')
  menu() {
    return 'hello';
  }

  // @ts-expect-error This codec encodes bigint.
  @GopherItem(counter, '/count')
  count() {
    return 42;
  }
}
