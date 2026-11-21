import type { ItemIdentity } from '../model/item-type.types.js';

export interface CodecBodies {
  text: string;
  binary: Uint8Array;
}

export interface FramedCodec<Frame extends keyof CodecBodies, Output, Input = Output> {
  readonly framing: Frame;
  readonly decode: (body: CodecBodies[Frame]) => Output;
  readonly encode: (value: NoInfer<Input>) => CodecBodies[Frame];
}

// Registries hold codecs with different value types. A caller needs a concrete
// codec before it can supply a value to encode.
export type ItemCodec = ItemIdentity &
  (FramedCodec<'text', unknown, never> | FramedCodec<'binary', unknown, never>);

export type ItemValue<Type extends ItemCodec> = ReturnType<Type['decode']>;
