import { defineItemType } from '@gopher-js/core';
import { GopherItem, GopherMenu, GopherText } from '@gopher-js/nest-gopher';

const count = defineItemType({
  type: 'x',
  kind: 'count',
  framing: 'text',
  decode: BigInt,
  encode: (value) => value.toString(),
});

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
  @GopherItem(count, '/count')
  count() {
    return 42;
  }
}
