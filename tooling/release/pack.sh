#!/usr/bin/env bash
set -euo pipefail

# Run from the workspace root. A release publishes these same tested archives.
destination=${1:?expected an absolute tarball directory}
mkdir -p "$destination"
destination=$(cd "$destination" && pwd)

for package in packages/core packages/client packages/server contrib/nest-gopher; do
  pnpm -C "$package" pack --out "$destination/${package##*/}.tgz" --silent
done

node tooling/release/smoke.mjs "$destination"
