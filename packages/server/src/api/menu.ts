import {
  createMenuEntry,
  itemTypes,
  type GopherTarget,
  type InfoLine,
  type ItemCodec,
} from '@gopher-js/core';

export const info = (label: string): InfoLine => ({
  type: itemTypes.info,
  label,
});

const linkBuilder =
  <Type extends string>(type: Type) =>
  (label: string, target: GopherTarget) =>
    createMenuEntry(type, label, target);

export const link = {
  text: linkBuilder(itemTypes.text),
  menu: linkBuilder(itemTypes.menu),
  search: linkBuilder(itemTypes.search),
  binary: linkBuilder(itemTypes.binary),

  item: <Codec extends ItemCodec>(codec: Codec, label: string, target: GopherTarget) =>
    createMenuEntry<Codec['type']>(codec.type, label, target),
};
