# Gopher JS

An ESM-only Node.js workspace for `@gopher-js/client`, `@gopher-js/server`, and `@gopher-js/core`. Codec definitions, route registration, and menu link builders work in memory. Client requests and `server.listen()` currently report an unimplemented TCP transport.

## Public API

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

The client contract supports direct requests by selector and browsing by entry. Each entry carries its own host, port, and selector in `target`. Narrowing `kind` selects the available operation and its result.

```ts
for (const entry of await client.menu()) {
  if (entry.kind === 'counter') {
    const visits = await entry.read(); // bigint
    console.log(visits);
  }
}
```

Text and menu reads return promises. Binary reads and unknown entries' `raw()` expose an `AsyncIterable<Uint8Array>`. Request methods accept an optional `{ signal }` for cancellation.

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

## Changes and releases

Use Conventional Commits, such as `chore(tooling): configure linting`. Lefthook checks the message at commit time.

Run `pnpm changeset` for a user-facing change and commit the resulting Markdown file. Once it reaches `main`, the changelog workflow opens a version PR for the three public packages, including GitHub links in their changelogs. Enable **Allow GitHub Actions to create and approve pull requests** in the repository's Actions settings for this workflow.
