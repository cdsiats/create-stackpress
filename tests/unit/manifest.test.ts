import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { CliError } from '../../src/errors.js';
import {
  canonicalFragmentIndex,
  expectedCapabilities,
  loadFragmentIndex,
  loadFragmentManifest,
  parseEnvLine,
  validateFragmentIndex,
  validateFragmentManifest
} from '../../src/template/manifest.js';

function assertGeneration(action: () => unknown, pattern?: RegExp): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof CliError);
    assert.equal(error.code, 'GENERATION');
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

const validManifest = {
  schemaVersion: 1,
  id: 'database-pglite',
  kind: 'database',
  requires: ['base'],
  capabilities: ['database'],
  files: ['plugins/store/connect.ts', 'config/database.ts'],
  assets: ['public/logo.bin'],
  package: {
    dependencies: {
      '@electric-sql/pglite': '0.3.15',
      '@stackpress/inquire-pglite': '0.10.8'
    },
    devDependencies: { typescript: '5.9.3' },
    scripts: { 'db:push': 'stackpress push --b config/develop -v' },
    plugins: ['./plugins/store/plugin', 'stackpress']
  },
  env: ['DATABASE_URL=./.build/database']
};

test('validates a complete fragment manifest', () => {
  const manifest = validateFragmentManifest(validManifest);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.id, 'database-pglite');
  assert.equal(manifest.kind, 'database');
  assert.deepEqual(manifest.files, [
    'plugins/store/connect.ts',
    'config/database.ts'
  ]);
  assert.deepEqual(manifest.package?.dependencies, {
    '@electric-sql/pglite': '0.3.15',
    '@stackpress/inquire-pglite': '0.10.8'
  });
});

test('rejects unsupported schema versions, ids, and kinds', () => {
  assertGeneration(
    () => validateFragmentManifest({ ...validManifest, schemaVersion: 2 }),
    /schemaVersion/
  );
  assertGeneration(
    () => validateFragmentManifest({ ...validManifest, id: 'Database PGlite' }),
    /kebab-case/
  );
  assertGeneration(
    () => validateFragmentManifest({ ...validManifest, kind: 'plugin' }),
    /kind/
  );
  assertGeneration(
    () => validateFragmentManifest({ ...validManifest, requires: ['base', 'base'] }),
    /duplicate/
  );
  assertGeneration(
    () => validateFragmentManifest({ ...validManifest, requires: ['../base'] }),
    /requires/
  );
});

test('rejects unsafe and duplicate paths', () => {
  for (const path of [
    '/etc/passwd',
    '../outside',
    'config/../outside',
    'config\\database.ts',
    'C:/windows',
    'config//database.ts',
    'config/'
  ]) {
    assertGeneration(
      () => validateFragmentManifest({ ...validManifest, files: [path] }),
      /relative POSIX path/
    );
  }
  assertGeneration(
    () =>
      validateFragmentManifest({
        ...validManifest,
        files: ['config/database.ts', 'config/database.ts']
      }),
    /duplicate/
  );
  assertGeneration(
    () =>
      validateFragmentManifest({
        ...validManifest,
        files: ['config/database.ts'],
        assets: ['config/database.ts']
      }),
    /both a file and an asset/
  );
});

test('rejects unknown and duplicate capabilities', () => {
  assertGeneration(
    () =>
      validateFragmentManifest({
        ...validManifest,
        capabilities: ['database', 'billing']
      }),
    /unknown capability/
  );
  assertGeneration(
    () =>
      validateFragmentManifest({
        ...validManifest,
        capabilities: ['database', 'database']
      }),
    /duplicate capability/
  );
});

test('rejects invalid env lines and duplicate keys', () => {
  assertGeneration(
    () =>
      validateFragmentManifest({
        ...validManifest,
        env: ['DATABASE_URL without equals']
      }),
    /invalid env entry/
  );
  assertGeneration(
    () =>
      validateFragmentManifest({
        ...validManifest,
        env: ['DATABASE_URL=one', 'DATABASE_URL=two']
      }),
    /duplicate env key/
  );
  assert.deepEqual(parseEnvLine('DATABASE_URL=./.build/database'), {
    key: 'DATABASE_URL',
    value: './.build/database'
  });
});

