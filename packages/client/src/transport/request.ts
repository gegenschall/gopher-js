import { addAbortListener, once } from 'node:events';
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
  const socket = createConnection({ host, port });

  try {
    await once(socket, 'connect', { signal });
    signal?.throwIfAborted();
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

  // A custom reader may start consuming bytes asynchronously.
  const { reject, promise } = Promise.withResolvers<never>();
  socket.on('error', reject);
  const abort =
    signal &&
    addAbortListener(signal, () => {
      reject(signal.reason);
      socket.resetAndDestroy();
    });

  try {
    return await Promise.race([promise, read(socket)]);
  } finally {
    abort?.[Symbol.dispose]();
    socket.destroy();
  }
};

export async function* streamBinary(
  target: GopherTarget,
  wire: GopherWire,
  signal?: AbortSignal,
): AsyncGenerator<Uint8Array> {
  const socket = await openResponse(target, wire, { selector: target.selector }, signal);

  const abort = signal && addAbortListener(signal, () => socket.resetAndDestroy());

  try {
    yield* socket.iterator({ destroyOnReturn: false });
    signal?.throwIfAborted();
  } catch (error) {
    signal?.throwIfAborted();
    throw error;
  } finally {
    abort?.[Symbol.dispose]();
    if (!socket.destroyed && !socket.readableEnded) socket.resetAndDestroy();
    else socket.destroy();
  }
}
