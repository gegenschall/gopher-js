# Gopher JS

An ESM-only Node.js workspace for `@gopher-js/client`, `@gopher-js/server`, and `@gopher-js/core`. The client fetches menus, searches, text, and binary items over TCP. The server dispatches requests to typed route handlers and serves their responses over TCP.

## Public API

To read a text item, pass its selector to `client.text()`. The client connects to port 70 by default. Use an abort signal to bound the request.

```ts
import { createClient } from '@gopher-js/client';

const client = createClient({ host: 'gopher.floodgap.com' });
const document = await client.text('/gopher/proxy', { signal: AbortSignal.timeout(10_000) });
```

The wire field `type` is the one-character Gopher item type. Core pairs it with a readable `kind` and owns the menu data and codec types. A server route's `link()` returns a core `MenuEntry` containing `type`, `label`, and `target`. The client returns a `BrowsableMenu` of `BrowsableEntry` values with those fields and the operations each kind supports. A `BrowsableMenu` satisfies the core `Menu` contract, so a server handler can return an upstream client menu directly.

Define a custom item type once, then register it on each client or server that understands it.

```ts
import { createClient } from '@gopher-js/client';
import { defineItemType } from '@gopher-js/core';
import { createServer, info } from '@gopher-js/server';

const counter = defineItemType({
  type: 'x',
  kind: 'counter',
  framing: 'text',
  decode: (text) => BigInt(text.trim()),
  encode: (value) => value.toString(),
});

const publicAddress = {
  host: 'archive.example',
  port: 70,
};
const server = createServer({
  publicAddress,
  types: [counter],
});
const client = createClient({
  ...publicAddress,
  types: [counter],
});

const visits = server.item(counter, '/visits', () => 42n);
const find = server.search('/find', ({ query }) => [info(query)]);
server.menu('', () => [visits.link('Visit count'), find.link('Search')]);
```

The client supports direct requests by selector and browsing by entry. Each entry carries its own host, port, and selector in `target`. Narrowing `kind` selects the available operation and its result.

```ts
for (const entry of await client.menu()) {
  if (entry.kind === 'counter') {
    const visits = await entry.read(); // bigint
    console.log(visits);
  }
}
```

Call `client.menu()` for the root menu, or `client.search(selector, query)` for search results. Both return browsable entries in wire order. A menu entry’s `read()` and a search entry’s `search(query)` use the entry’s advertised host, port, and selector.

`client.binary(selector)`, binary entries’ `read()`, and unknown entries’ `raw()` stream bytes through EOF. Iteration opens the connection, and breaking out of the loop releases it. Registered binary codecs receive a complete buffer for decoding. Pass `{ signal }` to a request or entry method to cancel that operation.

### Serving requests

`listen()` resolves with the bound host and port when the server can accept connections. Use port `0` to let the OS choose a port. The published host comes from `publicAddress`. With a public port of `0`, route links report the bound port while the server listens, including links created before startup. An explicit public port is also suitable for a proxy.

```ts
const loopback = { host: '127.0.0.1', port: 0 };
const server = createServer({ publicAddress: loopback });
const about = server.text('/about', () => 'Hello from Gopher!');
server.menu('', () => [about.link('About')]);

const address = await server.listen(loopback);
try {
  const client = createClient(address);
  console.log(await client.text('/about'));
} finally {
  await server.close();
}
```

Each connection serves one selector. A search route requires a tab and accepts an empty query. Malformed requests, missing routes, unexpected queries, and handler failures before the first response byte produce a type-3 error menu. After a binary response starts, a producer failure resets the connection so the reader can detect an incomplete transfer.

