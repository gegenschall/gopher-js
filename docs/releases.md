# Releases

The four public packages share a version. The workspace root, tooling, and tests are private. The initial release is planned as `0.0.1`.

1. Open a PR against `main`. Use a Conventional Commits title and run `pnpm changeset` for user-facing changes. Review the CI results and squash merge.
2. Changesets updates its version PR, including each package’s changelog. A maintainer may need to approve workflow runs for that bot-created PR. Review the proposed versions and wait for CI.
3. Merge the version PR when ready to ship. The `Publish release` workflow builds the release commit, packs all four tarballs, installs them together outside the workspace, checks their declarations, and runs a loopback request. A documentation or metadata edit with the same package version skips publication.
4. The publish job sends the tested archives to the public npm registry in dependency order. Once all four registry integrity hashes match, it creates a GitHub Release tagged `v<version>` at that commit, with notes from the package changelogs.

## First publication

An npm owner with publish rights to the `@gopher-js` scope must bootstrap any new package names. For existing packages, configure a GitHub Actions trusted publisher for each package, with owner `gegenschall`, repository `gopher-js`, workflow `release.yml`, environment `npm`, and permission to publish. Restrict the GitHub environment to the protected default branch.

If npm first needs a package to exist, the scope owner can stage the tested archives from the version commit using `npm stage publish <archive> --access public` and approve them with 2FA in npm. Download the `npm-tarballs` artifact from the release workflow. Stage those exact four archives. After npm approves them, rerun the failed publish job so it retrieves the same artifact. Configure trusted publishing for subsequent releases. [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) · [Staged publishing](https://docs.npmjs.com/staged-publishing/)

## Recovery

Rerun the release workflow **for the original release commit** after fixing permissions or a transient registry failure. The job verifies previously published versions against the local tarball hashes and resumes with missing packages. A conflicting archive or tag stops the release. Investigate the mismatch before choosing a new version. A completed npm version cannot be overwritten.
