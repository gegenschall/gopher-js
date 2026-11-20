# Gopher JS

An ESM-only Node.js workspace for `@gopher-js/client`, `@gopher-js/server`, and `@gopher-js/core`. The public entry points are placeholders.

## Development

Run `mise install` to install the pinned Node.js and pnpm versions. With mise active in your shell, run `pnpm install`. Lefthook installs the Git hooks during local dependency installation.

Run `pnpm format` to format files and `pnpm lint` to apply lint fixes. CI runs the read-only checks:

```sh
pnpm format:check
pnpm lint:check
pnpm exec turbo run typecheck build test
```

Each workspace owns its TypeScript checks. Shared compiler, Vitest, Oxlint, and Oxfmt settings live in `tooling/`. Cross-package tests in `tests/interop/` import the built packages by name.

## Changes and releases

Use Conventional Commits, such as `chore(tooling): configure linting`. Lefthook checks the message at commit time.

Run `pnpm changeset` for a user-facing change and commit the resulting Markdown file. Once it reaches `main`, the changelog workflow opens a version PR for the three public packages, including GitHub links in their changelogs. Enable **Allow GitHub Actions to create and approve pull requests** in the repository's Actions settings for this workflow.
