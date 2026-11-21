// Exercise every two-chunk boundary and the fully fragmented stream.
export function* partitions(bytes: Uint8Array) {
  for (let split = 0; split <= bytes.length; split++) {
    yield [bytes.subarray(0, split), bytes.subarray(split)];
  }

  yield Array.from(bytes, (byte) => Uint8Array.of(byte));
}

export async function* openPeer(wire: string) {
  yield Buffer.from(wire, 'latin1');
  throw new Error('Read past the end of the message.');
}
