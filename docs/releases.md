# Releases

The four public packages share a version. The workspace root, tooling, and tests are private. The first release is planned as `0.0.1`.

1. Open a PR against `main`. Use a Conventional Commits title and add a changeset for user-facing changes. CI builds and tests the workspace and installs the four tarballs together in a clean consumer.
2. After a squash merge, Changesets creates or updates its version PR with package versions and changelogs. Review the proposed versions and wait for CI. GitHub may ask a maintainer to approve the workflow runs on the bot’s PR.
3. Merge the version PR when ready to ship. Changesets builds a publish plan from the versions missing on npm. The release workflow builds and tests the commit before packing those packages.
4. The Changesets publish action publishes the archives from the `npm` environment and creates a GitHub Release for each package, with tags such as `@gopher-js/core@0.0.1`.

## First publication

An npm scope owner can bootstrap new package names by staging each public tarball with `npm stage publish <archive> --access public` and approving it with 2FA. Use the archives from the Changesets pack job or run `pnpm build` and `pnpm pack` for each public package from the release commit. If the initial publication happens outside CI, create its GitHub Releases using the package changelogs and the same release commit.

Configure npm trusted publishing on each package for GitHub owner `gegenschall`, repository `gopher-js`, workflow `release.yml`, and environment `npm`. [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) · [Staged publishing](https://docs.npmjs.com/staged-publishing/)

## Recovery

For a partial npm publish, rerun the full release workflow for the original release commit so Changesets can refresh its publish plan. If a package reached npm but its GitHub Release failed, create that release from the package changelog at the original release commit. [Changesets automation](https://changesets.dev/guide/automating)