test('validates package names, versions, scripts, and fields', () => {
  assertGeneration(
    () =>
      validateFragmentManifest({
        ...validManifest,
        package: { dependencies: { 'Bad Package': '1.0.0' } }
      }),
    /valid package name/
  );
  assertGeneration(
    () =>
      validateFragmentManifest({
        ...validManifest,
        package: { dependencies: { pg: '' } }
      }),
    /non-empty string/
  );
  assertGeneration(
    () =>
      validateFragmentManifest({
        ...validManifest,
        package: { scripts: { 'bad script': 'echo nope' } }
      }),
    /invalid script name/
  );
  assertGeneration(
    () =>
      validateFragmentManifest({
        ...validManifest,
        package: { optionalDependencies: { pg: '8.16.3' } }
      }),
    /unknown package field/
  );
});

test('validates the bundled fragment index', async () => {
  const indexUrl = new URL('../../templates/manifest.json', import.meta.url);
  const parsed: unknown = JSON.parse(await readFile(indexUrl, 'utf8'));
  const index = validateFragmentIndex(parsed, 'templates/manifest.json');
  assert.deepEqual(index, canonicalFragmentIndex());
  assert.deepEqual(
    index.fragments.map((entry) => entry.id),
    [
      'base',
      'full-stack',
      'api-only',
      'minimal',
      'admin-only',
      'database-pglite',
      'database-postgres',
      'database-cockroachdb',
      'database-mysql',
      'database-sqlite'
    ]
  );
  assert.deepEqual(
    index.fragments.map((entry) => entry.path),
    [
      'base',
      'types/full-stack',
      'types/api-only',
      'types/minimal',
      'types/admin-only',
      'databases/pglite',
      'databases/postgres',
      'databases/cockroachdb',
      'databases/mysql',
      'databases/sqlite'
    ]
  );

  const loaded = await loadFragmentIndex(
    fileURLToPath(new URL('../../templates', import.meta.url))
  );
  assert.deepEqual(loaded, index);
});

test('rejects invalid fragment indexes', () => {
  assertGeneration(
    () => validateFragmentIndex({ schemaVersion: 2, fragments: [] }),
    /schemaVersion/
  );
  assertGeneration(
    () => validateFragmentIndex({ schemaVersion: 1, fragments: [] }),
    /non-empty/
  );
  assertGeneration(
    () =>
      validateFragmentIndex({
        schemaVersion: 1,
        fragments: [
          { id: 'base', kind: 'base', path: 'base' },
          { id: 'base', kind: 'type', path: 'types/base' }
        ]
      }),
    /duplicate fragment id/
  );
  assertGeneration(
    () =>
      validateFragmentIndex({
        schemaVersion: 1,
        fragments: [
          { id: 'base', kind: 'base', path: 'base' },
          { id: 'minimal', kind: 'type', path: 'base' }
        ]
      }),
    /duplicate fragment path/
  );
  assertGeneration(
    () =>
      validateFragmentIndex({
        schemaVersion: 1,
        fragments: [{ id: 'base', kind: 'base', path: '../base' }]
      }),
    /relative POSIX path/
  );
});

test('loads fragment manifests from fixture directories', async () => {
  const fixtureRoot = fileURLToPath(
    new URL('../fixtures/fragments', import.meta.url)
  );
  const manifest = await loadFragmentManifest(
    fileURLToPath(new URL('../fixtures/fragments/base', import.meta.url))
  );
  assert.equal(manifest.id, 'base');
  assert.equal(manifest.kind, 'base');
  assert.ok(manifest.package?.scripts?.dev);
  assert.equal(
    await loadFragmentIndex(fixtureRoot).then((index) => index?.fragments.length),
    10
  );
});

test('exports canonical capability sets and database metadata', () => {
  assert.deepEqual(expectedCapabilities('full-stack'), [
    'views',
    'admin',
    'api',
    'auth',
    'content',
    'database'
  ]);
  assert.deepEqual(expectedCapabilities('api-only'), ['api', 'auth', 'database']);
  assert.deepEqual(expectedCapabilities('minimal'), ['database']);
  assert.deepEqual(expectedCapabilities('admin-only'), [
    'admin',
    'auth',
    'database'
  ]);
  assert.throws(
    () => expectedCapabilities('blank' as never),
    (error: unknown) => error instanceof CliError && error.code === 'USAGE'
  );
});
