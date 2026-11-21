import type { Socket } from 'node:net';

import type { GopherWire } from '@gopher-js/core';

export class RequestTooLarge extends Error {}

export const createRequestReader = (
  wire: GopherWire,
  maxRequestBytes = 8_192,
  requestTimeoutMs = 10_000,
) => {
  if (!Number.isSafeInteger(maxRequestBytes) || maxRequestBytes < 1) {
    throw new RangeError('maxRequestBytes must be a positive safe integer.');
  }

  if (
    !Number.isInteger(requestTimeoutMs) ||
    requestTimeoutMs < 1 ||
    requestTimeoutMs > 2 ** 31 - 1
  ) {
    throw new RangeError('requestTimeoutMs must be an integer between 1 and 2147483647.');
  }

  return async (socket: Socket) => {
    const deadline = setTimeout(() => socket.destroy(), requestTimeoutMs);
    const clearDeadline = () => clearTimeout(deadline);
    socket.once('close', clearDeadline);

    const fragments: Buffer[] = [];
    let length = 0;

    try {
      const chunks: AsyncIterable<Buffer> = socket.iterator({ destroyOnReturn: false });
      for await (const chunk of chunks) {
        const newline = chunk.indexOf(10);
        const fragment = newline < 0 ? chunk : chunk.subarray(0, newline + 1);
        length += fragment.length;
        if (length > maxRequestBytes) throw new RequestTooLarge();

        fragments.push(fragment);
        if (newline >= 0) break;
      }

      return await wire.parseRequest(Buffer.concat(fragments, length));
    } finally {
      clearDeadline();
      socket.off('close', clearDeadline);
    }
  };
};
