import type { ItemIdentity } from '../model/item-type.types.js';
import type { CodecBodies, FramedCodec } from './item-codec.types.js';

export const defineItemType = <
  const Type extends string,
  const Kind extends string,
  Frame extends keyof CodecBodies,
  Value,
>(
  definition: ItemIdentity<Kind, Type> & FramedCodec<Frame, Value>,
) => Object.freeze({ ...definition });
