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

## Development

Run `mise install` to install the pinned Node.js and pnpm versions. With mise active in your shell, run `pnpm install`. Lefthook installs the Git hooks during local dependency installation.

Run `pnpm lint` to apply lint fixes, then `pnpm format` to format files. Prefer arrow functions. Object literals with up to two properties can stay on one line. CI runs the read-only checks:

```sh
pnpm format:check
pnpm lint:check
pnpm exec turbo run typecheck build test
```

Core groups shared data in `model/` and custom item codecs in `codecs/`. Shared byte parsing and serialization will live in `wire/` when implemented. Client and server expose their factories and contracts from `api/`, with TCP operations in each package's `transport/`. The server owns selector registration in `dispatch/`.

Within each package, domain contracts live in `*.types.ts` files alongside their implementations. Package-root exports are the public import paths.

Each workspace owns its TypeScript checks. Shared compiler, Vitest, Oxlint, and Oxfmt settings live in `tooling/`. Cross-package tests in `tests/interop/` import the built packages by name.

## Changes and releases

Use Conventional Commits, such as `chore(tooling): configure linting`. Lefthook checks the message at commit time.

Run `pnpm changeset` for a user-facing change and commit the resulting Markdown file. Once it reaches `main`, the changelog workflow opens a version PR for the three public packages, including GitHub links in their changelogs. Enable **Allow GitHub Actions to create and approve pull requests** in the repository's Actions settings for this workflow.
