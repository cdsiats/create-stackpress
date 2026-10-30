import assert from 'node:assert/strict';
import test from 'node:test';
import { CliError } from '../../src/errors.js';
import {
  mergePackageFragments,
  renderPackageJson
} from '../../src/template/package.js';

function assertGeneration(action: () => unknown, pattern?: RegExp): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof CliError);
    assert.equal(error.code, 'GENERATION');
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

test('merges package entries, deduplicates plugins, and sorts keys', () => {
  const merged = mergePackageFragments([
    {
      id: 'base',
      package: {
        dependencies: { stackpress: '0.10.8', react: '19.2.4' },
        devDependencies: { typescript: '5.9.3' },
        scripts: { dev: 'stackpress serve', build: 'stackpress build' },
        plugins: ['./plugins/store/plugin', 'stackpress']
      }
    },
    {
      id: 'type',
      package: {
        dependencies: { react: '19.2.4', zod: '4.1.0' },
        devDependencies: { typescript: '5.9.3', tsx: '4.23.15' },
        scripts: { push: 'stackpress push' },
        plugins: ['./plugins/app/plugin', 'stackpress']
      }
    }
  ]);

  assert.deepEqual(Object.keys(merged.dependencies), [
    'react',
    'stackpress',
    'zod'
  ]);
  assert.deepEqual(Object.keys(merged.devDependencies), ['tsx', 'typescript']);
  assert.deepEqual(Object.keys(merged.scripts), ['build', 'dev', 'push']);
  assert.deepEqual(merged.plugins, [
    './plugins/app/plugin',
    './plugins/store/plugin',
    'stackpress'
  ]);
});

test('rejects conflicting dependency versions', () => {
  assertGeneration(
    () =>
      mergePackageFragments([
        { id: 'base', package: { dependencies: { pg: '8.16.3' } } },
        { id: 'database', package: { dependencies: { pg: '9.0.0' } } }
      ]),
    /Conflicting dependency entry "pg".*base.*database/
  );
});

test('rejects conflicting devDependencies and scripts', () => {
  assertGeneration(
    () =>
      mergePackageFragments([
        { id: 'base', package: { devDependencies: { typescript: '5.9.3' } } },
        { id: 'type', package: { devDependencies: { typescript: '5.8.0' } } }
      ]),
    /Conflicting devDependency entry "typescript"/
  );
  assertGeneration(
    () =>
      mergePackageFragments([
        { id: 'base', package: { scripts: { dev: 'stackpress serve' } } },
        { id: 'type', package: { scripts: { dev: 'stackpress serve --watch' } } }
      ]),
    /Conflicting script entry "dev"/
  );
});

test('accepts identical package entries from multiple fragments', () => {
  const merged = mergePackageFragments([
    { id: 'base', package: { dependencies: { pg: '8.16.3' } } },
    { id: 'database', package: { dependencies: { pg: '8.16.3' } } }
  ]);
  assert.deepEqual(merged.dependencies, { pg: '8.16.3' });
});

test('renders deterministic package.json fields', () => {
  const packageJson = renderPackageJson(
    { packageName: 'demo-app' },
    {
      dependencies: { zod: '4.1.0', '@stackpress/inquire-pg': '0.10.8' },
      devDependencies: { typescript: '5.9.3' },
      scripts: { dev: 'stackpress serve', build: 'stackpress build' },
      plugins: ['./plugins/store/plugin', './plugins/app/plugin']
    }
  );

  assert.deepEqual(packageJson, {
    name: 'demo-app',
    private: true,
    type: 'module',
    engines: { node: '>=22' },
    scripts: { build: 'stackpress build', dev: 'stackpress serve' },
    dependencies: {
      '@stackpress/inquire-pg': '0.10.8',
      zod: '4.1.0'
    },
    devDependencies: { typescript: '5.9.3' },
    plugins: ['./plugins/app/plugin', './plugins/store/plugin']
  });
  assert.deepEqual(Object.keys(packageJson), [
    'name',
    'private',
    'type',
    'engines',
    'scripts',
    'dependencies',
    'devDependencies',
    'plugins'
  ]);
});

test('renders allowlisted tokens in package values', () => {
  const packageJson = renderPackageJson(
    { packageName: 'demo-app' },
    {
      scripts: { dev: 'stackpress serve --name {{name}} --type {{type}}' },
      plugins: ['./plugins/{{type}}/plugin']
    },
    { name: 'demo-app', type: 'api-only' }
  );

  assert.deepEqual(packageJson.scripts, {
    dev: 'stackpress serve --name demo-app --type api-only'
  });
  assert.deepEqual(packageJson.plugins, ['./plugins/api-only/plugin']);
});

test('omits empty optional package sections', () => {
  const packageJson = renderPackageJson({ packageName: 'blank-app' }, {});
  assert.deepEqual(packageJson, {
    name: 'blank-app',
    private: true,
    type: 'module',
    engines: { node: '>=22' }
  });
});

test('validates package data before merging', () => {
  assertGeneration(
    () =>
      mergePackageFragments([
        {
          id: 'base',
          package: { scripts: { 'bad script': 'echo nope' } }
        }
      ]),
    /invalid script name/
  );
  assert.throws(
    () => renderPackageJson({ packageName: '' }, {}),
    (error: unknown) => error instanceof CliError && error.code === 'USAGE'
  );
});
