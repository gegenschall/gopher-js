import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const packages = ['core', 'client', 'server', 'nest-gopher'];
const version = JSON.parse(readFileSync('packages/core/package.json', 'utf8')).version;
const license = readFileSync('LICENSE', 'utf8');
const consumer = mkdtempSync(join(tmpdir(), 'gopher-consumer-'));

try {
  const dependencies = {};

  for (const name of packages) {
    const archive = join(process.argv[2], name + '.tgz');
    const extract = (file) =>
      execFileSync('tar', ['-xOf', archive, 'package/' + file], { encoding: 'utf8' });
    const manifest = JSON.parse(extract('package.json'));

    assert.equal(manifest.name, '@gopher-js/' + name);
    assert.equal(manifest.version, version);
    assert.equal(manifest.license, 'MIT');
    assert.equal(extract('LICENSE'), license);
    assert.doesNotMatch(JSON.stringify(manifest), /"(?:workspace|catalog):/);

    for (const [dependency, range] of Object.entries(manifest.dependencies ?? {})) {
      if (dependency.startsWith('@gopher-js/')) assert.equal(range, version);
    }

    dependencies[manifest.name] = 'file:' + archive;
  }

  const nodeTypes = JSON.parse(
    readFileSync('packages/server/node_modules/@types/node/package.json', 'utf8'),
  );
  const compiler = JSON.parse(
    readFileSync('packages/server/node_modules/typescript/package.json', 'utf8'),
  );
  dependencies['@types/node'] = nodeTypes.version;
  dependencies.typescript = compiler.version;

  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({
      private: true,
      dependencies,
      type: 'module',
    }),
  );
  copyFileSync('tooling/release/consumer.mts', join(consumer, 'consumer.mts'));

  const run = (command, args) => execFileSync(command, args, { cwd: consumer, stdio: 'inherit' });
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false']);
  run(process.execPath, [
    'node_modules/typescript/bin/tsc',
    '--strict',
    '--types',
    'node',
    '--module',
    'nodenext',
    '--target',
    'es2024',
    '--noEmit',
    'consumer.mts',
  ]);
  run(process.execPath, ['consumer.mts']);
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
