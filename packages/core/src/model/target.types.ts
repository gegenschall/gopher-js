export interface GopherAddress {
  readonly host: string;
  readonly port: number;
}

/** A selector is opaque, including the empty selector for the root menu. */
export interface GopherTarget extends GopherAddress {
  readonly selector: string;
}
