# Gopher JS

Gopher is still around. This is a TypeScript client and server for it. You can serve a menu, follow a selector, and stream a file. There’s a Nest adapter, too. Port 70 has had a busy afternoon.

## Try it on localhost

The packages use ESM and Node.js 26.13.1 or later. Install the client and server once the first npm release is available.

```sh
pnpm add @gopher-js/client @gopher-js/server
```

Save this as `archive.mjs` and run `node archive.mjs`. The OS picks a free port.

```js
import { createClient } from '@gopher-js/client';
import { createServer } from '@gopher-js/server';

const loopback = { host: '127.0.0.1', port: 0 };
const server = createServer({ publicAddress: loopback });
const about = server.text('/about', () => 'Welcome to the archive.');
server.menu('', () => [about.link('About this archive')]);

const address = await server.listen(loopback);
try {
  const client = createClient(address);
  for (const entry of await client.menu()) {
    if (entry.kind === 'text') console.log(entry.label, await entry.read());
  }
} finally {
  await server.close();
}
```

## Packages

| Package                  | What it does                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `@gopher-js/client`      | Browse menus, search, read text, or stream bytes. Each link carries its own destination. |
| `@gopher-js/server`      | Register selectors and serve them over TCP, with request limits and graceful shutdown.   |
| `@gopher-js/core`        | Parse and encode wire data, describe menus, and define custom item codecs.               |
| `@gopher-js/nest-gopher` | Serve Gopher from decorated Nest controllers, standalone or alongside HTTP.              |

Selectors are opaque strings. A search query travels after a tab. Text and menus have line framing, and binary transfers finish at EOF. Both endpoints accept the same wire configuration for servers with their own ideas about character sets and final dots. [Protocol, custom codecs, and API examples](docs/protocol-and-api.md) · [NestJS example](docs/protocol-and-api.md#nestjs-controllers)

## Development and releases

Run `mise install`, `pnpm install --frozen-lockfile`, and `pnpm exec turbo run typecheck build test`. The suite includes real loopback client/server and Nest applications. [Development, soak tests, and benchmarks](docs/development.md)

Submit changes through a pull request. Add a changeset for user-facing changes. The version PR collects these into a single release across the four packages. Merging that PR starts npm publication and creates a GitHub Release after registry verification. [Release process](docs/releases.md)

[MIT License](LICENSE)
