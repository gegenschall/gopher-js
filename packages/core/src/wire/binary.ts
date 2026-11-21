import { chunksOf } from './bytes.js';
import type { WireSource } from './wire.types.js';

/** Buffer an EOF-framed response for a binary codec that needs the whole body. */
export const collectBinary = async (source: WireSource): Promise<Uint8Array> => {
  const chunks: Uint8Array[] = [];

  for await (const chunk of chunksOf(source)) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
};