RFC 1436 defines type 3 as a directory entry signaling an error. A client expecting text or binary may receive the error menu as ordinary content. The protocol has no universal error status for those transfers. See [RFC 1436, section 3.8 and Appendix](https://www.rfc-editor.org/rfc/rfc1436.html#section-3.8).

`maxRequestBytes` defaults to 8,192 and counts the selector, optional tab and query, and final CRLF. An oversized request receives a type-3 error. `requestTimeoutMs` defaults to 10,000 and runs from connection acceptance through request parsing. When it expires the server closes the socket. Both options take positive integers. Once parsing finishes, handlers and response transfers have no request deadline.

Binary handlers can return an async iterable and receive an abort signal, as do other route handlers. Use the signal for pending I/O so disconnects and shutdown can interrupt work. The server waits for socket write capacity when streaming. A client may half-close its write side after sending the selector and continue receiving the response. The library client sends a TCP reset when cancelling an active request or abandoning a binary stream.

`close()` stops accepting connections, aborts in-flight handlers, and closes active sockets. It can be called concurrently or before startup completes. After it resolves, the server can listen again with the same routes.

## Wire protocol

`@gopher-js/core` exposes the wire functions independently of the TCP client and server. Pass a `Uint8Array`, an iterable of byte chunks, or an async iterable such as a Node socket to the message readers.

| Message                           | Read                                                                                | Write                                    |
| --------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------- |
| Request                           | `parseRequest(source)`                                                              | `encodeRequest({ selector, query? })`    |
| Menu                              | `parseMenu(source)`                                                                 | `encodeMenu(entries)`                    |
| Single CRLF-terminated menu entry | `parseMenuEntry(bytes)`                                                             | `encodeMenuEntry(entry)`                 |
| Text                              | `parseText(source)`                                                                 | `encodeText(text)`                       |
| Binary                            | Stream the chunks directly, or use `collectBinary(source)` for a whole-buffer codec | Write the bytes and close the connection |

The readers follow [RFC 1436](https://www.rfc-editor.org/rfc/rfc1436). Requests complete at the first CRLF, leaving a Node socket writable for the response. A tab separates a search query from its selector, including an empty selector. A line without a tab is always a selector at the wire layer. Selectors retain their original spaces, case, slashes, and percent signs.

By default, wire strings use a one-to-one Latin-1 byte mapping. Encoders reject unrepresentable characters and reserved field delimiters. Menu reads preserve unknown type characters and skip extra tab-delimited fields. A malformed entry or a menu missing its dot terminator rejects the read. An authored info line receives the placeholder target with an empty selector, host `fake`, and port `0`.

Text reads return LF line endings, remove dot stuffing, and accept EOF without a terminator. Text writes accept LF or CRLF, complete a final unterminated line, and emit dot-stuffed CRLF lines followed by the terminator. Binary data passes through unchanged until EOF.

### Wire configuration

Use `createWire()` from `@gopher-js/core` to share a configuration or configure each endpoint independently. The standalone readers and writers use the defaults. Use `wire.parseMenuEntry(bytes)` and `wire.encodeMenuEntry(entry)` on the result of `createWire()` to apply its label charset to individual entries. Each client and server exposes its selected instance as `.wire`.

```ts
const wire = createWire({
  charset: { labels: 'utf-8', query: 'utf-8' },
  menuFraming: { read: 'dot-or-eof', write: 'dot' },
});

const client = createClient({ host: 'archive.example', wire });
const server = createServer({ publicAddress, wire });
```

- **Charset.** A single `'latin-1'`, `'utf-8'`, or `WireCharset` (an object with `encode` and `decode`) applies to menu labels, text bodies, and search queries. Set `{ labels, text, query }` to choose them independently. Omitted fields default to Latin-1. UTF-8 decoding rejects malformed sequences. Selectors always use the original one-byte mapping, including in search requests.
- **Text framing.** Reads accept `'dot'` (terminator required), `'dot-or-eof'` (default), or `'eof'`. Writes accept `'dot'` (default) or `'eof'`. EOF mode preserves literal periods and original line endings. Dot framing applies the charset to each logical line and escapes leading dot bytes.
- **Menu framing.** Reads default to `'dot'`. Use `'dot-or-eof'` to also accept EOF after a complete entry. Writes default to `'dot'`. Use `'eof'` to omit the terminator and close the connection after writing the entries.
- **Custom framing.** Supply a `TextFraming` or `MenuFraming` object with both `read` and `write` functions. Text strategies receive the selected text charset. Menu strategies consume or produce complete CRLF-terminated entry lines, with the strategy handling the outer menu terminator.

## Development

Run `mise install` to install the pinned Node.js and pnpm versions. With mise active in your shell, run `pnpm install`. Lefthook installs the Git hooks during local dependency installation.

Run `pnpm lint` to apply lint fixes, then `pnpm format` to format files. Prefer arrow functions. Object literals with up to two properties can stay on one line. CI runs the read-only checks:

```sh
pnpm format:check
pnpm lint:check
pnpm exec turbo run typecheck build test
```

Core groups shared data in `model/` and custom item codecs in `codecs/`. Shared byte parsing and serialization live in `wire/`. Client and server expose their factories and contracts from `api/`, with TCP operations in each package's `transport/`. The server owns selector registration in `dispatch/`.

Within each package, domain contracts live in `*.types.ts` files alongside their implementations. Package-root exports are the public import paths.

Each workspace owns its TypeScript checks. Shared compiler, Vitest, Oxlint, and Oxfmt settings live in `tooling/`. Wire unit tests in `packages/core/test/wire/` use literal transcripts and exercise chunk boundaries. Run them with `pnpm --filter @gopher-js/core test`. Cross-package tests in `tests/interop/` import the built packages by name and exercise a real loopback TCP exchange.

### Proposed performance benchmarks

Establish a baseline on a pinned Node version and record the commit, OS, CPU, payload sizes, and concurrency. Keep the load generator in a separate process for TCP measurements. Use warm-up runs, several measured repetitions, and fixed input data. Verify the bytes received before recording a sample.

| Workload                            | Suggested scenarios                                                                                 | Measurements                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Wire parsing and encoding in memory | 10, 100, and 1,000 menu entries, Latin-1 and UTF-8, whole buffers and fragmented input              | Entries/s, MiB/s, CPU time                                               |
| Complete loopback requests          | Text, root menu, and Unicode search at 1, 16, and 64 concurrent clients, one connection per request | Requests/s, p50/p95/p99 latency, errors                                  |
| Binary streaming                    | Fixed 1 MiB and 64 MiB bodies with a fast reader, a throttled reader, and early cancellation        | MiB/s, time to first byte, peak server RSS, time to release the producer |

Run the baseline manually on the same machine across revisions. Record variation between runs before choosing regression thresholds. Profile the workload that shows a repeatable bottleneck before proposing an implementation change.

## Changes and releases

Use Conventional Commits, such as `chore(tooling): configure linting`. Lefthook checks the message at commit time.

Run `pnpm changeset` for a user-facing change and commit the resulting Markdown file. Once it reaches `main`, the changelog workflow opens a version PR for the three public packages, including GitHub links in their changelogs. Enable **Allow GitHub Actions to create and approve pull requests** in the repository's Actions settings for this workflow.
