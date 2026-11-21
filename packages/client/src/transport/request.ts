import { once } from 'node:events';
import { createConnection } from 'node:net';

import type {
  GopherAddress,
  GopherWire,
  GopherRequest,
  GopherTarget,
  WireSource,
} from '@gopher-js/core';

const openResponse = async (
  { host, port }: GopherAddress,
  wire: GopherWire,
  request: GopherRequest,
  signal?: AbortSignal,
) => {
  signal?.throwIfAborted();
  const bytes = wire.encodeRequest(request);
  const socket = createConnection({
    host,
    port,
    signal,
  });

  try {
    await once(socket, 'connect');
    socket.write(bytes);
    return socket;
  } catch (error) {
    socket.destroy();
    throw error;
  }
};

export const readResponse = async <Result>(
  address: GopherAddress,
  wire: GopherWire,
  request: GopherRequest,
  read: (source: WireSource) => Promise<Result>,
  signal?: AbortSignal,
): Promise<Result> => {
  const socket = await openResponse(address, wire, request, signal);

  try {
    // A custom reader may start consuming bytes asynchronously.
    const { reject, promise } = Promise.withResolvers<never>();
    socket.on('error', reject);
    return await Promise.race([promise, read(socket)]);
  } finally {
    socket.destroy();
  }
};

export async function* streamBinary(
  target: GopherTarget,
  wire: GopherWire,
  signal?: AbortSignal,
): AsyncGenerator<Uint8Array> {
  const socket = await openResponse(target, wire, { selector: target.selector }, signal);

  try {
    yield* socket;
  } finally {
    socket.destroy();
  }
}
