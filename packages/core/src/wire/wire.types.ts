/** One complete message, or the chunks delivered by a transport. */
export type WireSource = Uint8Array | Iterable<Uint8Array> | AsyncIterable<Uint8Array>;

export interface GopherRequest {
  readonly selector: string;
  readonly query?: string;
}
