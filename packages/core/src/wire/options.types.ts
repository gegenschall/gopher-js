import type { Menu, MenuEntry, MenuLine } from '../model/menu.types.js';
import type { GopherRequest, WireSource } from './wire.types.js';

export interface WireCharset {
  readonly encode: (text: string) => Uint8Array;
  readonly decode: (bytes: Uint8Array) => string;
}

export type Charset = 'latin-1' | 'utf-8' | WireCharset;

export interface TextFraming {
  readonly read: (source: WireSource, charset: WireCharset) => Promise<string>;
  readonly write: (text: string, charset: WireCharset) => Uint8Array;
}

export interface MenuFraming {
  /** Yield complete CRLF-terminated entry lines, consuming any menu terminator. */
  readonly read: (source: WireSource) => AsyncIterable<Uint8Array>;
  readonly write: (entries: Iterable<Uint8Array>) => Uint8Array;
}

export interface TextFramingOptions {
  readonly read?: 'dot' | 'dot-or-eof' | 'eof';
  readonly write?: 'dot' | 'eof';
}

export interface MenuFramingOptions {
  readonly read?: 'dot' | 'dot-or-eof';
  readonly write?: 'dot' | 'eof';
}

export interface WireOptions {
  readonly charset?:
    | Charset
    | {
        readonly labels?: Charset;
        readonly query?: Charset;
        readonly text?: Charset;
      };

  readonly textFraming?: TextFraming | TextFramingOptions;
  readonly menuFraming?: MenuFraming | MenuFramingOptions;
}

export interface MenuEntryCodec {
  readonly parseMenuEntry: (bytes: Uint8Array) => MenuEntry;
  readonly encodeMenuEntry: (entry: MenuLine) => Uint8Array;
}

export interface GopherWire {
  readonly parseRequest: (source: WireSource) => Promise<GopherRequest>;
  readonly encodeRequest: (request: GopherRequest) => Uint8Array;

  readonly parseMenu: (source: WireSource) => Promise<Menu<MenuEntry>>;
  readonly encodeMenu: (menu: Menu) => Uint8Array;

  readonly parseText: (source: WireSource) => Promise<string>;
  readonly encodeText: (text: string) => Uint8Array;
}
