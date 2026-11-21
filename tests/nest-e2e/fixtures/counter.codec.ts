import { defineItemType } from '@gopher-js/core';

export const counter = defineItemType({
  type: 'x',
  kind: 'counter',
  framing: 'text',
  decode: BigInt,
  encode: (count) => count.toString(),
});
