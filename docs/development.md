# Development

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

### Property and soak tests

Vitest runs 100 fast-check cases per property. Core compares fragmented input against independently encoded request bytes. The lifecycle property exercises binary transfers across cancellation, graceful and immediate close, and listener restart. On failure, fast-check prints the seed, shrink path, and counterexample. Replay the failing property by passing its reported `{ seed, path }` as the second argument to `fc.assert`.

For a longer local run, build the packages first, then repeat the property tests or run the loopback soak:

```sh
pnpm build
pnpm --filter @gopher-js/core --filter @gopher-js/interop-tests exec vitest run property.test --repeats 9
pnpm --filter @gopher-js/interop-tests soak
```

The soak starts a local server and a separate client process for each batch. It checks 7,320 responses byte-for-byte across text, menu, UTF-8 search, and streamed binary routes. Twelve requests run per wave. Between batches it checks server TCP resources and active producers against their idle state, then reports server memory and client p95 latency. Pass `--extended` to the soak script for twelve measured batches on the same server (21,720 requests including warm-up). The fixed pacing makes this a repeatable correctness workload.

Run `pnpm --filter @gopher-js/interop-tests soak --memory` to check for request objects retained after connections close. This mode runs 43,320 requests on one server, cancelling one binary stream in each wave of twelve. After every batch it forces garbage collection across event-loop turns and checks weak references to every accepted socket and dispatched request signal. It also checks that producers finished and TCP resources returned to their idle state. Samples before traffic, between batches, and after shutdown report the V8 heap, external memory, ArrayBuffer memory, and RSS in MiB.

### Proposed performance benchmarks

Establish a baseline on a pinned Node version and record the commit, OS, CPU, payload sizes, and concurrency. Keep the load generator in a separate process for TCP measurements. Use warm-up runs, several measured repetitions, and fixed input data. Verify the bytes received before recording a sample.

| Workload                            | Suggested scenarios                                                                                 | Measurements                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Wire parsing and encoding in memory | 10, 100, and 1,000 menu entries, Latin-1 and UTF-8, whole buffers and fragmented input              | Entries/s, MiB/s, CPU time                                               |
| Complete loopback requests          | Text, root menu, and Unicode search at 1, 16, and 64 concurrent clients, one connection per request | Requests/s, p50/p95/p99 latency, errors                                  |
| Binary streaming                    | Fixed 1 MiB and 64 MiB bodies with a fast reader, a throttled reader, and early cancellation        | MiB/s, time to first byte, peak server RSS, time to release the producer |

Run the baseline manually on the same machine across revisions. Record variation between runs before choosing regression thresholds. Profile the workload that shows a repeatable bottleneck before proposing an implementation change.
