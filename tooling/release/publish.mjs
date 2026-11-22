import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

const directories = ['packages/core', 'packages/client', 'packages/server', 'contrib/nest-gopher'];
const { GITHUB_SHA, GITHUB_REF, GITHUB_REPOSITORY } = process.env;
assert.equal(GITHUB_REF, 'refs/heads/main');
assert.equal(GITHUB_REPOSITORY, 'gegenschall/gopher-js');
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), GITHUB_SHA);

const readManifest = (dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
const { version } = readManifest(directories[0]);
assert.match(version, /^\d+\.\d+\.\d+$/);
assert.notEqual(version, '0.0.0');
const tag = 'v' + version;
const notes = [];

const publishedIntegrity = async (name) => {
  const url = 'https://registry.npmjs.org/' + encodeURIComponent(name) + '/' + version;
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error('npm registry returned ' + response.status + ' for ' + name);
  const metadata = await response.json();
  assert.ok(metadata.dist?.integrity, 'Missing npm integrity for ' + name);
  return metadata.dist.integrity;
};

for (const dir of directories) {
  const manifest = readManifest(dir);
  assert.equal(manifest.version, version);
  const changelog = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8');
  const heading = '## ' + version + '\n';
  const start = changelog.indexOf(heading);
  assert.ok(start >= 0, 'Missing release notes in ' + dir);
  const section = changelog
    .slice(start + heading.length)
    .split('\n## ')[0]
    .trim();
  notes.push('## ' + manifest.name + '\n\n' + section);
}

for (const dir of directories) {
  const { name } = readManifest(dir);
  const archive = join(process.argv[2], name.split('/')[1] + '.tgz');
  const integrity = 'sha512-' + createHash('sha512').update(readFileSync(archive)).digest('base64');
  let remote = await publishedIntegrity(name);
  if (remote === undefined) {
    execFileSync(
      'npm',
      ['publish', archive, '--access', 'public', '--registry=https://registry.npmjs.org'],
      { stdio: 'inherit' },
    );
    for (let attempt = 0; attempt < 8 && remote === undefined; attempt++) {
      if (attempt) await setTimeout(2_000);
      remote = await publishedIntegrity(name);
    }
  }

  assert.equal(remote, integrity, 'Registry tarball differs for ' + name);
}

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim();
const tags = execFileSync(
  'git',
  ['ls-remote', '--tags', 'origin', 'refs/tags/' + tag, 'refs/tags/' + tag + '^{}'],
  { encoding: 'utf8' },
).trim();
if (tags) {
  const target = tags.split('\n').at(-1).split('\t')[0];
  assert.equal(target, GITHUB_SHA, 'The release tag already points to a different commit');
}

const existing = gh(
  'api',
  '--paginate',
  'repos/{owner}/{repo}/releases',
  '--jq',
  '.[].tag_name',
).split('\n');
if (!existing.includes(tag)) {
  const file = join(process.argv[2], 'notes.md');
  writeFileSync(file, notes.join('\n\n') + '\n');
  gh(
    'release',
    'create',
    tag,
    '--target',
    GITHUB_SHA,
    '--title',
    'Gopher JS ' + tag,
    '--notes-file',
    file,
  );
}
